import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { transaction } from "./database.ts";
import { newToken, tokenHash } from "./security.ts";
import { ConnectorError, seal, unseal } from "./connector-security.ts";
import {
  contaAzulAuthorize,
  contaAzulExchange,
  contaAzulOptions,
  caGet,
  caPage,
  caRow,
  caSource,
  caWindows,
  type CaTokens,
} from "./contaazul-provider.ts";
import type { DataRow } from "../lib/analytics.ts";
import type { ContaAzulOptions } from "../lib/contaazul-types.ts";

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const p = schema.safeParse(value);
  if (!p.success)
    throw new ConnectorError(400, "Confira os campos da conexão Conta Azul.");
  return p.data;
}
const uuid = z.string().uuid();
export async function contaAzulRoute(
  owner: string,
  session: string,
  path: string,
  method: string,
  input: unknown,
  url: URL,
  origin: string,
): Promise<{ data?: unknown; redirect?: string }> {
  if (path === "/api/connectors/contaazul/start" && method === "POST") {
    const r = parse(
      z.object({ label: z.string().trim().min(1).max(120) }).strict(),
      input,
    );
    const state = newToken(),
      redirect = origin + "/api/connectors/callback/contaazul";
    const target = contaAzulAuthorize(state, redirect);
    await transaction(owner, async (c) => {
      await c.query(
        "delete from drivevision.cloud_oauth_states where owner_id=$1 and expires_at<now()",
        [owner],
      );
      await c.query(
        "insert into drivevision.cloud_oauth_states(hash,owner_id,provider,verifier,redirect_uri,session_hash,expires_at) values($1,$2,'contaazul',$3,$4,$5,now()+interval '10 minutes')",
        [tokenHash(state), owner, r.label, redirect, session],
      );
    });
    return { data: { url: target } };
  }
  if (path === "/api/connectors/callback/contaazul" && method === "GET") {
    const state = url.searchParams.get("state") || "";
    if (!/^[\w-]{43}$/.test(state))
      throw new ConnectorError(400, "Autorização inválida. Conecte novamente.", "ca_state");
    const pending = await transaction(
      owner,
      async (c) =>
        (
          await c.query(
            "delete from drivevision.cloud_oauth_states where hash=$1 and owner_id=$2 and provider='contaazul' and session_hash=$3 and expires_at>now() returning verifier,redirect_uri",
            [tokenHash(state), owner, session],
          )
        ).rows[0],
    );
    if (!pending)
      throw new ConnectorError(
        400,
        "A autorização expirou ou pertence a outra sessão.",
        "ca_state",
      );
    if (url.searchParams.has("error"))
      return { redirect: "/?view=connections&connection=cancelled" };
    const code = url.searchParams.get("code");
    if (!code || code.length > 4096)
      throw new ConnectorError(
        400,
        "A Conta Azul não retornou uma autorização válida.",
        "ca_grant",
      );
    const tokens = await contaAzulExchange({
      grant_type: "authorization_code",
      code,
      redirect_uri: pending.redirect_uri,
    });
    // Identity comes only from a token fetched directly from the fixed TLS token endpoint.
    let identity: unknown;
    try {
      const claims = JSON.parse(
        Buffer.from(tokens.access_token.split(".")[1], "base64url").toString(),
      );
      identity = claims.username ?? claims.sub;
    } catch {}
    if (typeof identity !== "string" || !identity)
      throw new ConnectorError(
        502,
        "Não foi possível identificar a empresa autorizada.",
        "ca_identity",
      );
    const ref = createHash("sha256").update(identity).digest("hex");
    const id = await transaction(owner, async (c) => {
      await c.query("select pg_advisory_xact_lock(hashtext($1))", [
        "cloud:" + owner,
      ]);
      const old = (
        await c.query(
          "select id from drivevision.cloud_connections where owner_id=$1 and provider='contaazul' and credential_ref=$2 for update",
          [owner, ref],
        )
      ).rows[0];
      if (
        !old &&
        (
          await c.query(
            "select count(*)::int as n from drivevision.cloud_connections where owner_id=$1",
            [owner],
          )
        ).rows[0].n >= 10
      )
        throw new ConnectorError(400, "Use até 10 contas conectadas.");
      const id = old?.id || randomUUID();
      await c.query(
        "insert into drivevision.cloud_connections(id,owner_id,provider,label,tokens,expires_at,credential_ref) values($1,$2,'contaazul',$3,$4,now()+$5*interval '1 second',$6) on conflict(id) do update set tokens=excluded.tokens,expires_at=excluded.expires_at,label=excluded.label",
        [
          id,
          owner,
          pending.verifier,
          seal(tokens, owner),
          tokens.expires_in,
          ref,
        ],
      );
      return id;
    }).catch(() => {
      throw new ConnectorError(503, "Não foi possível salvar a conexão Conta Azul.", "ca_storage");
    });
    return {
      redirect: "/?view=connections&connection=contaazul&account=" + id,
    };
  }
  if (path === "/api/connectors/contaazul/watch" && method === "POST") {
    const r = parse(
      z
        .object({
          connectionId: uuid,
          name: z.string().trim().min(1).max(120),
          options: contaAzulOptions,
        })
        .strict(),
      input,
    );
    return transaction(owner, async (c) => {
      const conn = (
        await c.query(
          "select id from drivevision.cloud_connections where id=$1 and owner_id=$2 and provider='contaazul' for update",
          [r.connectionId, owner],
        )
      ).rows[0];
      if (!conn)
        throw new ConnectorError(404, "Conexão Conta Azul não encontrada.");
      const old = (
        await c.query(
          "select id from drivevision.cloud_bindings where connection_id=$1 and owner_id=$2",
          [conn.id, owner],
        )
      ).rows[0];
      if (
        !old &&
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
      const id = old?.id || randomUUID();
      await c.query(
        "insert into drivevision.cloud_bindings(id,owner_id,connection_id,source_id,name,target,options,interval_minutes) values($1,$2,$3,$4,$5,$6,$7,1440) on conflict(id) do update set name=excluded.name,options=excluded.options,paused=false,fingerprint=null,last_error=null",
        [
          id,
          owner,
          conn.id,
          "remote-" + id,
          r.name,
          JSON.stringify({
            id: "contaazul-financial",
            name: "Conta Azul · Financeiro por vencimento",
            kind: "file",
          }),
          JSON.stringify(r.options),
        ],
      );
      // Invalidating the lease prevents an in-flight older selection from publishing.
      await c.query(
        "insert into drivevision.cloud_schedule(binding_id,owner_id,due_at) values($1,$2,now()) on conflict(binding_id) do update set due_at=now(),lease_token=null,lease_until=null",
        [id, owner],
      );
      await c.query(
        "delete from drivevision.contaazul_jobs where binding_id=$1",
        [id],
      );
      return { data: { id, sourceId: "remote-" + id } };
    });
  }
  if (path === "/api/connectors/contaazul/progress" && method === "POST") {
    const r = parse(z.object({ id: uuid }).strict(), input);
    const row = await transaction(
      owner,
      async (c) =>
        (
          await c.query(
            "select b.id,b.source_id,b.fingerprint,b.last_success_at,b.last_error,j.completed,j.total,j.rows_count from drivevision.cloud_bindings b left join drivevision.contaazul_jobs j on j.binding_id=b.id where b.id=$1 and b.owner_id=$2 and b.options->>'dataset'='contaazul-financial'",
            [r.id, owner],
          )
        ).rows[0],
    );
    if (!row) throw new ConnectorError(404, "Acompanhamento não encontrado.");
    return {
      data: {
        id: row.id,
        sourceId: row.source_id,
        status:
          row.last_success_at && row.fingerprint && row.completed == null
            ? "ready"
            : "pending",
        completed: row.completed ?? 0,
        total: row.total ?? 1,
        rows: row.rows_count ?? 0,
        error: row.last_error,
      },
    };
  }
  throw new ConnectorError(404, "Recurso de conexão não encontrado.");
}
async function access(owner: string, id: string) {
  return transaction(owner, async (c) => {
    const conn = (
      await c.query(
        "select tokens,expires_at from drivevision.cloud_connections where id=$1 and owner_id=$2 and provider='contaazul' for update",
        [id, owner],
      )
    ).rows[0];
    if (!conn)
      throw new ConnectorError(404, "Conexão Conta Azul não encontrada.");
    let tokens = unseal<CaTokens>(conn.tokens, owner);
    if (new Date(conn.expires_at).getTime() < Date.now() + 120000) {
      tokens = await contaAzulExchange({
        grant_type: "refresh_token",
        refresh_token: tokens.refresh_token,
      });
      await c.query(
        "update drivevision.cloud_connections set tokens=$3,expires_at=now()+$4*interval '1 second' where id=$1 and owner_id=$2",
        [id, owner, seal(tokens, owner), tokens.expires_in],
      );
    }
    return tokens.access_token;
  });
}
type Job = {
  windows: [string, string][];
  step: number;
  page: number;
  expected: number | null;
  seen: number;
  rows: Record<string, DataRow>;
  today: string;
};
export async function contaAzulStep(
  owner: string,
  binding: { id: string; connection_id: string; options: ContaAzulOptions },
  lease: string,
) {
  const options = parse(contaAzulOptions, binding.options);
  const stored = await transaction(
    owner,
    async (c) =>
      (
        await c.query(
          "select payload from drivevision.contaazul_jobs where binding_id=$1",
          [binding.id],
        )
      ).rows[0],
  );
  const windows = caWindows(options.periodDays);
  const job: Job = stored
    ? unseal<Job>(stored.payload, owner)
    : {
        windows,
        step: 0,
        page: 1,
        expected: null,
        seen: 0,
        rows: {},
        today: new Date().toLocaleDateString("en-CA", {
          timeZone: "America/Sao_Paulo",
        }),
      };
  const total = job.windows.length * 2;
  const token = await access(owner, binding.connection_id);
  // Four pages per invocation: bounded API work; every page commits its checkpoint.
  for (let n = 0; n < 4 && job.step < total; n++) {
    const kind = job.step < job.windows.length ? "receber" : "pagar";
    const [from, to] = job.windows[job.step % job.windows.length];
    const raw = await caGet(
      token,
      `/v1/financeiro/eventos-financeiros/contas-a-${kind}/buscar`,
      {
        pagina: job.page,
        tamanho_pagina: 100,
        data_vencimento_de: from,
        data_vencimento_ate: to,
      },
    );
    const page = caPage(raw, job.page);
    if (job.expected !== null && job.expected !== page.total)
      throw new ConnectorError(
        409,
        "Os dados mudaram durante a importação. Selecione o período novamente para reiniciar.",
      );
    job.expected = page.total;
    for (const item of page.items) {
      const row = caRow(item, kind, job.today),
        key = row["ID da parcela"];
      if (row.Vencimento < from || row.Vencimento > to || job.rows[key])
        throw new ConnectorError(
          422,
          "A Conta Azul retornou parcelas repetidas ou fora do período. Reinicie a seleção.",
        );
      job.rows[key] = row;
    }
    job.seen += page.items.length;
    if (Object.keys(job.rows).length > 20000)
      throw new ConnectorError(
        413,
        "O limite é de 20 mil parcelas. Reduza o período.",
      );
    if (page.done) {
      if (job.seen !== page.total)
        throw new ConnectorError(
          422,
          "A Conta Azul retornou uma página incompleta. A carga anterior foi preservada.",
        );
      job.step++;
      job.page = 1;
      job.seen = 0;
      job.expected = null;
    } else job.page++;
    await transaction(owner, async (c) => {
      const guard = await c.query(
        "select binding_id from drivevision.cloud_schedule where binding_id=$1 and owner_id=$2 and lease_token=$3 for update",
        [binding.id, owner, lease],
      );
      if (!guard.rowCount)
        throw new ConnectorError(409, "A atualização foi cancelada.");
      await c.query(
        "insert into drivevision.contaazul_jobs(binding_id,owner_id,payload,completed,total,rows_count) values($1,$2,$3,$4,$5,$6) on conflict(binding_id) do update set payload=excluded.payload,completed=excluded.completed,total=excluded.total,rows_count=excluded.rows_count,updated_at=now()",
        [
          binding.id,
          owner,
          seal(job, owner),
          job.step,
          total,
          Object.keys(job.rows).length,
        ],
      );
    });
    // At most 4 calls/second even for immediately resolved responses.
    if (n < 3 && job.step < total) await new Promise((r) => setTimeout(r, 250));
  }
  if (job.step < total) return null;
  return caSource(
    Object.values(job.rows).sort((a, b) =>
      a["ID da parcela"].localeCompare(b["ID da parcela"]),
    ),
    job.windows[0][0],
    job.windows.at(-1)![1],
  );
}
