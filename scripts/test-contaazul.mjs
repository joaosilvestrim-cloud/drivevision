import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, extname, sep } from "node:path";
import { Client } from "pg";
import handler from "../server/handler.ts";
import {
  connectionOptions,
  transaction,
  database,
  closeDatabase,
} from "../server/database.ts";
import { hashPassword, newToken, tokenHash } from "../server/security.ts";
import { unseal } from "../server/connector-security.ts";
import { caRow, caPage, caWindows } from "../server/contaazul-provider.ts";
import { syncBinding, syncDue } from "../server/cloud-sync.ts";
process.loadEnvFile(".env.local");
process.env.DRIVEVISION_CONNECTOR_KEY = randomBytes(32).toString("base64");
process.env.DRIVEVISION_CONTAAZUL_CLIENT_ID = "fixture-client";
process.env.DRIVEVISION_CONTAAZUL_CLIENT_SECRET = "fixture-secret";
delete process.env.DRIVEVISION_APP_ORIGIN;
delete process.env.CRON_SECRET;
const realFetch = globalThis.fetch,
  owners = [];
let mode = "ok",
  tokenCalls = 0,
  queries = 0,
  paid = 25;
const today = new Date().toLocaleDateString("en-CA", {
  timeZone: "America/Sao_Paulo",
});
const jwt =
  "fixture." +
  Buffer.from(JSON.stringify({ sub: "fixture-company" })).toString(
    "base64url",
  ) +
  ".signature";
globalThis.fetch = async (input, init) => {
  const u = new URL(String(input));
  if (u.hostname === "127.0.0.1") return realFetch(input, init);
  assert.equal(u.origin, "https://api-v2.contaazul.com");
  if (u.pathname === "/oauth/token") {
    tokenCalls++;
    assert.equal(
      init.headers.Authorization,
      "Basic " +
        Buffer.from("fixture-client:fixture-secret").toString("base64"),
    );
    return Response.json({
      access_token: jwt,
      refresh_token: "rotating-" + tokenCalls,
      expires_in: 3600,
    });
  }
  queries++;
  if (mode === "error")
    return new Response("sensitive-provider-message fixture-secret", {
      status: 503,
    });
  const active =
    u.searchParams.get("data_vencimento_de") <= today &&
    u.searchParams.get("data_vencimento_ate") >= today;
  const rows = active
    ? [
        {
          id: "shared-id",
          data_vencimento: today,
          descricao: "Parcela teste",
          status: "PENDING",
          total: 100,
          pago: paid,
          nao_pago: 100 - paid,
          cliente: { nome: "Cliente QA" },
        },
      ]
    : [];
  return Response.json({ itens_totais: rows.length, itens: rows });
};
const pool = database(),
  originalQuery = pool.query;
pool.query = function (q, ...args) {
  if (
    typeof q === "string" &&
    q.startsWith("select encrypted_value from drivevision.platform_settings")
  )
    return Promise.resolve({ rows: [], rowCount: 0 });
  if (
    typeof q === "string" &&
    q.startsWith(
      "select s.binding_id,s.owner_id from drivevision.cloud_schedule s",
    )
  ) {
    return originalQuery.call(
      this,
      q.replace(
        "order by s.due_at limit 3",
        "and s.owner_id=any($1::uuid[]) order by s.due_at limit 3",
      ),
      [owners],
    );
  }
  return originalQuery.call(this, q, ...args);
};
const browser = process.argv.includes("--browser"),
  root = resolve("dist-preview");
