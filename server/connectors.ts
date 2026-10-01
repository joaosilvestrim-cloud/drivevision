import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { transaction } from "./database.ts";
import { newToken, tokenHash } from "./security.ts";
import { ConnectorError, seal } from "./connector-security.ts";
import {
  providers,
  providerConfig,
  providerReady,
  exchange,
  accountLabel,
  browse,
  metadata,
} from "./cloud-providers.ts";
import { connectionAccess, previewRemote, syncBinding } from "./cloud-sync.ts";
import { nextRefreshAt, validTimeZone } from "../lib/refresh-schedule.ts";

const uuid = z.string().uuid();
const provider = z.enum(["onedrive", "sharepoint", "google"]);
const item = z
  .object({
    id: z.string().min(1).max(500),
    name: z.string().min(1).max(500),
    kind: z.enum(["file", "folder", "drive", "site"]),
    driveId: z.string().max(500).optional(),
    version: z.string().max(500).optional(),
    size: z.number().optional(),
    mime: z.string().max(200).optional(),
  })
  .strict();
const options = z
  .object({
    sheet: z.string().min(1).max(300),
    header: z.number().int().min(1).max(20000),
    left: z.number().int().min(1).max(160),
    right: z.number().int().min(1).max(160),
    end: z.number().int().min(2).max(20050).nullable(),
    skipTotals: z.boolean(),
    nameContains: z.string().max(100),
    daily: z
      .object({
        time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        timeZone: z.string().min(1).max(100).refine(validTimeZone),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine(
    (o) =>
      o.right >= o.left &&
      o.right - o.left < 60 &&
      (o.end === null || o.end > o.header),
  );
function parse<T>(schema: z.ZodType<T>, value: unknown) {
  const r = schema.safeParse(value);
  if (!r.success)
    throw new ConnectorError(
      400,
      "Confira a conexão, o conteúdo selecionado e o intervalo.",
    );
  return r.data;
}
export async function connectorsRoute(
  owner: string,
  sessionHash: string,
  path: string,
  method: string,
  input: unknown,
  url: URL,
  origin: string,
) {
  if (path === "/api/connectors" && method === "GET") {
    const state = await transaction(owner, async (c) => ({
      connections: (
        await c.query(
          "select id,provider,label from drivevision.cloud_connections where owner_id=$1 order by created_at",
          [owner],
        )
      ).rows,
      bindings: (
        await c.query(
          "select b.id,b.connection_id,b.source_id,b.name,b.target,b.options,b.interval_minutes,b.paused,b.last_success_at,b.last_checked_at,b.last_error,case when b.paused or s.due_at='infinity' then null else s.due_at end as next_due_at from drivevision.cloud_bindings b left join drivevision.cloud_schedule s on s.binding_id=b.id and s.owner_id=b.owner_id where b.owner_id=$1 order by b.created_at desc",
          [owner],
        )
      ).rows,
    }));
    return {
      data: {
        ...state,
        providers: providers.map((id) => ({
          id,
          configured: id !== "google" && providerReady(id),
        })),
        scheduled: !!process.env.CRON_SECRET,
      },
    };
  }
  if (path === "/api/connectors/start" && method === "POST") {
    const p = parse(z.object({ provider }).strict(), input).provider;
    if (p === "google")
      throw new ConnectorError(409, "Google Drive estará disponível em breve.");
    if (!providerReady(p))
      throw new ConnectorError(
        503,
        "Esta integração aguarda configuração pelo administrador.",
      );
    const state = newToken(),
      verifier = newToken(),
      redirect = `${origin}/api/connectors/callback/${p}`;
    await transaction(owner, async (c) => {
      await c.query(
        "delete from drivevision.cloud_oauth_states where owner_id=$1 and expires_at<now()",
        [owner],
      );
      await c.query(
        "insert into drivevision.cloud_oauth_states(hash,owner_id,provider,verifier,redirect_uri,session_hash,expires_at) values($1,$2,$3,$4,$5,$6,now()+interval '10 minutes')",
        [tokenHash(state), owner, p, verifier, redirect, sessionHash],
      );
    });
    const c = providerConfig(p),
      target = new URL(c.authorize);
    target.search = new URLSearchParams({
      client_id: c.clientId,
      response_type: "code",
      redirect_uri: redirect,
      scope: c.scope,
      state,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
      prompt: "select_account",
      response_mode: "query",
    }).toString();
    return { data: { url: target.href } };
  }
  if (path.startsWith("/api/connectors/callback/") && method === "GET") {
    const p = parse(provider, path.split("/").pop());
    const state = url.searchParams.get("state") || "";
    if (!/^[\w-]{43}$/.test(state))
      throw new ConnectorError(
        400,
        "Autorização inválida. Inicie a conexão novamente.",
      );
    const pending = await transaction(
      owner,
      async (c) =>
        (
          await c.query(
            "delete from drivevision.cloud_oauth_states where hash=$1 and owner_id=$2 and provider=$3 and session_hash=$4 and expires_at>now() returning verifier,redirect_uri",
            [tokenHash(state), owner, p, sessionHash],
          )
        ).rows[0],
    );
    if (!pending)
      throw new ConnectorError(
        400,
        "A autorização expirou ou pertence a outra sessão.",
      );
    if (url.searchParams.has("error"))
      return { redirect: "/?view=connections&connection=cancelled" };
    const code = url.searchParams.get("code");
    if (!code)
      throw new ConnectorError(400, "O provedor não retornou a autorização.");
    const tokens = await exchange(p, {
      grant_type: "authorization_code",
      code,
      code_verifier: pending.verifier,
      redirect_uri: pending.redirect_uri,
    });
    if (!tokens.refresh_token)
      throw new ConnectorError(
        400,
        "Autorize o acesso contínuo para atualizar com o navegador fechado.",
      );
    const label = await accountLabel(p, tokens.access_token);
    await transaction(owner, async (c) => {
      // Reconnection replaces credentials in place so existing selections keep working.
      await c.query("select pg_advisory_xact_lock(hashtext($1))", [
        "cloud:" + owner,
      ]);
      const existing = (
        await c.query(
          "select id from drivevision.cloud_connections where owner_id=$1 and provider=$2 and label=$3",
          [owner, p, label],
        )
      ).rows[0];
      if (existing)
        await c.query(
          "update drivevision.cloud_connections set tokens=$1,expires_at=now()+$2*interval '1 second' where id=$3",
          [seal(tokens, owner), tokens.expires_in, existing.id],
        );
      else {
        const count = (
          await c.query(
            "select count(*)::int as n from drivevision.cloud_connections where owner_id=$1",
            [owner],
          )
        ).rows[0].n;
        if (count >= 10)
          throw new ConnectorError(400, "Use até 10 contas conectadas.");
        await c.query(
          "insert into drivevision.cloud_connections(id,owner_id,provider,label,tokens,expires_at) values($1,$2,$3,$4,$5,now()+$6*interval '1 second')",
          [
            randomUUID(),
            owner,
            p,
            label,
            seal(tokens, owner),
            tokens.expires_in,
          ],
        );
      }
    });
    return { redirect: "/?view=connections&connection=success" };
  }
  if (path === "/api/connectors/browse" && method === "POST") {
    const r = parse(
      z
        .object({
          connectionId: uuid,
          target: item.optional(),
          page: z.string().max(6000).optional(),
          search: z.string().max(100).optional(),
        })
        .strict(),
      input,
    );
    const c = await connectionAccess(owner, r.connectionId);
    return {
      data: await browse(c.provider, c.access, r.target, r.page, r.search),
    };
  }
  if (path === "/api/connectors/preview" && method === "POST") {
    const r = parse(
      z
        .object({
          connectionId: uuid,
          target: item,
          options: options.optional(),
        })
        .strict(),
      input,
    );
    return {
      data: await previewRemote(owner, r.connectionId, r.target, r.options),
    };
  }
  if (path === "/api/connectors/watch" && method === "POST") {
    const r = parse(
      z
        .object({
          connectionId: uuid,
          target: item,
          options,
          name: z.string().trim().min(1).max(300),
          interval: z.union([
            z.literal(15),
            z.literal(60),
            z.literal(360),
            z.literal(1440),
          ]),
        })
        .strict(),
      input,
    );
    const c = await connectionAccess(owner, r.connectionId),
      target = await metadata(c.provider, c.access, r.target);
    if (!["file", "folder"].includes(target.kind))
      throw new ConnectorError(400, "Escolha um arquivo ou uma pasta.");
    const id = randomUUID();
    await transaction(owner, async (db) => {
      await db.query("select pg_advisory_xact_lock(hashtext($1))", [
        "watch:" + owner,
      ]);
      if (
        (
          await db.query(
            "select count(*)::int as n from drivevision.cloud_bindings where owner_id=$1",
            [owner],
          )
        ).rows[0].n >= 20
      )
        throw new ConnectorError(
          400,
          "Use até 20 fontes acompanhadas por conta.",
        );
      await db.query(
        "insert into drivevision.cloud_bindings(id,owner_id,connection_id,source_id,name,target,options,interval_minutes) values($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          id,
          owner,
          r.connectionId,
          "remote-" + id,
          r.name,
          JSON.stringify(target),
          JSON.stringify(r.options),
          r.interval,
        ],
      );
      await db.query(
        "insert into drivevision.cloud_schedule(binding_id,owner_id,due_at) values($1,$2,$3)",
        [
          id,
          owner,
          r.interval === 1440 && r.options.daily
            ? nextRefreshAt(r.interval, r.options.daily)
            : new Date(),
        ],
      );
    });
    // First refresh is separate: failures stay visible and can be retried without losing setup.
    return { data: { id } };
  }
  if (path === "/api/connectors/sync" && method === "POST") {
    const { id } = parse(z.object({ id: uuid }).strict(), input);
    return { data: await syncBinding(owner, id) };
  }
  if (path === "/api/connectors/selection" && method === "POST") {
    const r = parse(
      z
        .object({
          id: uuid,
          options,
          name: z.string().trim().min(1).max(300),
          interval: z.union([
            z.literal(15),
            z.literal(60),
            z.literal(360),
            z.literal(1440),
          ]),
        })
        .strict(),
      input,
    );
    await transaction(owner, async (c) => {
      const found = await c.query(
        "update drivevision.cloud_bindings set options=$2,name=$3,interval_minutes=$4,fingerprint=null where id=$1 returning id,paused",
        [r.id, JSON.stringify(r.options), r.name, r.interval],
      );
      if (!found.rowCount)
        throw new ConnectorError(404, "Acompanhamento não encontrado.");
      await c.query(
        "update drivevision.cloud_schedule set due_at=$3,lease_token=null,lease_until=null where binding_id=$1 and owner_id=$2",
        [
          r.id,
          owner,
          found.rows[0].paused
            ? "infinity"
            : r.interval === 1440 && r.options.daily
              ? nextRefreshAt(r.interval, r.options.daily)
              : new Date(),
        ],
      );
    });
    return { data: { id: r.id } };
  }
  if (path === "/api/connectors/update" && method === "POST") {
    const r = parse(
      z
        .object({
          id: uuid,
          paused: z.boolean(),
          interval: z.union([
            z.literal(15),
            z.literal(60),
            z.literal(360),
            z.literal(1440),
          ]),
        })
        .strict(),
      input,
    );
    await transaction(owner, async (c) => {
      const row = await c.query(
        "update drivevision.cloud_bindings set paused=$2,interval_minutes=$3 where id=$1 returning id,options",
        [r.id, r.paused, r.interval],
      );
      if (!row.rowCount)
        throw new ConnectorError(404, "Acompanhamento não encontrado.");
      await c.query(
        "update drivevision.cloud_schedule set due_at=$3,lease_token=null,lease_until=null where binding_id=$1 and owner_id=$2",
        [
          r.id,
          owner,
          r.paused
            ? "infinity"
            : r.interval === 1440 && row.rows[0].options.daily
              ? nextRefreshAt(r.interval, row.rows[0].options.daily)
              : new Date(),
        ],
      );
    });
    return { data: { ok: true } };
  }
  if (path === "/api/connectors/history" && method === "POST") {
    const { id } = parse(z.object({ id: uuid }).strict(), input);
    return {
      data: {
        runs: await transaction(
          owner,
          async (c) =>
            (
              await c.query(
                "select id,status,message,rows_count,created_at from drivevision.cloud_runs where binding_id=$1 order by created_at desc limit 30",
                [id],
              )
            ).rows,
        ),
      },
    };
  }
  if (path === "/api/connectors/disconnect" && method === "POST") {
    const { id } = parse(z.object({ id: uuid }).strict(), input);
    await transaction(owner, async (c) => {
      await c.query(
        "delete from drivevision.cloud_connections where id=$1 and owner_id=$2",
        [id, owner],
      );
    });
    return { data: { ok: true } };
  }
  if (path === "/api/connectors/remove" && method === "POST") {
    const { id } = parse(z.object({ id: uuid }).strict(), input);
    await transaction(owner, async (c) => {
      await c.query("delete from drivevision.cloud_bindings where id=$1", [id]);
    });
    return { data: { ok: true } };
  }
  throw new ConnectorError(404, "Recurso de conexão não encontrado.");
}
