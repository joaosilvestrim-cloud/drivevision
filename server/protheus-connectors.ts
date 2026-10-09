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
  fetchProtheusSource,
  protheusCredentials,
  protheusOptions,
  protheusPeriod,
  type ProtheusResult,
  type ProtheusCredentials,
} from "./protheus-provider.ts";
import type {
  ProtheusOptions,
  ProtheusPreview,
} from "../lib/protheus-types.ts";
import { nextRefreshAt } from "../lib/refresh-schedule.ts";

export function protheusReady() {
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
      "Confira os campos da conexão Protheus e tente novamente.",
    );
  return result.data;
}
const uuid = z.string().uuid();
const keyFor = (options: ProtheusOptions) =>
  JSON.stringify([
    options.dataset,
    options.periodDays,
    options.titleTypes.slice().sort(),
    protheusPeriod(options.periodDays).today,
  ]);
const refFor = (key: string) => createHash("sha256").update(key).digest("hex");
const preview = (id: string, result: ProtheusResult): ProtheusPreview => ({
  connectionId: id,
  columns: result.source.columns,
  rows: result.source.rows.slice(0, 8),
  rowCount: result.source.rows.length,
  fingerprint: result.fingerprint,
  totals: result.totals,
  from: result.from,
  to: result.to,
  fetchedAt: result.fetchedAt,
});

// The short-lived encrypted cache avoids repeating the same Protheus query when
// confirming a preview. Only the current sanitized result is retained per connection.
export async function protheusSource(
  owner: string,
  id: string,
  options: ProtheusOptions,
): Promise<ProtheusResult> {
  parse(protheusOptions, options);
  return transaction(owner, async (c) => {
    const lock = await c.query(
      "select pg_try_advisory_xact_lock(hashtext($1)) as locked",
      ["protheus:" + owner + ":" + id],
    );
    if (!lock.rows[0].locked)
      throw new ConnectorError(
        409,
        "Esta conexão Protheus já está sendo consultada. Aguarde a conclusão.",
      );
    const row = (
      await c.query(
        "select tokens,api_cache,cache_key,cache_until>now() as cache_valid from drivevision.cloud_connections where id=$1 and owner_id=$2 and provider='protheus' for share",
        [id, owner],
      )
    ).rows[0];
    if (!row) throw new ConnectorError(404, "Conexão Protheus não encontrada.");
    if (row.api_cache && row.cache_key === keyFor(options) && row.cache_valid)
      return unseal<ProtheusResult>(row.api_cache, owner);
    const result = await fetchProtheusSource(
      unseal<ProtheusCredentials>(row.tokens, owner),
      options,
    );
    await c.query(
      "update drivevision.cloud_connections set api_cache=$3,cache_key=$4,cache_until=now()+interval '65 seconds' where id=$1 and owner_id=$2",
      [id, owner, seal(result, owner), keyFor(options)],
    );
    return result;
  });
}
export async function protheusRoute(
  owner: string,
  path: string,
  input: unknown,
): Promise<{
  data: ProtheusPreview | { id: string; sourceId: string };
  redirect?: undefined;
}> {
  if (path === "/api/connectors/protheus/connect") {
    const r = parse(
      z
        .object({
          id: uuid.optional(),
          label: z.string().trim().min(1).max(120),
          credentials: protheusCredentials,
          options: protheusOptions,
        })
        .strict(),
      input,
    );
    const ref = refFor(
      JSON.stringify([
        r.credentials.baseUrl,
        r.credentials.company,
        r.credentials.branch,
        r.credentials.username,
      ]),
    );
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
          "select id,credential_ref from drivevision.cloud_connections where owner_id=$1 and provider='protheus' and (id=$2 or credential_ref=$3) for update",
          [owner, r.id || null, ref],
        )
      ).rows[0];
      if (r.id && (!existing || existing.id !== r.id))
        throw new ConnectorError(404, "Conexão Protheus não encontrada.");
      if (existing && existing.credential_ref !== ref)
        throw new ConnectorError(
          400,
          "Para outra empresa Protheus, crie uma nova conexão. Atualize somente o segredo desta empresa.",
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
      const result = await fetchProtheusSource(r.credentials, r.options),
        id = existing?.id || randomUUID();
      await c.query(
        "insert into drivevision.cloud_connections(id,owner_id,provider,label,tokens,expires_at,credential_ref,api_cache,cache_key,cache_until) values($1,$2,'protheus',$3,$4,'infinity',$5,$6,$7,now()+interval '65 seconds') on conflict(id) do update set label=excluded.label,tokens=excluded.tokens,api_cache=excluded.api_cache,cache_key=excluded.cache_key,cache_until=excluded.cache_until",
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
  if (path === "/api/connectors/protheus/preview") {
    const r = parse(
      z.object({ connectionId: uuid, options: protheusOptions }).strict(),
      input,
    );
    return {
      data: preview(
        r.connectionId,
        await protheusSource(owner, r.connectionId, r.options),
      ),
    };
  }
  if (path === "/api/connectors/protheus/watch") {
    const r = parse(
      z
        .object({
          id: uuid.optional(),
          connectionId: uuid,
          options: protheusOptions,
          name: z.string().trim().min(1).max(120),
          interval: z.literal(1440),
          fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
        })
        .strict(),
      input,
    );
    // Validate credentials, completeness and preview before creating or changing a binding.
    const result = await protheusSource(owner, r.connectionId, r.options);
    if (result.fingerprint !== r.fingerprint)
      throw new ConnectorError(
        409,
        "Os dados mudaram desde a conferência. Consulte novamente e confirme os novos totais.",
      );
    if (!result.source.rows.length && !r.id)
      throw new ConnectorError(
        422,
        "Nenhum título elegível neste período. Amplie o período antes de criar o painel.",
      );
    return transaction(owner, async (c) => {
      await c.query("select pg_advisory_xact_lock(hashtext($1))", [
        "watch:" + owner,
      ]);
      // Reload owned connection under lock: disconnect during a request cannot attach a foreign row.
      if (
        !(
          await c.query(
            "select id from drivevision.cloud_connections where id=$1 and owner_id=$2 and provider='protheus' for share",
            [r.connectionId, owner],
          )
        ).rowCount
      )
        throw new ConnectorError(404, "Conexão Protheus não encontrada.");
      const previous = r.id
        ? (
            await c.query(
              "select id,paused from drivevision.cloud_bindings where id=$1 and owner_id=$2 and connection_id=$3 and options->>'dataset'='protheus-financial' for update",
              [r.id, owner, r.connectionId],
            )
          ).rows[0]
        : (
            await c.query(
              "select id,paused from drivevision.cloud_bindings where owner_id=$1 and connection_id=$2 and options->>'dataset'='protheus-financial' and (options->>'periodDays')::int=$3 and options->'titleTypes'=$4::jsonb",
              [
                owner,
                r.connectionId,
                r.options.periodDays,
                JSON.stringify(r.options.titleTypes.slice().sort()),
              ],
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
            id: "protheus-financial",
            name: "Protheus · Títulos em aberto",
            kind: "file",
          }),
          JSON.stringify({
            ...r.options,
            titleTypes: r.options.titleTypes.slice().sort(),
          }),
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
