import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { Client } from "pg";
import handler from "../server/handler.ts";
import { connectionOptions, closeDatabase } from "../server/database.ts";
import { createAccountInvitation } from "../server/invitations.ts";
import { tokenHash, verifyPassword } from "../server/security.ts";
process.loadEnvFile(".env.local");
const admin = new Client(connectionOptions(true));
await admin.connect();
const server = createServer(handler);
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const created = [];
const ip = `198.19.${Math.floor(Math.random() * 254)}.${Math.floor(Math.random() * 254)}`;
async function request(path, body, origin = base) {
  const r = await fetch(base + path, {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      "X-Forwarded-For": ip,
    },
    body: JSON.stringify(body),
  });
  return {
    status: r.status,
    data: await r.json(),
    cookie: r.headers.get("set-cookie")?.split(";")[0],
  };
}
async function invite() {
  const result = await createAccountInvitation(
    "Teste de ativação",
    `qa-${randomUUID()}@drivevision.invalid`,
  );
  created.push(result.id);
  return result;
}
try {
  const a = await invite(),
    password = `QA-${randomUUID()}`;
  const stored = (
    await admin.query(
      "select password_hash from drivevision.accounts where id=$1",
      [a.id],
    )
  ).rows[0].password_hash;
  assert.equal(stored.includes(a.token), false);
  assert.equal(await verifyPassword(password, stored), false);
  assert.equal(
    (await request("/api/login", { email: a.email, password })).status,
    401,
  );
  console.log(
    "PASS pending account stores only a hashed token and cannot log in with a password",
  );
  assert.equal(
    (
      await request(
        "/api/activate",
        { token: a.token, password },
        "https://untrusted.invalid",
      )
    ).status,
    403,
  );
  assert.equal(
    (await request("/api/activate", { token: a.token, password: "short" }))
      .status,
    400,
  );
  assert.equal(
    (await request("/api/activate", { token: "a".repeat(43), password }))
      .status,
    401,
  );
  console.log(
    "PASS activation rejects foreign origins, short passwords and unknown tokens",
  );
  const concurrent = await Promise.all([
    request("/api/activate", { token: a.token, password }),
    request("/api/activate", { token: a.token, password }),
  ]);
  assert.deepEqual(concurrent.map((r) => r.status).sort(), [200, 401]);
  const success = concurrent.find((r) => r.status === 200);
  assert.equal(success.data.user.id, a.id);
  const session = await fetch(base + "/api/session", {
    headers: { Cookie: success.cookie },
  }).then((r) => r.json());
  assert.equal(session.user.id, a.id);
  const workspace = await fetch(base + "/api/workspace", {
    headers: { Cookie: success.cookie },
  });
  assert.equal(workspace.status, 200);
  assert.equal(
    (await request("/api/activate", { token: a.token, password })).status,
    401,
  );
  assert.equal(
    (await request("/api/login", { email: a.email, password })).status,
    200,
  );
  const after = (
    await admin.query(
      "select password_hash from drivevision.accounts where id=$1",
      [a.id],
    )
  ).rows[0].password_hash;
  assert.equal(await verifyPassword(password, after), true);
  assert.equal(after.includes(password), false);
  console.log(
    "PASS concurrent activation succeeds once, issues a real session and saves a salted password",
  );
  const expired = await invite();
  await admin.query(
    "update drivevision.accounts set password_hash=$1 where id=$2",
    [`setup:${tokenHash(expired.token)}:${Date.now() - 1000}`, expired.id],
  );
  assert.equal(
    (await request("/api/activate", { token: expired.token, password })).status,
    401,
  );
  console.log("PASS expired invitations cannot activate an account");
  await assert.rejects(
    createAccountInvitation("Outra pessoa", a.email),
    (e) => e.code === "23505",
  );
  assert.equal(
    (await request("/api/login", { email: a.email, password })).status,
    200,
  );
  console.log(
    "PASS provisioning an existing email cannot overwrite its password or workspace",
  );
} finally {
  for (const id of created) {
    await admin.query("delete from drivevision.workspaces where owner_id=$1", [
      id,
    ]);
    await admin.query(
      "delete from drivevision.accounts where id=$1 and email like 'qa-%@drivevision.invalid'",
      [id],
    );
  }
  await closeDatabase();
  await admin.end();
  await new Promise((resolve) => server.close(resolve));
}
