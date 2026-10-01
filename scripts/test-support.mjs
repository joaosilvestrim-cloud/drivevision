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
import { newToken, tokenHash } from "../server/security.ts";
import { flushEmails } from "../server/email.ts";
process.loadEnvFile(".env.local");
process.env.DRIVEVISION_CONNECTOR_KEY = Buffer.alloc(32, 31).toString("base64");
process.env.DRIVEVISION_RESEND_API_KEY = "re_support_test_only";
const db = new Client(connectionOptions(true));
await db.connect();
const http = createServer(handler);
await new Promise((r) => http.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${http.address().port}`;
process.env.DRIVEVISION_APP_ORIGIN = base;
const realFetch = globalThis.fetch,
  owners = [],
  tickets = [],
  sent = [];
let fail = false,
  delivery = "delivered";
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith(base)) return realFetch(url, init);
  if (String(url).startsWith("https://api.resend.com/emails/"))
    return new Response(JSON.stringify({ last_event: delivery }), {
      status: 200,
    });
  assert.equal(String(url), "https://api.resend.com/emails");
  sent.push({
    body: JSON.parse(init.body),
    key: init.headers["Idempotency-Key"],
  });
  return new Response(
    JSON.stringify(fail ? { error: "fixture" } : { id: randomUUID() }),
    { status: fail ? 500 : 200 },
  );
};
let requestNumber = 0;
async function req(path, body, cookie, origin = base) {
  const r = await fetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      "X-Forwarded-For": `198.18.${Math.floor(Math.random() * 254)}.${++requestNumber % 254}`,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, data: await r.json() };
}
async function seed(admin = false) {
  const id = randomUUID();
  owners.push(id);
  await db.query(
    "insert into drivevision.accounts(id,email,name,password_hash) values($1,$2,'QA suporte','test-only')",
    [id, `qa-${id}@drivevision.invalid`],
  );
  if (admin)
    await db.query(
      "insert into drivevision.platform_admins(account_id) values($1)",
      [id],
    );
  else
    await db.query(
      "insert into drivevision.billing_accounts(owner_id,terms_version) values($1,'qa')",
      [id],
    );
  const token = newToken();
  await db.query(
    "insert into drivevision.sessions(token_hash,user_id,expires_at) values($1,$2,now()+interval '1 hour')",
    [tokenHash(token), id],
  );
  return { id, cookie: `drivevision_session=${token}` };
}
const payload = () => ({
  requestId: randomUUID(),
  name: "QA Visitante",
  email: "visitor@drivevision.invalid",
  company: "Teste isolado",
  phone: "",
  category: "dados",
  priority: "alta",
  subject: "QA: importação de planilha",
  description: "Teste automático controlado do atendimento, sem dados reais.",
  steps: "Abrir fontes",
  expected: "Importar",
  page: "studio",
  consent: true,
  website: "",
});
try {
  const a = await seed(),
    b = await seed(),
    operator = await seed(true);
  assert.equal(
    (await req("/api/support", { ...payload(), consent: false })).status,
    400,
  );
  assert.equal(
    (await req("/api/support", payload(), null, "https://evil.invalid")).status,
    403,
  );
  assert.equal(
    (await req("/api/support", { ...payload(), website: "bot" })).status,
    400,
  );
  assert.equal(
    (await req("/api/admin/support", undefined, a.cookie)).status,
    403,
  );
  console.log("PASS consent, honeypot, origin and administrator authorization");
  const form = payload(),
    pub = await req("/api/support", form);
  assert.equal(pub.status, 201, JSON.stringify(pub));
  tickets.push(pub.data.id);
  assert.deepEqual(
    sent
      .slice(-2)
      .map((m) => m.body.to[0])
      .sort(),
    ["joaosilvestrim@drivedata.com", "tamirescavani@drivedata.com"],
  );
  assert.ok(sent.every((m) => !m.body.text.includes(form.description)));
  assert.equal((await req("/api/support", form)).status, 409);
  assert.equal((await req("/api/support?id=" + pub.data.id)).status, 401);
  assert.equal(
    (await req("/api/support?id=" + pub.data.id, undefined, a.cookie)).status,
    404,
  );
  console.log(
    "PASS public creation, fixed notification recipients, duplicate prevention and private details",
  );
  fail = true;
  const mine = await req("/api/support", payload(), a.cookie);
  assert.equal(mine.status, 201, JSON.stringify(mine));
  tickets.push(mine.data.id);
  const pending = await db.query(
    "select state,encrypted_payload from drivevision.email_outbox where starts_with(dedupe_key,$1)",
    [`support:${mine.data.id}:`],
  );
  assert.equal(pending.rowCount, 2);
  assert.ok(
    pending.rows.every(
      (r) =>
        r.state === "pending" &&
        !r.encrypted_payload.includes("Teste automático"),
    ),
  );
  fail = false;
  await db.query(
    "update drivevision.email_outbox set retry_at=now() where starts_with(dedupe_key,$1)",
    [`support:${mine.data.id}:`],
  );
  await flushEmails(2, undefined, `support:${mine.data.id}:`);
  assert.equal(
    (await req("/api/support", undefined, a.cookie)).data.tickets.length,
    1,
  );
  assert.equal(
    (await req("/api/support?id=" + mine.data.id, undefined, b.cookie)).status,
    404,
  );
  assert.equal(
    (
      await req(
        "/api/support/reply",
        { id: mine.data.id, revision: 0, body: "Tentando ler outra conta" },
        b.cookie,
      )
    ).status,
    404,
  );
  console.log(
    "PASS unpaid customer help, encrypted durable retry, tenant isolation",
  );
  const detail = (
    await req(
      "/api/admin/support?id=" + mine.data.id,
      undefined,
      operator.cookie,
    )
  ).data;
  assert.equal(detail.ticket.email, `qa-${a.id}@drivevision.invalid`);
  assert.equal(
    (
      await req(
        "/api/admin/support",
        {
          id: mine.data.id,
          revision: 0,
          body: "Confira o cabeçalho e tente novamente.",
          status: "waiting",
        },
        operator.cookie,
      )
    ).status,
    200,
  );
  const received = (
    await req("/api/support?id=" + mine.data.id, undefined, a.cookie)
  ).data;
  assert.equal(received.messages[0].staff, true);
  assert.equal(received.ticket.status, "waiting");
  assert.equal(
    (
      await req(
        "/api/support/reply",
        { id: mine.data.id, revision: 0, body: "Mensagem desatualizada" },
        a.cookie,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await req(
        "/api/support/reply",
        {
          id: mine.data.id,
          revision: 1,
          body: "Ainda preciso de ajuda",
          status: "resolved",
        },
        a.cookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await req(
        "/api/support/reply",
        {
          id: mine.data.id,
          revision: 1,
          body: "Agora consegui conferir o cabeçalho.",
        },
        a.cookie,
      )
    ).status,
    200,
  );
  await transaction(
    b.id,
    async (c) =>
      assert.equal(
        (
          await c.query(
            "select id from drivevision.support_tickets where id=any($1::uuid[])",
            [tickets],
          )
        ).rowCount,
        0,
      ),
    { allowUnpaid: true },
  );
  await transaction(
    "",
    async (c) =>
      assert.equal(
        (
          await c.query(
            "select id from drivevision.support_tickets where id=any($1::uuid[])",
            [tickets],
          )
        ).rowCount,
        0,
      ),
    { allowUnpaid: true },
  );
  console.log(
    "PASS admin reply, customer history, revision conflicts, forged status and direct RLS isolation",
  );
  assert.equal(
    (await req("/api/admin/support?page=-2", undefined, operator.cookie))
      .status,
    400,
  );
  assert.equal(
    (
      await req(
        "/api/admin/support?status=open&q=QA",
        undefined,
        operator.cookie,
      )
    ).status,
    200,
  );
  delivery = "bounced";
  const bounced = await req(
    "/api/admin/support?id=" + mine.data.id,
    undefined,
    operator.cookie,
  );
  assert.ok(
    bounced.data.notifications.every(
      (n) => n.state === "failed" && n.delivery === "bounced",
    ),
  );
  console.log(
    "PASS provider delivery/bounce visibility in administrator support details",
  );
  console.log("Support checks passed; no real emails sent.");
} finally {
  globalThis.fetch = realFetch;
  for (const id of tickets)
    await db.query(
      "delete from drivevision.email_outbox where starts_with(dedupe_key,$1)",
      [`support:${id}:`],
    );
  await db.query(
    "delete from drivevision.support_tickets where id=any($1::uuid[])",
    [tickets],
  );
  await db.query(
    "delete from drivevision.platform_admins where account_id=any($1::uuid[])",
    [owners],
  );
  await db.query("delete from drivevision.accounts where id=any($1::uuid[])", [
    owners,
  ]);
  await db.end();
  await closeDatabase();
  await new Promise((r) => http.close(r));
}
