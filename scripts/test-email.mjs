import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { Client } from "pg";
import handler from "../server/handler.ts";
import {
  connectionOptions,
  transaction,
  closeDatabase,
} from "../server/database.ts";
import {
  issueEmailToken,
  consumeEmailToken,
  flushEmails,
  adminEmail,
} from "../server/email.ts";
import { unseal } from "../server/connector-security.ts";
import {
  hashPassword,
  newToken,
  tokenHash,
  verifyPassword,
} from "../server/security.ts";
process.loadEnvFile(".env.local");
process.env.DRIVEVISION_CONNECTOR_KEY ||= Buffer.alloc(32, 42).toString("base64");
process.env.DRIVEVISION_RESEND_API_KEY = "re_test_only_not_real";
const admin = new Client(connectionOptions(true));
await admin.connect();
const owner = randomUUID(),
  email = `delivered+${owner}@resend.dev`,
  password = "Email-test-password-2026";
const http = createServer(handler);
await new Promise((r) => http.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${http.address().port}`;
process.env.DRIVEVISION_APP_ORIGIN = base;
const realFetch = globalThis.fetch;
let sent = [],
  failure = 0;
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith(base)) return realFetch(url, init);
  assert.equal(String(url), "https://api.resend.com/emails");
  assert.ok(init.headers.Authorization === "Bearer re_test_only_not_real");
  sent.push({
    body: JSON.parse(init.body),
    key: init.headers["Idempotency-Key"],
  });
  return new Response(
    JSON.stringify(failure ? { message: "fixture" } : { id: randomUUID() }),
    { status: failure || 200 },
  );
};
async function issue(purpose) {
  return transaction("", async (c) => {
    await issueEmailToken(c, owner, purpose);
    const row = (
      await c.query(
        "select * from drivevision.email_outbox where owner_id=$1 order by created_at desc limit 1",
        [owner],
      )
    ).rows[0];
    await c.query(
      "update drivevision.email_outbox set retry_at='infinity' where id=$1",
      [row.id],
    );
    const msg = unseal(row.encrypted_payload, `drivevision:email:${row.id}`);
    const link = msg.text.match(/http[^\s]+/)[0];
    return {
      row,
      msg,
      token: new URLSearchParams(new URL(link).hash.slice(1)).get("token"),
    };
  });
}
async function request(path, body, cookie, origin = base) {
  const r = await fetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      "X-Forwarded-For": `192.0.2.${Math.floor(Math.random() * 200)}`,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, data: await r.json() };
}
try {
  await admin.query(
    "insert into drivevision.accounts(id,name,email,password_hash,email_verified_at) values($1,$2,$3,$4,null)",
    [owner, "João <teste>", email, await hashPassword(password)],
  );
  const verify = await issue("verify");
  assert.ok(verify.msg.html.includes("João &lt;teste&gt;"));
  assert.ok(!verify.row.encrypted_payload.includes(verify.token));
  await assert.rejects(
    consumeEmailToken({ token: verify.token, password }, "reset"),
  );
  await consumeEmailToken({ token: verify.token }, "verify");
  await assert.rejects(consumeEmailToken({ token: verify.token }, "verify"));
  assert.ok(
    (
      await admin.query(
        "select email_verified_at from drivevision.accounts where id=$1",
        [owner],
      )
    ).rows[0].email_verified_at,
  );
  console.log(
    "PASS verification, escaped message, token encryption, purpose separation and replay rejection",
  );
  const first = await issue("reset"),
    second = await issue("reset");
  await assert.rejects(
    consumeEmailToken({ token: first.token, password }, "reset"),
  );
  await admin.query(
    "update drivevision.email_tokens set expires_at=now()-interval '1 second' where token_hash=$1",
    [tokenHash(second.token)],
  );
  await assert.rejects(
    consumeEmailToken({ token: second.token, password }, "reset"),
  );
  const reset = await issue("reset"),
    session = newToken();
  await admin.query(
    "insert into drivevision.sessions(token_hash,user_id,expires_at) values($1,$2,now()+interval '1 hour')",
    [tokenHash(session), owner],
  );
  assert.equal(
    (
      await request(
        "/api/email/reset",
        { token: reset.token, password: "New-secure-password-2026" },
        undefined,
        "https://foreign.invalid",
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request("/api/email/reset", {
        token: reset.token,
        password: "New-secure-password-2026",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await admin.query(
        "select count(*)::int as n from drivevision.sessions where user_id=$1",
        [owner],
      )
    ).rows[0].n,
    0,
  );
  assert.ok(
    await verifyPassword(
      "New-secure-password-2026",
      (
        await admin.query(
          "select password_hash from drivevision.accounts where id=$1",
          [owner],
        )
      ).rows[0].password_hash,
    ),
  );
  assert.equal(
    (
      await request("/api/email/reset", {
        token: reset.token,
        password: "Another-password-2026",
      })
    ).status,
    400,
  );
  console.log(
    "PASS rotation, expiration, cross-origin rejection, password update and session revocation",
  );
  const delivery = await issue("verify");
  failure = 503;
  await admin.query(
    "update drivevision.email_outbox set retry_at=now() where id=$1",
    [delivery.row.id],
  );
  await flushEmails(1, owner);
  assert.equal(
    (
      await admin.query(
        "select state from drivevision.email_outbox where id=$1",
        [delivery.row.id],
      )
    ).rows[0].state,
    "pending",
  );
  failure = 0;
  await admin.query(
    "update drivevision.email_outbox set retry_at=now() where id=$1",
    [delivery.row.id],
  );
  await flushEmails(1, owner);
  assert.equal(sent.at(-1).key, sent.at(-2).key);
  assert.deepEqual(sent.at(-1).body, sent.at(-2).body);
  const done = (
    await admin.query(
      "select state,encrypted_payload,provider_id from drivevision.email_outbox where id=$1",
      [delivery.row.id],
    )
  ).rows[0];
  assert.equal(done.state, "sent");
  assert.equal(done.encrypted_payload, null);
  assert.ok(done.provider_id);
  const count = sent.length;
  await flushEmails(1, owner);
  assert.equal(sent.length, count);
  console.log(
    "PASS temporary failure, durable retry, stable idempotency, one delivery and payload removal",
  );
  await assert.rejects(adminEmail(owner));
  const known = await request("/api/email/recover", { email });
  const unknown = await request("/api/email/recover", {
    email: `missing-${randomUUID()}@resend.dev`,
  });
  assert.deepEqual(known, unknown);
  assert.equal((await request("/api/admin/email")).status, 401);
  console.log(
    "PASS neutral recovery response and private administrator monitoring",
  );
} finally {
  globalThis.fetch = realFetch;
  await admin.query("delete from drivevision.accounts where id=$1", [owner]);
  await new Promise((r) => http.close(r));
  await closeDatabase();
  await admin.end();
}
