import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID, randomBytes } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, extname, sep } from "node:path";
import { Client } from "pg";
import handler from "../server/handler.ts";
import {
  connectionOptions,
  database,
  transaction,
  closeDatabase,
} from "../server/database.ts";
import { hashPassword, newToken, tokenHash } from "../server/security.ts";
import { unseal } from "../server/connector-security.ts";
import { omiePeriod } from "../server/omie-provider.ts";
import { syncDue } from "../server/cloud-sync.ts";
process.loadEnvFile(".env.local");
process.env.DRIVEVISION_CONNECTOR_KEY = randomBytes(32).toString("base64");
delete process.env.DRIVEVISION_APP_ORIGIN;
delete process.env.CRON_SECRET;
const realFetch = globalThis.fetch,
  owners = [];
let mode = "ok",
  value = 100,
  calls = 0;
const credentials = { appKey: "1234567890", appSecret: "fixture-omie-secret" };
const options = {
  dataset: "omie-invoiced-orders",
  periodDays: 90,
  daily: { time: "07:00", timeZone: "America/Sao_Paulo" },
};
globalThis.fetch = async (input, init) => {
  const url = new URL(String(input));
  if (url.hostname === "127.0.0.1") return realFetch(input, init);
  assert.equal(
    url.href,
    "https://app.omie.com.br/api/v1/produtos/pedido/",
    "No unexpected external calls permitted",
  );
  calls++;
  const body = JSON.parse(init.body);
  assert.equal(body.call, "ListarPedidos");
  if (body.app_secret === "invalid-secret" || mode === "invalid")
    return new Response(
      JSON.stringify({
        faultcode: "auth",
        faultstring: "app_secret inválido " + body.app_secret,
      }),
      { status: 403 },
    );
  if (mode === "throttled") return new Response("", { status: 429 });
  const rows =
    mode === "empty"
      ? []
      : [1, 2].map((id) => ({
          cabecalho: {
            codigo_pedido: id,
            numero_pedido: String(id),
            codigo_cliente: 100 + id,
            origem_pedido: "ERP",
          },
          total_pedido: { valor_total_pedido: id === 1 ? value : 350 },
          infoCadastro: {
            dFat: omiePeriod(90).to.split("-").reverse().join("/"),
            faturado: "S",
            cancelado: "N",
          },
        }));
  return new Response(
    JSON.stringify({
      pagina: 1,
      total_de_paginas: rows.length ? 1 : 0,
      registros: rows.length,
      total_de_registros: rows.length,
      pedido_venda_produto: rows,
    }),
  );
};
const pool = database(),
  originalQuery = pool.query;
