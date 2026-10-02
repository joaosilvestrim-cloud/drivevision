import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { transaction } from "./database.ts";
import {
  ConnectorError,
  encryptionKey,
  seal,
  unseal,
} from "./connector-security.ts";
import {
  fetchOmieSource,
  omieCredentials,
  omieOptions,
  omiePeriod,
  type OmieResult,
  type OmieCredentials,
} from "./omie-provider.ts";
import type { OmieOptions, OmiePreview } from "../lib/omie-types.ts";
import { nextRefreshAt } from "../lib/refresh-schedule.ts";

export function omieReady() {
  try {
    encryptionKey();
    return true;
  } catch {
    return false;
  }
}
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new ConnectorError(
      400,
      "Confira os campos da conexão Omie e tente novamente.",
    );
  return result.data;
}
const uuid = z.string().uuid();
const keyFor = (options: OmieOptions) =>
  `${options.dataset}:${options.periodDays}:${omiePeriod(options.periodDays).to}`;
const refFor = (key: string) => createHash("sha256").update(key).digest("hex");
const preview = (id: string, result: OmieResult): OmiePreview => ({
  connectionId: id,
  columns: result.source.columns,
  rows: result.source.rows.slice(0, 8),
  rowCount: result.source.rows.length,
  excluded: result.excluded,
  total: result.source.rows.reduce((n, r) => n + Number(r["Valor total"]), 0),
  from: result.from,
  to: result.to,
  fetchedAt: result.fetchedAt,
});