const http = createServer((req, res) => {
  if (req.url.startsWith("/api/")) return void handler(req, res);
  if (!browser) {
    res.writeHead(404);
    return res.end();
  }
  let file = resolve(
    root,
    "." + decodeURIComponent(new URL(req.url, "http://localhost").pathname),
  );
  if (!file.startsWith(root + sep) || !existsSync(file) || !extname(file))
    file = resolve(root, "index.html");
  res.setHeader(
    "Content-Type",
    {
      ".js": "application/javascript",
      ".css": "text/css",
      ".png": "image/png",
      ".svg": "image/svg+xml",
      ".html": "text/html",
    }[extname(file)] || "application/octet-stream",
  );
  res.end(readFileSync(file));
});
await new Promise((r) => http.listen(browser ? 5187 : 0, "127.0.0.1", r));
const base = "http://127.0.0.1:" + http.address().port;
const admin = new Client(connectionOptions(true));
await admin.connect();
async function account() {
  const id = randomUUID(),
    token = newToken();
  owners.push(id);
  await transaction(id, async (c) => {
    await c.query(
      "insert into drivevision.accounts(id,email,name,password_hash) values($1,$2,$3,$4)",
      [
        id,
        "qa-" + id + "@drivevision.invalid",
        "QA Conta Azul",
        await hashPassword(randomUUID()),
      ],
    );
    await c.query(
      "insert into drivevision.workspaces(id,owner_id,name) values($1,$2,$3)",
      [randomUUID(), id, "QA Conta Azul"],
    );
    await c.query(
      "insert into drivevision.sessions(token_hash,user_id,expires_at) values($1,$2,now()+interval '1 hour')",
      [tokenHash(token), id],
    );
  });
  return { id, cookie: "drivevision_session=" + token };
}
async function req(path, a, body, origin = base) {
  const r = await realFetch(base + "/api/" + path, {
    method: body ? "POST" : "GET",
    headers: {
      Origin: origin,
      ...(a ? { Cookie: a.cookie } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  return {
    status: r.status,
    location: r.headers.get("location"),
    data: r.status === 303 ? null : await r.json(),
  };
}
async function connect(a) {
  const r = await req("connectors/contaazul/start", a, { label: "Empresa QA" });
  assert.equal(r.status, 200);
  const url = new URL(r.data.url);
  assert.equal(url.origin, "https://login.contaazul.com");
  const params = new URLSearchParams(url.hash.split("?")[1]);
  assert.equal(
    params.get("redirect_uri"),
    base + "/api/connectors/callback/contaazul",
  );
  return (
    "connectors/callback/contaazul?code=fixture-code&state=" +
    params.get("state")
  );
}
const options = {
  dataset: "contaazul-financial",
  periodDays: 90,
  daily: { time: "07:00", timeZone: "America/Sao_Paulo" },
};
async function payload(a) {
  return (
    await transaction(a.id, async (c) =>
      c.query(
        "select s.payload from drivevision.sources s join drivevision.workspaces w on w.id=s.workspace_id where w.owner_id=$1",
        [a.id],
      ),
    )
  ).rows[0]?.payload;
}
async function finish(a, id) {
  for (let i = 0; i < 20; i++) {
    const r = await syncBinding(a.id, id);
    if (!r.pending) return r;
  }
  throw Error("Import did not finish");
}
try {
  assert.equal(
    caWindows(30, new Date("2026-10-02T12:00:00Z"))[0][0],
    "2026-09-03",
  );
  assert.throws(() => caPage({ unexpected: [] }, 1));
  assert.throws(() => caPage({ itens_totais: 2, itens: [] }, 1));
  assert.throws(() =>
    caRow(
      {
        id: "a",
        data_vencimento: today,
        total: 100,
        pago: null,
        nao_pago: 100,
      },
      "receber",
      today,
    ),
  );
  assert.equal(
    caRow(
      {
        id: "a",
        data_vencimento: "2026-01-01",
        total: 100,
        pago: 25,
        nao_pago: 75,
        status: "CANCELED",
      },
      "receber",
      today,
    )["A receber"],
    "0",
  );
  const a = await account(),
    b = await account();
  assert.equal(
    (await req("connectors/contaazul/start", null, { label: "QA" })).status,
    401,
  );
  assert.equal(
    (
      await req(
        "connectors/contaazul/start",
        a,
        { label: "QA" },
        "https://attacker.invalid",
      )
    ).status,
    403,
  );
  const callback = await connect(a);
  assert.equal((await req(callback, b)).status, 303);
  assert.equal(tokenCalls, 0, "Cross-owner state never reaches token endpoint");
  const done = await req(callback, a);
  assert.equal(done.status, 303);
  assert.match(done.location, /connection=contaazul/);
  assert.equal(tokenCalls, 1);
  await req(callback, a);
  assert.equal(tokenCalls, 1, "OAuth state cannot be replayed");
  let state = (await req("connectors", a)).data;
  assert.equal(state.contaAzulConfigured, true);
  const conn = state.connections[0];
  const encrypted = (
    await admin.query(
      "select tokens from drivevision.cloud_connections where id=$1",
      [conn.id],
    )
  ).rows[0].tokens;
  assert.ok(!encrypted.includes("rotating"));
  assert.equal(unseal(encrypted, a.id).refresh_token, "rotating-1");
  assert.throws(() => unseal(encrypted, b.id));
  await req(await connect(a), a);
  assert.equal((await req("connectors", a)).data.connections.length, 1);
  console.log(
    "PASS auth, CSRF, single-use state, cross-owner callback rejection, encryption and reconnection",
  );
  assert.equal(
    (
      await req("connectors/contaazul/watch", b, {
        connectionId: conn.id,
        name: "Financeiro",
        options,
      })
    ).status,
    404,
  );
  const watch = await req("connectors/contaazul/watch", a, {
    connectionId: conn.id,
    name: "Financeiro QA",
    options,
  });
  assert.equal(watch.status, 200);
  const id = watch.data.id;
  assert.equal(
    (await req("connectors/contaazul/progress", b, { id })).status,
    404,
  );
  assert.equal((await syncBinding(a.id, id)).pending, true);
  assert.equal(await payload(a), undefined, "No partial source published");
  const job = (
    await admin.query(
      "select payload from drivevision.contaazul_jobs where binding_id=$1",
      [id],
    )
  ).rows[0];
  assert.ok(!job.payload.includes("Cliente QA"));
  assert.equal(
    (
      await transaction(b.id, (c) =>
        c.query("select * from drivevision.contaazul_jobs"),
      )
    ).rowCount,
    0,
    "Job RLS isolation",
  );
  mode = "error";
  await assert.rejects(() => syncBinding(a.id, id), /preservados/);
  assert.equal(await payload(a), undefined);
  mode = "ok";
  await finish(a, id);
  const source = await payload(a);
  assert.equal(source.rows.length, 2);
  assert.equal(
    source.rows.reduce((n, r) => n + Number(r["A receber"]), 0),
    75,
  );
  assert.equal(
    source.rows.reduce((n, r) => n + Number(r["A pagar"]), 0),
    75,
  );
  const dashboards = await transaction(a.id, (c) =>
    c.query(
      "select d.payload from drivevision.dashboards d join drivevision.workspaces w on w.id=d.workspace_id where w.owner_id=$1",
      [a.id],
    ),
  );
  assert.equal(dashboards.rowCount, 1);
  assert.ok(dashboards.rows[0].payload.config.visuals.length >= 6);
  assert.equal(
    (
      await admin.query(
        "select * from drivevision.contaazul_jobs where binding_id=$1",
        [id],
      )
    ).rowCount,
    0,
  );
  console.log(
    "PASS resumable checkpoints, failure recovery, complete publication and financial starter dashboard",
  );
  mode = "error";
  await assert.rejects(() => syncBinding(a.id, id));
  assert.deepEqual((await payload(a)).rows, source.rows);
  mode = "ok";
  paid = 50;
  const beforeRefresh = tokenCalls;
  await admin.query(
    "update drivevision.cloud_connections set expires_at=now()-interval '1 day' where id=$1",
    [conn.id],
  );
  const results = await Promise.allSettled([
    syncBinding(a.id, id),
    syncBinding(a.id, id),
  ]);
  assert.equal(results.filter((r) => r.status === "rejected").length, 1);
  assert.equal(tokenCalls, beforeRefresh + 1);
  await finish(a, id);
  assert.equal((await payload(a)).rows.length, 2);
  assert.equal(
    (await payload(a)).rows.reduce((n, r) => n + Number(r["A receber"]), 0),
    50,
  );
  assert.equal(
    (await req("connectors/contaazul/progress", a, { id })).data.status,
    "ready",
  );
  assert.equal(
    (await req("connectors/history", a, { id })).data.runs.some((r) =>
      r.message.includes("fixture-secret"),
    ),
    false,
  );
  console.log(
    "PASS refresh rotation, concurrent lease, stable source IDs, no duplicates and sanitized failures",
  );
  await req("connectors/contaazul/watch", a, {
    connectionId: conn.id,
    name: "Financeiro QA",
    options,
  });
  assert.equal(
    (await req("connectors/contaazul/progress", a, { id })).data.status,
    "pending",
  );
  await syncDue();
  assert.ok(
    (await req("connectors/contaazul/progress", a, { id })).data.completed > 0,
  );
  await finish(a, id);
  await req("connectors/update", a, { id, paused: true, interval: 1440 });
  await admin.query(
    "update drivevision.cloud_schedule set due_at=now() where binding_id=$1",
    [id],
  );
  const before = queries;
  await syncDue();
  assert.equal(queries, before);
  await req("connectors/update", a, { id, paused: false, interval: 1440 });
  console.log(
    "PASS cron advances unfinished loads without browser; paused jobs do not call provider",
  );
  if (browser) {
    writeFileSync(
      "work/contaazul-qa-session.json",
      JSON.stringify({
        cookie: a.cookie,
        owner: a.id,
        base,
        binding: id,
        connection: conn.id,
      }),
    );
    console.log("QA browser ready " + base);
    await new Promise((r) => {
      process.once("SIGINT", r);
      process.once("SIGTERM", r);
    });
  }
  await req("connectors/disconnect", a, { id: conn.id });
  assert.equal((await req("connectors", a)).data.connections.length, 0);
  assert.equal((await payload(a)).id, source.id);
  console.log(
    "PASS disconnect removes connection/jobs but retains imported source",
  );
} finally {
  globalThis.fetch = realFetch;
  pool.query = originalQuery;
  for (const id of owners) {
    await admin.query("delete from drivevision.workspaces where owner_id=$1", [
      id,
    ]);
    await admin.query(
      "delete from drivevision.accounts where id=$1 and email like 'qa-%@drivevision.invalid'",
      [id],
    );
  }
  await admin.end();
  await closeDatabase();
  await new Promise((r) => http.close(r));
}
