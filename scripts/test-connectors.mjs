import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID, randomBytes } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { Client } from "pg";
import handler from "../server/handler.ts";
import {
  connectionOptions,
  transaction,
  closeDatabase,
} from "../server/database.ts";
import { hashPassword, newToken, tokenHash } from "../server/security.ts";
import { seal, unseal } from "../server/connector-security.ts";
import {
  safeDownloadUrl,
  download,
  browse,
} from "../server/cloud-providers.ts";
import * as XLSX from "xlsx";
process.loadEnvFile(".env.local");
process.env.DRIVEVISION_CONNECTOR_KEY = randomBytes(32).toString("base64");
process.env.DRIVEVISION_GOOGLE_CLIENT_ID = "qa-client";
process.env.DRIVEVISION_GOOGLE_CLIENT_SECRET = "qa-secret";
process.env.DRIVEVISION_MICROSOFT_CLIENT_ID = "qa-ms";
process.env.DRIVEVISION_MICROSOFT_CLIENT_SECRET = "qa-ms-secret";
delete process.env.DRIVEVISION_APP_ORIGIN;
delete process.env.CRON_SECRET;
const realFetch = globalThis.fetch;
let csv = "Grupo,Valor\nSul,100\nNorte,200",
  version = 1,
  missing = false,
  refreshes = 0,
  downloadBearer = false;
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(
  workbook,
  XLSX.utils.aoa_to_sheet([
    ["Relatório"],
    [],
    ["Grupo", "Valor"],
    ["Sul", 120],
    ["Norte", 250],
  ]),
  "Vendas",
);
const excel = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
const file = (id = "file-a") => ({
  id,
  name: id === "file-b" ? "vendas-b.csv" : "vendas.csv",
  mimeType: "text/csv",
  size: csv.length,
  version: String(version),
});
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
globalThis.fetch = async (input, init) => {
  const url = new URL(String(input));
  if (
    url.hostname === "oauth2.googleapis.com" ||
    url.hostname === "login.microsoftonline.com"
  ) {
    const body = new URLSearchParams(init.body);
    if (body.get("grant_type") === "refresh_token") refreshes++;
    else assert.ok(body.get("code_verifier"));
    return json({
      access_token: "qa-access-token",
      refresh_token: "qa-refresh-token",
      expires_in: 3600,
    });
  }
  if (url.hostname === "www.googleapis.com") {
    if (url.pathname.endsWith("/sheet-a/export")) return new Response(excel);
    if (url.pathname.endsWith("/sheet-a"))
      return json({
        id: "sheet-a",
        name: "Planilha online",
        mimeType: "application/vnd.google-apps.spreadsheet",
        version: "1",
      });
    if (url.pathname.endsWith("/about"))
      return json({ user: { emailAddress: "fixture@example.invalid" } });
    if (url.pathname.endsWith("/drives")) return json({ drives: [] });
    if (url.pathname.endsWith("/files"))
      return json({
        files: [
          file(),
          file("file-b"),
          {
            id: "nested",
            name: "Subpasta",
            mimeType: "application/vnd.google-apps.folder",
          },
        ],
      });
    if (url.pathname.endsWith("/folder"))
      return json({
        id: "folder",
        name: "Pasta de vendas",
        mimeType: "application/vnd.google-apps.folder",
      });
    if (url.pathname.includes("/files/")) {
      if (missing) return json({}, 404);
      if (url.searchParams.get("alt") === "media") return new Response(csv);
      return json(file(url.pathname.split("/").pop()));
    }
  }
  if (url.hostname === "graph.microsoft.com") {
    if (url.pathname.endsWith("/me"))
      return json({ mail: "microsoft@example.invalid" });
    if (url.pathname.endsWith("/me/drive"))
      return json({ id: "drive-a", name: "OneDrive" });
    if (url.pathname.endsWith("/sites"))
      return json({ value: [{ id: "site-a", displayName: "Vendas" }] });
    if (url.pathname.endsWith("/drives"))
      return json({ value: [{ id: "drive-a", name: "Documentos" }] });
    if (url.pathname.endsWith("/children"))
      return json({
        value: [
          {
            id: "file-a",
            name: "vendas.csv",
            file: {},
            parentReference: { driveId: "drive-a" },
          },
        ],
      });
    if (url.pathname.endsWith("/content"))
      return new Response(null, {
        status: 302,
        headers: { location: "https://tenant.sharepoint.com/download.csv" },
      });
    return json({
      id: "file-a",
      name: "vendas.csv",
      eTag: "1",
      parentReference: { driveId: "drive-a" },
    });
  }
  if (url.hostname === "tenant.sharepoint.com") {
    downloadBearer = !!init?.headers?.Authorization;
    return new Response(csv);
  }
  if (url.hostname === "127.0.0.1") return realFetch(input, init);
  throw new Error("Unexpected external request in test: " + url.hostname);
};
const http = createServer(handler);
await new Promise((r) => http.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${http.address().port}`;
const admin = new Client(connectionOptions(true));
await admin.connect();
const owners = [];
async function account() {
  const id = randomUUID(),
    token = newToken();
  await transaction(id, async (c) => {
    await c.query(
      "insert into drivevision.accounts(id,email,name,password_hash) values($1,$2,$3,$4)",
      [
        id,
        `qa-${id}@drivevision.invalid`,
        "QA conectores",
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
  owners.push(id);
  return { id, cookie: `drivevision_session=${token}` };
}
async function req(path, owner, body, method) {
  const r = await fetch(base + "/api/" + path, {
    method: method || (body ? "POST" : "GET"),
    redirect: "manual",
    headers: {
      Origin: base,
      ...(owner ? { Cookie: owner.cookie } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  const bytes = Buffer.from(await r.arrayBuffer());
  if (bytes.length)
    data = JSON.parse(
      r.headers.get("x-drivevision-encoding") === "gzip"
        ? gunzipSync(bytes).toString()
        : bytes.toString(),
    );
  return { status: r.status, data, location: r.headers.get("location") };
}
let checks = 0;
async function check(label, fn) {
  await fn();
  checks++;
  console.log("PASS", label);
}
try {
  const a = await account(),
    b = await account();
  await check("anonymous connectors and cron calls are denied", async () => {
    assert.equal((await req("connectors")).status, 401);
    assert.equal((await req("cron/sources")).status, 401);
  });
  await check(
    "OAuth token encryption is bound to owner and tampering fails",
    () => {
      const sealed = seal({ secret: "private-refresh" }, a.id);
      assert.ok(!sealed.includes("private-refresh"));
      assert.equal(unseal(sealed, a.id).secret, "private-refresh");
      assert.throws(() => unseal(sealed, b.id));
      assert.throws(() => unseal(sealed.slice(0, -3) + "abc", a.id));
    },
  );
  let connection;
  await check(
    "OAuth state binds user/session, exchanges PKCE once and hides tokens",
    async () => {
      const start = await req("connectors/start", a, { provider: "google" });
      assert.equal(start.status, 200);
      const url = new URL(start.data.url),
        state = url.searchParams.get("state");
      assert.equal(url.searchParams.get("code_challenge_method"), "S256");
      assert.ok(
        (
          await req(`connectors/callback/google?state=${state}&code=fixture`, b)
        ).location.includes("error"),
      );
      assert.ok(
        (
          await req(`connectors/callback/google?state=${state}&code=fixture`, a)
        ).location.includes("success"),
      );
      assert.ok(
        (
          await req(`connectors/callback/google?state=${state}&code=fixture`, a)
        ).location.includes("error"),
      );
      const list = await req("connectors", a);
      connection = list.data.connections[0];
      assert.equal(connection.provider, "google");
      assert.ok(!JSON.stringify(list).includes("qa-refresh-token"));
      assert.equal((await req("connectors", b)).data.connections.length, 0);
    },
  );
  await check(
    "foreign connection IDs cannot browse or decrypt another owner",
    async () => {
      assert.equal(
        (await req("connectors/browse", b, { connectionId: connection.id }))
          .status,
        404,
      );
      const rows = await transaction(
        b.id,
        async (c) =>
          (await c.query("select * from drivevision.cloud_connections")).rows,
      );
      assert.equal(rows.length, 0);
    },
  );
  await check(
    "Google Sheets export uses the real Excel parser and explicit table selection",
    async () => {
      const result = await req("connectors/preview", a, {
        connectionId: connection.id,
        target: { id: "sheet-a", name: "Planilha online", kind: "file" },
        options: {
          sheet: "Vendas",
          header: 3,
          left: 1,
          right: 2,
          end: null,
          skipTotals: true,
          nameContains: "",
        },
      });
      assert.equal(result.status, 200, JSON.stringify(result.data));
      assert.deepEqual(result.data.columns, ["Grupo", "Valor"]);
      assert.equal(result.data.rowCount, 2);
      assert.equal(result.data.rows[0].Valor, "120");
    },
  );
  const target = { id: "file-a", name: "vendas.csv", kind: "file" };
  const preview = await req("connectors/preview", a, {
    connectionId: connection.id,
    target,
  });
  assert.equal(preview.status, 200, JSON.stringify(preview.data));
  const options = preview.data.options;
  let binding;
  await check(
    "selected sheet and columns preview then stable source refresh",
    async () => {
      assert.deepEqual(preview.data.columns, ["Grupo", "Valor"]);
      const watched = await req("connectors/watch", a, {
        connectionId: connection.id,
        target,
        options,
        name: "Vendas conectadas",
        interval: 60,
      });
      assert.equal(watched.status, 200);
      binding = watched.data.id;
      assert.equal(
        (await req("connectors/sync", a, { id: binding })).status,
        200,
      );
      const first = await req("workspace", a);
      assert.equal(first.data.workspace.sources[0].rows.length, 2);
      csv += "\nLeste,300";
      version++;
      assert.equal(
        (await req("connectors/sync", a, { id: binding })).status,
        200,
      );
      const next = await req("workspace", a);
      assert.equal(
        next.data.workspace.sources[0].id,
        first.data.workspace.sources[0].id,
      );
      assert.equal(next.data.workspace.sources[0].rows.length, 3);
      assert.equal(next.data.revision, first.data.revision + 1);
      assert.equal(
        (await req("workspace/revision", a)).data.revision,
        next.data.revision,
      );
      assert.notEqual(
        (await req("workspace/revision", b)).data.revision,
        next.data.revision,
      );
      assert.equal(
        (
          await req(
            "workspace",
            a,
            { revision: first.data.revision, workspace: first.data.workspace },
            "PUT",
          )
        ).status,
        409,
      );
    },
  );
  await check(
    "schema changes and missing files preserve last valid data and log errors",
    async () => {
      const before = (await req("workspace", a)).data;
      const saved = csv;
      csv = "Grupo,Outro\nSul,999";
      version++;
      assert.equal(
        (await req("connectors/sync", a, { id: binding })).status,
        422,
      );
      assert.deepEqual((await req("workspace", a)).data, before);
      csv = saved;
      missing = true;
      assert.equal(
        (await req("connectors/sync", a, { id: binding })).status,
        404,
      );
      missing = false;
      assert.deepEqual((await req("workspace", a)).data, before);
      assert.equal(
        (await req("connectors/history", a, { id: binding })).data.runs[0]
          .status,
        "error",
      );
    },
  );
  await check(
    "folder filter combines only matching immediate files",
    async () => {
      const folder = { id: "folder", name: "Pasta de vendas", kind: "folder" };
      const watched = await req("connectors/watch", a, {
        connectionId: connection.id,
        target: folder,
        options: { ...options, nameContains: "vendas" },
        name: "Pasta consolidada",
        interval: 15,
      });
      assert.equal(watched.status, 200);
      assert.equal(
        (await req("connectors/sync", a, { id: watched.data.id })).status,
        200,
      );
      const w = (await req("workspace", a)).data.workspace;
      assert.equal(
        w.sources.find((s) => s.name === "Pasta consolidada").rows.length,
        6,
      );
    },
  );
  await check(
    "token refresh is persisted encrypted and jobs cannot overlap",
    async () => {
      await transaction(a.id, async (c) => {
        await c.query(
          "update drivevision.cloud_connections set expires_at=now()-interval '1 minute' where id=$1",
          [connection.id],
        );
      });
      await req("connectors/browse", a, { connectionId: connection.id });
      assert.equal(refreshes, 1);
      await admin.query(
        "update drivevision.cloud_schedule set lease_until=now()+interval '1 minute' where binding_id=$1",
        [binding],
      );
      assert.equal(
        (await req("connectors/sync", a, { id: binding })).status,
        409,
      );
      await admin.query(
        "update drivevision.cloud_schedule set lease_until=null where binding_id=$1",
        [binding],
      );
    },
  );
  await check(
    "Microsoft browsing and download avoid token forwarding; SSRF rejected",
    async () => {
      assert.equal((await browse("onedrive", "qa")).items[0].kind, "drive");
      assert.equal((await browse("sharepoint", "qa")).items[0].kind, "site");
      const bytes = await download("onedrive", "qa", {
        id: "file-a",
        driveId: "drive-a",
        name: "vendas.csv",
        kind: "file",
      });
      assert.ok(bytes.bytes.byteLength > 0);
      assert.equal(downloadBearer, false);
      for (const url of [
        "http://tenant.sharepoint.com/x",
        "https://127.0.0.1/x",
        "https://evilsharepoint.com/x",
        "https://tenant.sharepoint.com.evil.invalid/x",
      ])
        assert.throws(() => safeDownloadUrl(url));
      await assert.rejects(() =>
        browse("onedrive", "qa", undefined, "https://evil.invalid/"),
      );
    },
  );
  await check(
    "scheduled refresh requires a secret and skips paused sources",
    async () => {
      await req("connectors/update", a, {
        id: binding,
        paused: true,
        interval: 60,
      });
      const before = (await req("workspace", a)).data;
      await admin.query(
        "update drivevision.cloud_schedule set due_at=now()-interval '1 minute' where owner_id=$1",
        [a.id],
      );
      csv += "\nOeste,400";
      version++;
      process.env.CRON_SECRET = randomBytes(32).toString("base64url");
      assert.equal(
        (
          await fetch(base + "/api/cron/sources", {
            headers: { Authorization: "Bearer incorrect" },
          })
        ).status,
        401,
      );
      const result = await fetch(base + "/api/cron/sources", {
        headers: { Authorization: "Bearer " + process.env.CRON_SECRET },
      });
      assert.equal(result.status, 200);
      assert.equal((await result.json()).processed, 2);
      const after = (await req("workspace", a)).data;
      assert.equal(
        after.workspace.sources.find((s) => s.id === "remote-" + binding).rows
          .length,
        3,
      );
      assert.equal(
        after.workspace.sources.find((s) => s.name === "Pasta consolidada").rows
          .length,
        8,
      );
      assert.equal(after.revision, before.revision + 1);
      delete process.env.CRON_SECRET;
    },
  );
  await check(
    "pause invalidates jobs; disconnect retains imported sources",
    async () => {
      assert.equal(
        (
          await req("connectors/update", a, {
            id: binding,
            paused: true,
            interval: 60,
          })
        ).status,
        200,
      );
      const saved = (await req("workspace", a)).data.workspace;
      assert.equal(
        (await req("connectors/remove", b, { id: binding })).status,
        200,
      );
      assert.equal((await req("connectors", a)).data.bindings.length, 2);
      await req("connectors/disconnect", a, { id: connection.id });
      assert.equal((await req("connectors", a)).data.bindings.length, 0);
      assert.deepEqual((await req("workspace", a)).data.workspace, saved);
    },
  );
  console.log(
    `${checks} connector checks passed using provider fixtures and real isolated database RLS.`,
  );
} finally {
  globalThis.fetch = realFetch;
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