pool.query = function (query, ...args) {
  if (
    typeof query === "string" &&
    query.startsWith(
      "select encrypted_value from drivevision.platform_settings",
    )
  )
    return Promise.resolve({ rows: [], rowCount: 0 });
  if (
    typeof query === "string" &&
    query.startsWith(
      "select s.binding_id,s.owner_id from drivevision.cloud_schedule s",
    )
  )
    return originalQuery.call(
      this,
      query.replace(
        "where a.disabled_at",
        "where s.owner_id=any($1::uuid[]) and a.disabled_at",
      ),
      [owners],
    );
  return originalQuery.call(this, query, ...args);
};
const browser = process.argv.includes("--browser");
const root = resolve("dist-preview");
const http = createServer((req, res) => {
  if (req.url?.startsWith("/api/")) return void handler(req, res);
  if (!browser) {
    res.writeHead(404);
    return res.end();
  }
  let path = resolve(
    root,
    "." + decodeURIComponent(new URL(req.url, "http://localhost").pathname),
  );
  if (!path.startsWith(root + sep) || !existsSync(path) || extname(path) === "")
    path = resolve(root, "index.html");
  res.setHeader(
    "Content-Type",
    {
      ".js": "application/javascript",
      ".css": "text/css",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".html": "text/html",
    }[extname(path)] || "application/octet-stream",
  );
  res.end(readFileSync(path));
});
await new Promise((r) => http.listen(browser ? 5186 : 0, "127.0.0.1", r));
const base = `http://127.0.0.1:${http.address().port}`;
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
        `qa-${id}@drivevision.invalid`,
        "QA Omie",
        await hashPassword(randomUUID()),
      ],
    );
    await c.query(
      "insert into drivevision.workspaces(id,owner_id,name) values($1,$2,$3)",
      [randomUUID(), id, "QA Omie"],
    );
    await c.query(
      "insert into drivevision.sessions(token_hash,user_id,expires_at) values($1,$2,now()+interval '1 hour')",
      [tokenHash(token), id],
    );
  });
  return { id, cookie: `drivevision_session=${token}` };
}
async function req(path, owner, body, origin = base) {
  const r = await realFetch(base + "/api/" + path, {
    method: body ? "POST" : "GET",
    headers: {
      Origin: origin,
      ...(owner ? { Cookie: owner.cookie } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const bytes = Buffer.from(await r.arrayBuffer());
  return {
    status: r.status,
    data: bytes.length
      ? JSON.parse(
          r.headers.get("x-drivevision-encoding") === "gzip"
            ? gunzipSync(bytes).toString()
            : bytes.toString(),
        )
      : null,
  };
}
const expire = (id) =>
  admin.query(
    "update drivevision.cloud_connections set cache_until=now()-interval '1 second' where id=$1 and owner_id=any($2::uuid[])",
    [id, owners],
  );
try {
  const a = await account(),
    b = await account();
  const input = { label: "Minha empresa QA", credentials, options };
  assert.equal((await req("connectors/omie/connect", null, input)).status, 401);
  assert.equal(
    (await req("connectors/omie/connect", a, input, "https://attacker.invalid"))
      .status,
    403,
  );
  assert.equal(
    (
      await req("connectors/omie/connect", a, {
        ...input,
        credentials: { ...credentials, appSecret: "invalid-secret" },
      })
    ).status,
    401,
  );
  assert.equal((await req("connectors", a)).data.connections.length, 0);
  const connect = await req("connectors/omie/connect", a, input);
  assert.equal(connect.status, 200, JSON.stringify(connect));
  assert.equal(connect.data.total, 450);
  const id = connect.data.connectionId;
  const stored = (
    await admin.query(
      "select tokens,api_cache from drivevision.cloud_connections where id=$1",
      [id],
    )
  ).rows[0];
  assert.ok(!stored.tokens.includes(credentials.appSecret));
  assert.equal(unseal(stored.tokens, a.id).appSecret, credentials.appSecret);
  assert.throws(() => unseal(stored.tokens, b.id));
  assert.ok(!stored.api_cache.includes("Valor total"));
  const state = await req("connectors", a);
  assert.equal(state.data.omieConfigured, true);
  assert.ok(!JSON.stringify(state).includes(credentials.appSecret));
  assert.equal((await req("connectors", b)).data.connections.length, 0);
  assert.equal(
    (
      await transaction(b.id, (c) =>
        c.query("select id from drivevision.cloud_connections"),
      )
    ).rowCount,
    0,
  );
  for (const op of ["preview", "watch"])
    assert.equal(
      (
        await req("connectors/omie/" + op, b, {
          connectionId: id,
          options,
          ...(op === "watch" ? { name: "Foreign", interval: 1440 } : {}),
        })
      ).status,
      404,
    );
  assert.equal(
    (await req("connectors/browse", a, { connectionId: id })).status,
    400,
  );
  assert.equal(
    (await req("connectors/omie/connect", b, { ...input, id })).status,
    404,
  );
  console.log(
    "PASS real database RLS, account binding, encrypted credentials/cache, CSRF and provider boundary",
  );
  const before = calls;
  const preview = await req("connectors/omie/preview", a, {
    connectionId: id,
    options,
  });
  assert.equal(preview.status, 200);
  const watched = await req("connectors/omie/watch", a, {
    connectionId: id,
    options,
    name: "Pedidos Omie",
    interval: 1440,
  });
  assert.equal(watched.status, 200, JSON.stringify(watched));
  const binding = watched.data.id;
  assert.equal((await req("connectors/sync", a, { id: binding })).status, 200);
  assert.equal(calls, before, "Confirming preview must reuse cached result");
  const repeated = await req("connectors/omie/watch", a, {
    connectionId: id,
    options,
    name: "Pedidos Omie",
    interval: 1440,
  });
  assert.equal(repeated.data.id, binding);
  const workspace = (await req("workspace", a)).data;
  assert.equal(workspace.workspace.sources.length, 1);
  assert.equal(workspace.workspace.sources[0].rows.length, 2);
  assert.equal(workspace.workspace.sources[0].remoteInfo.provider, "omie");
  assert.equal((await req("connectors/sync", b, { id: binding })).status, 409);
  console.log(
    "PASS preview → watch → real source persistence, cache reuse, idempotent watch and ownership",
  );
  await expire(id);
  mode = "throttled";
  assert.equal((await req("connectors/sync", a, { id: binding })).status, 429);
  assert.deepEqual((await req("workspace", a)).data, workspace);
  assert.ok((await req("connectors", a)).data.bindings[0].last_error);
  mode = "ok";
  value = 200;
  assert.equal((await req("connectors/sync", a, { id: binding })).status, 200);
  const refreshed = (await req("workspace", a)).data;
  assert.equal(refreshed.workspace.sources[0].rows[0]["Valor total"], "200");
  assert.ok(refreshed.revision > workspace.revision);
  const history = (await req("connectors/history", a, { id: binding })).data
    .runs;
  assert.ok(history.some((r) => r.status === "error"));
  assert.ok(history.some((r) => r.status === "success"));
  console.log(
    "PASS failed refresh preserves previous data; successful refresh replaces without duplicate rows and records history",
  );
  await req("connectors/update", a, {
    id: binding,
    paused: true,
    interval: 1440,
  });
  assert.equal((await req("connectors", a)).data.bindings[0].paused, true);
  await req("connectors/update", a, {
    id: binding,
    paused: false,
    interval: 1440,
  });
  await expire(id);
  value = 250;
  await admin.query(
    "update drivevision.cloud_schedule set due_at=now()-interval '1 minute' where binding_id=$1",
    [binding],
  );
  assert.equal((await syncDue()).processed, 1);
  assert.equal(
    (await req("workspace", a)).data.workspace.sources[0].rows[0][
      "Valor total"
    ],
    "250",
  );
  assert.equal(
    (
      await req("connectors/omie/connect", a, {
        ...input,
        id,
        credentials: { ...credentials, appKey: "987654321" },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await req("connectors/omie/connect", a, {
        ...input,
        id,
        credentials: { ...credentials, appSecret: "invalid-secret" },
      })
    ).status,
    401,
  );
  assert.equal(
    (await req("connectors/omie/preview", a, { connectionId: id, options }))
      .status,
    200,
  );
  console.log(
    "PASS scheduled refresh, pause/resume, safe credential rotation and wrong-company protection",
  );
  await req("connectors/disconnect", b, { id });
  assert.equal((await req("connectors", a)).data.connections.length, 1);
  await req("connectors/disconnect", a, { id });
  assert.equal((await req("connectors", a)).data.bindings.length, 0);
  assert.equal((await req("workspace", a)).data.workspace.sources.length, 1);
  console.log(
    "PASS disconnect removes credentials and schedules, retaining explicitly imported source",
  );
  if (browser) {
    writeFileSync(
      "work/omie-qa-session.json",
      JSON.stringify({ cookie: a.cookie, owner: a.id, base }),
    );
    console.log(
      "QA browser server ready on " +
        base +
        " (synthetic Omie responses, isolated real database account).",
    );
    await new Promise((r) => {
      process.once("SIGINT", r);
      process.once("SIGTERM", r);
    });
  }
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
