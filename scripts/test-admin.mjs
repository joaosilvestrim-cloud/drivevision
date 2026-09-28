import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { Client } from "pg";
import handler from "../server/handler.ts";
import {
  connectionOptions,
  database,
  transaction,
  closeDatabase,
} from "../server/database.ts";
import { createAccountInvitation } from "../server/invitations.ts";
import { newToken, tokenHash } from "../server/security.ts";
process.loadEnvFile(".env.local");
const admin = new Client(connectionOptions(true));
await admin.connect();
const server = createServer(handler);
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
process.env.DRIVEVISION_APP_ORIGIN = base;
const ids = [],
  run = randomUUID();
const ip = `198.19.${Math.floor(Math.random() * 254)}.${Math.floor(Math.random() * 254)}`;
async function request(path, body, cookie, origin = base) {
  const response = await fetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      "X-Forwarded-For": ip,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  const data = JSON.parse(
    response.headers.get("x-drivevision-encoding") === "gzip"
      ? gunzipSync(bytes).toString()
      : bytes.toString(),
  );
  return {
    status: response.status,
    data,
    cookie: response.headers.get("set-cookie")?.split(";")[0],
  };
}
async function seed(name) {
  const value = await createAccountInvitation(
    name,
    `qa-${randomUUID()}@drivevision.invalid`,
  );
  ids.push(value.id);
  const token = newToken();
  await admin.query(
    "insert into drivevision.sessions(token_hash,user_id,expires_at) values($1,$2,now()+interval '1 hour')",
    [tokenHash(token), value.id],
  );
  return { ...value, cookie: `drivevision_session=${token}` };
}
try {
  const operator = await seed("QA operator"),
    ordinary = await seed("QA ordinary");
  await admin.query(
    "insert into drivevision.platform_admins(account_id) values($1)",
    [operator.id],
  );
  assert.equal(
    (await request("/api/session", undefined, operator.cookie)).data.user
      .superAdmin,
    true,
  );
  assert.equal(
    (await request("/api/session", undefined, ordinary.cookie)).data.user
      .superAdmin,
    false,
  );
  assert.equal((await request("/api/admin/clients")).status, 401);
  assert.equal(
    (await request("/api/admin/clients", undefined, ordinary.cookie)).status,
    403,
  );
  assert.equal(
    (
      await request(
        "/api/admin/clients",
        { name: "Forged", superAdmin: true },
        ordinary.cookie,
      )
    ).status,
    403,
  );
  await assert.rejects(
    transaction(ordinary.id, (c) =>
      c.query(
        "insert into drivevision.platform_admins(account_id) values($1)",
        [ordinary.id],
      ),
    ),
    (e) => e.code === "42501",
  );
  console.log(
    "PASS superadmin authorization is checked server-side; runtime cannot self-promote",
  );
  const payload = {
    name: `QA tenant ${run}`,
    contact: "Cliente QA",
    email: `qa-${randomUUID()}@drivevision.invalid`,
    plan: "Piloto",
  };
  assert.equal(
    (
      await request(
        "/api/admin/clients",
        payload,
        operator.cookie,
        "https://foreign.invalid",
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        "/api/admin/clients",
        { ...payload, superAdmin: true },
        operator.cookie,
      )
    ).status,
    400,
  );
  const created = await request("/api/admin/clients", payload, operator.cookie);
  assert.equal(created.status, 200, JSON.stringify(created.data));
  ids.push(created.data.id);
  assert.ok(created.data.invitationUrl.startsWith(base + "/#activate="));
  const duplicate = await request(
    "/api/admin/clients",
    payload,
    operator.cookie,
  );
  assert.equal(duplicate.status, 409);
  assert.equal(
    (
      await admin.query(
        "select count(*)::int n from drivevision.workspaces where owner_id=$1",
        [created.data.id],
      )
    ).rows[0].n,
    1,
  );
  const listing = await request(
    `/api/admin/clients?q=${encodeURIComponent(run)}`,
    undefined,
    operator.cookie,
  );
  assert.equal(listing.data.clients.length, 1);
  assert.equal(JSON.stringify(listing.data).includes("setup:"), false);
  assert.equal(
    (
      await transaction(ordinary.id, (c) =>
        c.query("select id from drivevision.clients where id=$1", [
          created.data.id,
        ]),
      )
    ).rowCount,
    0,
  );
  assert.equal(
    (
      await transaction(operator.id, (c) =>
        c.query("select id from drivevision.workspaces where owner_id=$1", [
          created.data.id,
        ]),
      )
    ).rowCount,
    0,
  );
  console.log(
    "PASS atomic provisioning, duplicate rejection, strict input, CSRF, and tenant isolation (including operator datasets)",
  );
  const id = created.data.id,
    firstToken = created.data.invitationUrl.split("=")[1];
  const reissued = await request(
    "/api/admin/clients/invite",
    { id, revision: 0 },
    operator.cookie,
  );
  assert.equal(reissued.status, 200);
  const password = `QA-${randomUUID()}`;
  assert.equal(
    (await request("/api/activate", { token: firstToken, password })).status,
    401,
  );
  const activated = await request("/api/activate", {
    token: reissued.data.invitationUrl.split("=")[1],
    password,
  });
  assert.equal(activated.status, 200);
  assert.equal(activated.data.user.superAdmin, false);
  assert.equal(
    (
      await request(
        "/api/admin/clients/invite",
        { id, revision: 1 },
        operator.cookie,
      )
    ).status,
    409,
  );
  assert.equal(
    (await request("/api/admin/clients", undefined, activated.cookie)).status,
    403,
  );
  const update = {
    id,
    revision: 1,
    name: payload.name,
    plan: "Piloto",
    status: "suspended",
  };
  const concurrent = await Promise.all([
    request("/api/admin/clients/update", update, operator.cookie),
    request("/api/admin/clients/update", update, operator.cookie),
  ]);
  assert.deepEqual(concurrent.map((r) => r.status).sort(), [200, 409]);
  assert.equal(
    (await request("/api/workspace", undefined, activated.cookie)).status,
    401,
  );
  assert.equal(
    (await request("/api/login", { email: payload.email, password })).status,
    401,
  );
  // Direct role test bypasses transaction helper, exercising restrictive RLS itself.
  const raw = await database().connect();
  try {
    await raw.query("begin");
    await raw.query("select set_config('drivevision.user_id',$1,true)", [id]);
    assert.equal(
      (await raw.query("select id from drivevision.workspaces")).rowCount,
      0,
    );
    await raw.query("rollback");
  } finally {
    raw.release();
  }
  await assert.rejects(
    transaction(id, async () => true),
    (e) => e.status === 401,
  );
  assert.equal(
    (
      await request(
        "/api/admin/clients/update",
        { ...update, revision: 2, status: "active" },
        operator.cookie,
      )
    ).status,
    200,
  );
  const logged = await request("/api/login", {
    email: payload.email,
    password,
  });
  assert.equal(logged.status, 200);
  assert.equal(
    (await request("/api/workspace", undefined, logged.cookie)).status,
    200,
  );
  console.log(
    "PASS invitation rotation/activation, concurrency conflicts, suspension, RLS enforcement, and reactivation",
  );
  const protect = await request(
    "/api/admin/clients/update",
    {
      id: operator.id,
      revision: 0,
      name: "Operator",
      plan: "Manual",
      status: "suspended",
    },
    operator.cookie,
  );
  assert.equal(protect.status, 403);
  const audit = await request(
    `/api/admin/audit?id=${id}`,
    undefined,
    operator.cookie,
  );
  assert.equal(audit.data.events.length, 4);
  assert.equal(JSON.stringify(audit.data).includes("invitationUrl"), false);
  assert.equal(
    (await request(`/api/admin/audit?id=${id}`, undefined, ordinary.cookie))
      .status,
    403,
  );
  // 26 clients in one QA-owned transaction exercises pagination without a product count cap.
  for (let i = 0; i < 26; i++) {
    const row = await seed(`QA page ${run} ${i}`);
  }
  const p1 = await request(
    `/api/admin/clients?q=${encodeURIComponent("QA page " + run)}`,
    undefined,
    operator.cookie,
  );
  const p2 = await request(
    `/api/admin/clients?q=${encodeURIComponent("QA page " + run)}&page=2`,
    undefined,
    operator.cookie,
  );
  assert.equal(p1.data.clients.length, 25);
  assert.equal(p2.data.clients.length, 1);
  assert.equal(p1.data.counts.total, 26);
  assert.equal(
    new Set([...p1.data.clients, ...p2.data.clients].map((c) => c.id)).size,
    26,
  );
  console.log(
    "PASS admin-account protection, immutable private audit, and paginated customer creation",
  );
} finally {
  for (const id of ids) {
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
