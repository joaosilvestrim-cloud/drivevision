import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { Client } from "pg";
import handler from "../server/handler.ts";
import {
  connectionOptions,
  database,
  transaction,
  closeDatabase,
} from "../server/database.ts";
import { hashPassword, verifyPassword } from "../server/security.ts";
process.loadEnvFile(".env.local");
process.env.DRIVEVISION_CONNECTOR_KEY ||= Buffer.alloc(32, 42).toString(
  "base64",
);
const http = createServer(handler);
await new Promise((resolve) => http.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${http.address().port}`;
const accounts = [];
const testIp = `198.18.${Math.floor(Math.random() * 254)}.${Math.floor(Math.random() * 254)}`;
let checks = 0;
const admin = new Client(connectionOptions(true));
await admin.connect();
async function check(name, fn) {
  await fn();
  checks++;
  console.log("PASS", name);
}
async function request(
  path,
  { method = "GET", body, cookie, origin = base, zip = false, account } = {},
) {
  const response = await fetch(base + path, {
    method,
    headers: {
      Origin: origin,
      "X-Forwarded-For": testIp,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(account ? { "X-Drivevision-Account": account } : {}),
      ...(body
        ? {
            "Content-Type": zip
              ? "application/octet-stream"
              : "application/json",
          }
        : {}),
      ...(zip ? { "X-Drivevision-Encoding": "gzip" } : {}),
    },
    body: body
      ? zip
        ? gzipSync(JSON.stringify(body))
        : JSON.stringify(body)
      : undefined,
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
    headers: response.headers,
  };
}
async function signup() {
  const email = `qa-${randomUUID()}@drivevision.invalid`,
    password = `QA-${randomUUID()}-local`;
  const r = await request("/api/register", {
    method: "POST",
    body: {
      email,
      password,
      name: "Validação automatizada",
      acceptedTerms: true,
    },
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  accounts.push(r.data.user.id);
  const provisioned = await admin.query(
    "select w.id from drivevision.workspaces w join drivevision.billing_accounts b on b.owner_id=w.owner_id where w.owner_id=$1",
    [r.data.user.id],
  );
  assert.equal(
    provisioned.rowCount,
    1,
    "Every signup atomically provisions one workspace and billing account",
  );
  assert.equal(r.data.user.access, false);
  assert.equal(
    (await request("/api/workspace", { cookie: r.cookie })).status,
    402,
  );
  await admin.query(
    "update drivevision.billing_accounts set paid_until=now()+interval '1 month' where owner_id=$1",
    [r.data.user.id],
  );
  return { ...r, email, password };
}
try {
  await check(
    "passwords are salted and verified without plaintext storage",
    async () => {
      const a = await hashPassword("long-test-password"),
        b = await hashPassword("long-test-password");
      assert.notEqual(a, b);
      assert.equal(await verifyPassword("long-test-password", a), true);
      assert.equal(await verifyPassword("wrong-test-password", a), false);
    },
  );
  const a = await signup(),
    b = await signup();
  await check(
    "signup creates isolated sessions with HttpOnly SameSite cookies",
    () => {
      assert.ok(a.headers.get("set-cookie").includes("HttpOnly"));
      assert.ok(a.headers.get("set-cookie").includes("SameSite=Lax"));
      assert.ok(!JSON.stringify(a.data).includes("password"));
    },
  );
  await check(
    "anonymous workspace access and cross-origin writes are denied",
    async () => {
      assert.equal((await request("/api/workspace")).status, 401);
      assert.equal(
        (
          await request("/api/logout", {
            method: "POST",
            body: {},
            cookie: a.cookie,
            origin: "https://untrusted.invalid",
          })
        ).status,
        403,
      );
    },
  );
  const empty = await request("/api/workspace", { cookie: a.cookie });
  assert.equal(empty.data.revision, 0);
  const source = {
    id: "qa-source",
    name: "Dados fictícios",
    columns: ["Grupo", "Valor"],
    numeric: ["Valor"],
    dates: [],
    rows: [
      { Grupo: "Sul", Valor: "100" },
      { Grupo: "Norte", Valor: "200" },
    ],
    demo: false,
    createdAt: new Date().toISOString(),
  };
  const config = {
    title: "Persistência de teste",
    metric: "Valor",
    dimension: "Grupo",
    chart: "bar",
    aggregation: "sum",
    period: "all",
    visuals: [
      {
        id: "qa-visual",
        type: "treemap",
        title: "Participação",
        metric: "Valor",
        dimension: "Grupo",
        aggregation: "sum",
        span: 8,
        height: 440,
        grid: true,
        legend: true,
        limit: 8,
        sort: "desc",
        grain: "day",
        text: "",
      },
    ],
    dataSteps: [
      {
        id: "step",
        kind: "conditional",
        field: "Faixa",
        value: "Alta",
        extra: "Baixa",
        filters: {
          mode: "and",
          rules: [{ id: "f", field: "Valor", op: "gte", value: "200" }],
        },
      },
    ],
  };
  const workspace = {
    version: 1,
    sources: [source],
    dashboards: [
      {
        id: "qa-board",
        folder: "Diretoria",
        starred: true,
        sourceId: source.id,
        config,
        updatedAt: new Date().toISOString(),
      },
    ],
  };
  await check(
    "compressed workspace round-trips sources, folders, favorites, resized charts and transformations",
    async () => {
      const saved = await request("/api/workspace", {
        method: "PUT",
        body: { revision: 0, workspace },
        cookie: a.cookie,
        zip: true,
      });
      assert.equal(saved.status, 200, JSON.stringify(saved.data));
      const loaded = await request("/api/workspace", { cookie: a.cookie });
      assert.deepEqual(loaded.data.workspace, workspace);
      assert.equal(loaded.data.revision, 1);
    },
  );
  await check(
    "a second account cannot read the first account records",
    async () => {
      const other = await request("/api/workspace", { cookie: b.cookie });
      assert.deepEqual(other.data.workspace, {
        version: 1,
        sources: [],
        dashboards: [],
      });
      const data = await transaction(b.data.user.id, (c) =>
        c.query("select * from drivevision.sources"),
      );
      assert.equal(data.rowCount, 0);
    },
  );
  await check(
    "RLS blocks inserting a source into another workspace",
    async () => {
      const own = await transaction(
        a.data.user.id,
        async (c) =>
          (await c.query("select id from drivevision.workspaces")).rows[0].id,
      );
      await assert.rejects(
        transaction(b.data.user.id, (c) =>
          c.query(
            "insert into drivevision.sources(workspace_id,id,payload) values($1,$2,$3)",
            [own, "intrusion", {}],
          ),
        ),
        (e) => e.code === "42501",
      );
    },
  );
  await check(
    "stale tabs cannot read or save under a different account session",
    async () => {
      for (const path of [
        "/api/workspace",
        "/api/workspace/revision",
        "/api/connectors",
        "/api/billing",
        "/api/support",
      ])
        assert.equal(
          (await request(path, { cookie: b.cookie, account: a.data.user.id }))
            .status,
          409,
        );
      assert.equal(
        (
          await request("/api/workspace", {
            method: "PUT",
            cookie: b.cookie,
            account: a.data.user.id,
            body: { revision: 0, workspace },
            zip: true,
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await request("/api/workspace", {
            cookie: a.cookie,
            account: a.data.user.id,
          })
        ).status,
        200,
      );
    },
  );
  await check(
    "matching source and dashboard identifiers remain isolated on write and delete",
    async () => {
      const otherWorkspace = structuredClone(workspace);
      otherWorkspace.sources[0].rows = [{ Grupo: "Cliente B", Valor: "999" }];
      otherWorkspace.dashboards[0].config.title = "Somente cliente B";
      assert.equal(
        (
          await request("/api/workspace", {
            method: "PUT",
            cookie: b.cookie,
            body: { revision: 0, workspace: otherWorkspace },
            zip: true,
          })
        ).status,
        200,
      );
      assert.deepEqual(
        (await request("/api/workspace", { cookie: a.cookie })).data.workspace,
        workspace,
      );
      const own = (
        await admin.query(
          "select id from drivevision.workspaces where owner_id=$1",
          [a.data.user.id],
        )
      ).rows[0].id;
      await transaction(b.data.user.id, async (c) => {
        for (const table of ["sources", "dashboards"]) {
          assert.equal(
            (
              await c.query(
                `select id from drivevision.${table} where workspace_id=$1`,
                [own],
              )
            ).rowCount,
            0,
          );
          assert.equal(
            (
              await c.query(
                `update drivevision.${table} set payload='{}'::jsonb where workspace_id=$1`,
                [own],
              )
            ).rowCount,
            0,
          );
          assert.equal(
            (
              await c.query(
                `delete from drivevision.${table} where workspace_id=$1`,
                [own],
              )
            ).rowCount,
            0,
          );
        }
        assert.equal(
          (
            await c.query(
              "update drivevision.workspaces set owner_id=$1 where id=$2",
              [b.data.user.id, own],
            )
          ).rowCount,
          0,
        );
      });
      assert.equal(
        (
          await request("/api/workspace", {
            method: "PUT",
            cookie: b.cookie,
            body: {
              revision: 1,
              workspace: { version: 1, sources: [], dashboards: [] },
            },
            zip: true,
          })
        ).status,
        200,
      );
      assert.deepEqual(
        (await request("/api/workspace", { cookie: a.cookie })).data.workspace,
        workspace,
      );
    },
  );
  await check(
    "stale revisions and invalid references do not overwrite data",
    async () => {
      assert.equal(
        (
          await request("/api/workspace", {
            method: "PUT",
            body: { revision: 0, workspace },
            cookie: a.cookie,
            zip: true,
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await request("/api/workspace", {
            method: "PUT",
            body: { revision: 1, workspace: { ...workspace, sources: [] } },
            cookie: a.cookie,
            zip: true,
          })
        ).status,
        400,
      );
      assert.equal(
        (await request("/api/workspace", { cookie: a.cookie })).data.revision,
        1,
      );
    },
  );
  await check(
    "logout revokes the old session; fresh login restores saved data",
    async () => {
      assert.equal(
        (
          await request("/api/logout", {
            method: "POST",
            body: {},
            cookie: a.cookie,
          })
        ).status,
        200,
      );
      assert.equal(
        (await request("/api/workspace", { cookie: a.cookie })).status,
        401,
      );
      const logged = await request("/api/login", {
        method: "POST",
        body: { email: a.email, password: a.password },
      });
      assert.equal(logged.status, 200);
      assert.deepEqual(
        (await request("/api/workspace", { cookie: logged.cookie })).data
          .workspace,
        workspace,
      );
    },
  );
  await check(
    "browser roles have no access; runtime cannot create schema objects",
    async () => {
      const p = await admin.query(
        "select has_schema_privilege('anon','drivevision','usage') as anon,has_schema_privilege('authenticated','drivevision','usage') as authenticated,has_schema_privilege('drivevision_app','drivevision','create') as ddl",
      );
      assert.deepEqual(p.rows[0], {
        anon: false,
        authenticated: false,
        ddl: false,
      });
      await assert.rejects(
        database().query("select * from drivevision.schema_migrations"),
        (e) => e.code === "42501",
      );
    },
  );
  console.log(
    `${checks} server integration checks passed against the isolated schema.`,
  );
} finally {
  // Only accounts created by this exact test run are removed; other schemas are never touched.
  for (const id of accounts) {
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
  await new Promise((resolve) => http.close(resolve));
}