// The short-lived encrypted cache avoids repeating the same Omie query when
// confirming a preview. Only the current sanitized result is retained per connection.
export async function omieSource(
  owner: string,
  id: string,
  options: OmieOptions,
): Promise<OmieResult> {
  parse(omieOptions, options);
  return transaction(owner, async (c) => {
    const lock = await c.query(
      "select pg_try_advisory_xact_lock(hashtext($1)) as locked",
      ["omie:" + owner + ":" + id],
    );
    if (!lock.rows[0].locked)
      throw new ConnectorError(
        409,
        "Esta conexão Omie já está sendo consultada. Aguarde a conclusão.",
      );
    const row = (
      await c.query(
        "select tokens,api_cache,cache_key,cache_until>now() as cache_valid from drivevision.cloud_connections where id=$1 and owner_id=$2 and provider='omie' for share",
        [id, owner],
      )
    ).rows[0];
    if (!row) throw new ConnectorError(404, "Conexão Omie não encontrada.");
    if (row.api_cache && row.cache_key === keyFor(options) && row.cache_valid)
      return unseal<OmieResult>(row.api_cache, owner);
    const result = await fetchOmieSource(
      unseal<OmieCredentials>(row.tokens, owner),
      options,
    );
    await c.query(
      "update drivevision.cloud_connections set api_cache=$3,cache_key=$4,cache_until=now()+interval '65 seconds' where id=$1 and owner_id=$2",
      [id, owner, seal(result, owner), keyFor(options)],
    );
    return result;
  });
}
export async function omieRoute(
  owner: string,
  path: string,
  input: unknown,
): Promise<{
  data: OmiePreview | { id: string; sourceId: string };
  redirect?: undefined;
}> {
  if (path === "/api/connectors/omie/connect") {
    const r = parse(
      z
        .object({
          id: uuid.optional(),
          label: z.string().trim().min(1).max(120),
          credentials: omieCredentials,
          options: omieOptions,
        })
        .strict(),
      input,
    );
    const ref = refFor(r.credentials.appKey);
    return transaction(owner, async (c) => {
      if (
        !(
          await c.query(
            "select pg_try_advisory_xact_lock(hashtext($1)) as locked",
            ["cloud:" + owner],
          )
        ).rows[0].locked
      )
        throw new ConnectorError(
          409,
          "Outra conexão está sendo salva. Aguarde e tente novamente.",
        );
      const existing = (
        await c.query(
          "select id,credential_ref from drivevision.cloud_connections where owner_id=$1 and provider='omie' and (id=$2 or credential_ref=$3) for update",
          [owner, r.id || null, ref],
        )
      ).rows[0];
      if (r.id && (!existing || existing.id !== r.id))
        throw new ConnectorError(404, "Conexão Omie não encontrada.");
      if (existing && existing.credential_ref !== ref)
        throw new ConnectorError(
          400,
          "Para outra empresa Omie, crie uma nova conexão. Atualize somente o segredo desta empresa.",
        );
      if (
        !existing &&
        (
          await c.query(
            "select count(*)::int as n from drivevision.cloud_connections where owner_id=$1",
            [owner],
          )
        ).rows[0].n >= 10
      )
        throw new ConnectorError(400, "Use até 10 contas conectadas.");
      const result = await fetchOmieSource(r.credentials, r.options),
        id = existing?.id || randomUUID();
      await c.query(
        "insert into drivevision.cloud_connections(id,owner_id,provider,label,tokens,expires_at,credential_ref,api_cache,cache_key,cache_until) values($1,$2,'omie',$3,$4,'infinity',$5,$6,$7,now()+interval '65 seconds') on conflict(id) do update set label=excluded.label,tokens=excluded.tokens,api_cache=excluded.api_cache,cache_key=excluded.cache_key,cache_until=excluded.cache_until",
        [
          id,
          owner,
          r.label,
          seal(r.credentials, owner),
          ref,
          seal(result, owner),
          keyFor(r.options),
        ],
      );
      return { data: preview(id, result) };
    });
  }
  if (path === "/api/connectors/omie/preview") {
    const r = parse(
      z.object({ connectionId: uuid, options: omieOptions }).strict(),
      input,
    );
    return {
      data: preview(
        r.connectionId,
        await omieSource(owner, r.connectionId, r.options),
      ),
    };
  }
  if (path === "/api/connectors/omie/watch") {
    const r = parse(
      z
        .object({
          id: uuid.optional(),
          connectionId: uuid,
          options: omieOptions,
          name: z.string().trim().min(1).max(120),
          interval: z.union([z.literal(360), z.literal(1440)]),
        })
        .strict(),
      input,
    );
    // Validate credentials, completeness and preview before creating or changing a binding.
    const result = await omieSource(owner, r.connectionId, r.options);
    if (!result.source.rows.length && !r.id)
      throw new ConnectorError(
        422,
        "Nenhum pedido elegível neste período. Amplie o período antes de criar o painel.",
      );
    return transaction(owner, async (c) => {
      await c.query("select pg_advisory_xact_lock(hashtext($1))", [
        "watch:" + owner,
      ]);
      // Reload owned connection under lock: disconnect during a request cannot attach a foreign row.
      if (
        !(
          await c.query(
            "select id from drivevision.cloud_connections where id=$1 and owner_id=$2 and provider='omie' for share",
            [r.connectionId, owner],
          )
        ).rowCount
      )
        throw new ConnectorError(404, "Conexão Omie não encontrada.");
      const previous = r.id
        ? (
            await c.query(
              "select id,paused from drivevision.cloud_bindings where id=$1 and owner_id=$2 and connection_id=$3 and options->>'dataset'='omie-invoiced-orders' for update",
              [r.id, owner, r.connectionId],
            )
          ).rows[0]
        : (
            await c.query(
              "select id,paused from drivevision.cloud_bindings where owner_id=$1 and connection_id=$2 and options->>'dataset'='omie-invoiced-orders' and (options->>'periodDays')::int=$3",
              [owner, r.connectionId, r.options.periodDays],
            )
          ).rows[0];
      if (r.id && !previous)
        throw new ConnectorError(404, "Acompanhamento não encontrado.");
      const id = previous?.id || randomUUID();
      if (
        !previous &&
        (
          await c.query(
            "select count(*)::int as n from drivevision.cloud_bindings where owner_id=$1",
            [owner],
          )
        ).rows[0].n >= 20
      )
        throw new ConnectorError(
          400,
          "Use até 20 fontes acompanhadas por conta.",
        );
      await c.query(
        "insert into drivevision.cloud_bindings(id,owner_id,connection_id,source_id,name,target,options,interval_minutes) values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(id) do update set name=excluded.name,options=excluded.options,interval_minutes=excluded.interval_minutes,fingerprint=null",
        [
          id,
          owner,
          r.connectionId,
          "remote-" + id,
          r.name,
          JSON.stringify({
            id: "omie-invoiced-orders",
            name: "Omie · Pedidos faturados",
            kind: "file",
          }),
          JSON.stringify(r.options),
          r.interval,
        ],
      );
      await c.query(
        "insert into drivevision.cloud_schedule(binding_id,owner_id,due_at) values($1,$2,$3) on conflict(binding_id) do update set due_at=excluded.due_at,lease_token=null,lease_until=null",
        [
          id,
          owner,
          previous?.paused
            ? "infinity"
            : nextRefreshAt(r.interval, r.options.daily),
        ],
      );
      return { data: { id, sourceId: "remote-" + id } };
    });
  }
  throw new ConnectorError(404, "Recurso de conexão não encontrado.");
}
