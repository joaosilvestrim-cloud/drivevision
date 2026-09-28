import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { Client } from "pg";
import handler from "../server/handler.ts";
import {
  connectionOptions,
  transaction,
  closeDatabase,
} from "../server/database.ts";
import { tokenHash, newToken, hashPassword } from "../server/security.ts";
import { parseCSV } from "../lib/analytics.ts";
import { combineSources } from "../lib/exploration.ts";
import { HISTORY_LIMITS } from "../server/source-history.ts";
process.loadEnvFile(".env.local");
const http = createServer(handler);
await new Promise((r) => http.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${http.address().port}`,
  owners = [];
const admin = new Client(connectionOptions(true));
await admin.connect();
let checks = 0;
async function check(name, fn) {
  await fn();
  checks++;
  console.log("PASS", name);
}
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
        "QA histórico",
        await hashPassword(randomUUID()),
      ],
    );
    await c.query(
      "insert into drivevision.workspaces(id,owner_id,name) values($1,$2,$3)",
      [randomUUID(), id, "QA"],
    );
    await c.query(
      "insert into drivevision.sessions(token_hash,user_id,expires_at) values($1,$2,now()+interval '1 hour')",
      [tokenHash(token), id],
    );
  });
  return { id, cookie: `drivevision_session=${token}` };
}
async function req(path, owner, body, method) {
  const r = await fetch(base + "/api/" + path, {
    method: method || (body ? "POST" : "GET"),
    headers: {
      Origin: base,
      ...(owner ? { Cookie: owner.cookie } : {}),
      ...(body
        ? {
            "Content-Type":
              method === "PUT"
                ? "application/octet-stream"
                : "application/json",
          }
        : {}),
      ...(method === "PUT" ? { "X-Drivevision-Encoding": "gzip" } : {}),
    },
    body: body
      ? method === "PUT"
        ? gzipSync(JSON.stringify(body))
        : JSON.stringify(body)
      : undefined,
  });
  const bytes = Buffer.from(await r.arrayBuffer());
  return {
    status: r.status,
    data: JSON.parse(
      r.headers.get("x-drivevision-encoding") === "gzip"
        ? gunzipSync(bytes).toString()
        : bytes.toString(),
    ),
  };
}
try {
  const a = await account(),
    b = await account();
  let workspace = {
      version: 1,
      sources: [parseCSV("ID;Valor\nA;10\nB;20", "Vendas", "sales")],
      dashboards: [],
    },
    revision = 0;
  async function save() {
    const r = await req("workspace", a, { workspace, revision }, "PUT");
    assert.equal(r.status, 200, JSON.stringify(r.data));
    revision = r.data.revision;
  }
  await check(
    "authenticated publication creates a durable version",
    async () => {
      await save();
      const h = await req("history?source=sales", a);
      assert.equal(h.data.versions.length, 1);
      assert.equal(h.data.versions[0].metadata.rows, 2);
    },
  );
  const initial = (await req("history?source=sales", a)).data.versions[0].id;
  await check(
    "anonymous, other owner and SQL RLS cannot read a version",
    async () => {
      assert.equal((await req("history?source=sales", null)).status, 401);
      assert.equal((await req("history?version=" + initial, b)).status, 404);
      assert.equal(
        (await req("history?source=sales", b)).data.versions.length,
        0,
      );
      await transaction(b.id, async (c) =>
        assert.equal(
          (
            await c.query(
              "select id from drivevision.source_versions where id=$1",
              [initial],
            )
          ).rowCount,
          0,
        ),
      );
    },
  );
  await check("unchanged saves do not create duplicate snapshots", async () => {
    await save();
    assert.equal(
      (await req("history?source=sales", a)).data.versions.length,
      1,
    );
  });
  const right = parseCSV("ID;Nome\nA;Ana\nB;Bia", "Clientes", "clients"),
    options = { mode: "left", leftKey: "ID", rightKey: "ID", trim: true };
  const joined = {
    ...combineSources(workspace.sources[0], right, options).source,
    id: "combined",
    recipe: {
      leftId: "sales",
      rightId: "clients",
      rightName: "Clientes",
      options,
    },
  };
  workspace.sources.push(right, joined);
  await save();
  await check(
    "server recomputes stale or forged derived rows before storing",
    async () => {
      workspace.sources[0].rows[0].Valor = "90";
      workspace.sources[2].rows = [];
      await save();
      const w = (await req("workspace", a)).data.workspace;
      assert.equal(w.sources[2].rows[0].Valor, "90");
      workspace = w;
    },
  );
  await check(
    "failed dependent join leaves entire workspace and history untouched",
    async () => {
      const bad = structuredClone(workspace);
      bad.sources[1].rows.push(bad.sources[1].rows[0]);
      const r = await req("workspace", a, { workspace: bad, revision }, "PUT");
      assert.equal(r.status, 422);
      assert.deepEqual((await req("workspace", a)).data.workspace, workspace);
    },
  );
  await check(
    "stale restore rejected and successful restore updates descendants",
    async () => {
      assert.equal(
        (
          await req("history", a, {
            action: "restore",
            versionId: initial,
            revision: 0,
          })
        ).status,
        409,
      );
      const r = await req("history", a, {
        action: "restore",
        versionId: initial,
        revision,
      });
      assert.equal(r.status, 200, JSON.stringify(r.data));
      const w = (await req("workspace", a)).data;
      revision = w.revision;
      workspace = w.workspace;
      assert.equal(workspace.sources[0].rows[0].Valor, "10");
      assert.equal(workspace.sources[2].rows[0].Valor, "10");
      assert.match(
        (await req("history?source=sales", a)).data.versions[0].metadata.reason,
        /restore:/,
      );
    },
  );
  await check("version export returns original rows", async () => {
    assert.equal(
      (await req("history?version=" + initial, a)).data.source.rows[0].Valor,
      "10",
    );
  });
  await check(
    "history retention holds at 20 versions without deleting current data",
    async () => {
      for (let i = 0; i < 22; i++) {
        workspace.sources[0].rows[0].Valor = String(100 + i);
        await save();
      }
      assert.equal(
        (await req("history?source=sales", a)).data.versions.length,
        20,
      );
      assert.equal((await req("history?version=" + initial, a)).status, 404);
      assert.equal(
        (await req("workspace", a)).data.workspace.sources[0].rows[0].Valor,
        "121",
      );
    },
  );
  await check(
    "workspace history quota prunes snapshots without removing live data",
    async () => {
      const configured = HISTORY_LIMITS.workspaceBytes;
      try {
        HISTORY_LIMITS.workspaceBytes = 1500;
        workspace.sources[0].rows[0].Valor = "122";
        await save();
        assert.ok(
          (await req("history?source=sales", a)).data.usedBytes <= 1500,
        );
        assert.equal(
          (await req("workspace", a)).data.workspace.sources[0].rows[0].Valor,
          "122",
        );
      } finally {
        HISTORY_LIMITS.workspaceBytes = configured;
      }
    },
  );
  await check(
    "delete-history is scoped and preserves current dataset",
    async () => {
      const r = await req("history", a, {
        action: "delete",
        sourceId: "sales",
        revision,
      });
      assert.equal(r.status, 200);
      revision++;
      assert.equal(
        (await req("history?source=sales", a)).data.versions.length,
        0,
      );
      assert.equal(
        (await req("workspace", a)).data.workspace.sources[0].rows.length,
        2,
      );
      assert.ok((await req("history?source=combined", a)).data.versions.length);
    },
  );
  await check(
    "source deletion cascades versions and cannot leave a broken dependency",
    async () => {
      assert.equal(
        (
          await req(
            "workspace",
            a,
            {
              workspace: {
                ...workspace,
                sources: workspace.sources.filter((s) => s.id !== "sales"),
              },
              revision,
            },
            "PUT",
          )
        ).status,
        422,
      );
      workspace.sources = [];
      await save();
      assert.equal(
        (await req("history?source=combined", a)).data.versions.length,
        0,
      );
    },
  );
  console.log(`${checks} history API/database checks passed.`);
} finally {
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
