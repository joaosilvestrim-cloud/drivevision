import { randomUUID, createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { database, transaction } from "./database.ts";
import { ConnectorError, seal, unseal } from "./connector-security.ts";
import {
  exchange,
  browse,
  metadata,
  download,
  supportedFile,
  withProviderDeadline,
  type OAuthTokens,
} from "./cloud-providers.ts";
import type {
  Provider,
  RemoteItem,
  RemoteOptions,
} from "../lib/connector-types.ts";
import type { Source } from "../lib/analytics.ts";
import {
  readWorkbook,
  normalizeSheet,
  detectTables,
  planFor,
} from "../lib/smart-import.ts";
import { workspaceSchema } from "./validation.ts";

export async function connectionAccess(owner: string, id: string) {
  return transaction(owner, async (c) => {
    if (
      !(
        await c.query(
          "select id from drivevision.accounts where id=$1 and disabled_at is null",
          [owner],
        )
      ).rowCount
    )
      throw new ConnectorError(401, "Conta indisponível.");
    const row = (
      await c.query(
        "select * from drivevision.cloud_connections where id=$1 and owner_id=$2 for update",
        [id, owner],
      )
    ).rows[0];
    if (!row) throw new ConnectorError(404, "Conexão não encontrada.");
    let tokens = unseal<OAuthTokens>(row.tokens, owner);
    if (new Date(row.expires_at).getTime() < Date.now() + 60000) {
      tokens = await exchange(row.provider, {
        grant_type: "refresh_token",
        refresh_token: tokens.refresh_token,
      });
      await c.query(
        "update drivevision.cloud_connections set tokens=$1,expires_at=now()+$2*interval '1 second' where id=$3",
        [seal(tokens, owner), tokens.expires_in, id],
      );
    }
    return { provider: row.provider as Provider, access: tokens.access_token };
  });
}
export function normalizedRemoteSource(
  book: Awaited<ReturnType<typeof readWorkbook>>,
  options: RemoteOptions,
) {
  const sheet = book.sheets.find((s) => s.name === options.sheet);
  if (!sheet)
    throw new ConnectorError(
      422,
      `A aba selecionada não está mais disponível. Revise o acompanhamento.`,
    );
  const plan = planFor(sheet, detectTables(sheet)[0]);
  try {
    const result = normalizeSheet(
      sheet,
      {
        ...plan,
        header: options.header - 1,
        headerDepth: 1,
        left: options.left - 1,
        right: options.right - 1,
        end: options.end === null ? sheet.rows.length - 1 : options.end - 1,
        skipTotals: options.skipTotals,
        unpivot: [],
        fillDown: [],
      },
      book.name,
    );
    return result.source;
  } catch (error) {
    throw new ConnectorError(
      422,
      error instanceof Error
        ? error.message
        : "Confira o intervalo selecionado.",
    );
  }
}
async function readRemoteWorkbook(file: { bytes: ArrayBuffer; name: string }) {
  try {
    return await readWorkbook(file.bytes, file.name);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    throw new ConnectorError(
      422,
      /^(Use |Selecione |A aba |A planilha |O CSV |Confira |Há aspas)/.test(
        message,
      )
        ? message
        : "Não foi possível ler esta planilha. Confira o formato e se o arquivo está protegido por senha.",
    );
  }
}
export async function previewRemote(
  owner: string,
  connection: string,
  target: RemoteItem,
  options?: RemoteOptions,
) {
  const { provider, access } = await connectionAccess(owner, connection);
  const item = await metadata(provider, access, target);
  const sample =
    item.kind === "folder"
      ? (
          await selectedFiles(
            provider,
            access,
            item,
            options || ({ nameContains: "" } as RemoteOptions),
          )
        )[0]
      : item;
  const file = await download(provider, access, sample);
  const book = await readRemoteWorkbook(file);
  const sheet = options
    ? book.sheets.find((s) => s.name === options.sheet)
    : book.sheets[0];
  if (!sheet) throw new ConnectorError(422, "Selecione uma aba válida.");
  const plan = planFor(sheet, detectTables(sheet)[0]);
  const selected: RemoteOptions = options || {
    sheet: sheet.name,
    header: plan.header + 1,
    left: plan.left + 1,
    right: Math.min(plan.right + 1, plan.left + 60),
    end: null,
    skipTotals: true,
    nameContains: "",
  };
  const source = normalizedRemoteSource(book, selected);
  return {
    item,
    sample: sample.name,
    options: selected,
    sheets: book.sheets.map((s) => s.name),
    columns: source.columns,
    rows: source.rows.slice(0, 8),
    rowCount: source.rows.length,
  };
}
export function assertCompatible(before: Source | undefined, next: Source) {
  if (!before) return;
  if (
    JSON.stringify(before.columns) !== JSON.stringify(next.columns) ||
    before.numeric.some((c) => !next.numeric.includes(c)) ||
    before.dates.some((c) => !next.dates.includes(c))
  )
    throw new ConnectorError(
      422,
      "As colunas ou tipos mudaram. A última versão foi preservada; revise a seleção antes de atualizar.",
    );
}
async function selectedFiles(
  provider: Provider,
  access: string,
  target: RemoteItem,
  options: RemoteOptions,
) {
  if (target.kind === "file") return [await metadata(provider, access, target)];
  const actual = await metadata(provider, access, target);
  if (actual.kind !== "folder")
    throw new ConnectorError(
      422,
      "A pasta selecionada não está mais disponível.",
    );
  const files: RemoteItem[] = [];
  let page: string | undefined;
  for (let n = 0; n < 5; n++) {
    const listing = await browse(provider, access, actual, page);
    files.push(
      ...listing.items.filter(
        (i) =>
          supportedFile(i) &&
          i.name.toLowerCase().includes(options.nameContains.toLowerCase()),
      ),
    );
    if (files.length > 10)
      throw new ConnectorError(
        422,
        "Esta seleção tem mais de 10 arquivos. Refine o filtro de nome ou escolha uma pasta menor.",
      );
    page = listing.next;
    if (!page) break;
  }
  if (page)
    throw new ConnectorError(
      422,
      "A pasta é muito grande. Escolha uma subpasta específica.",
    );
  if (!files.length)
    throw new ConnectorError(
      422,
      "Nenhum arquivo compatível encontrado. A última versão foi preservada.",
    );
  return files.sort((a, b) => a.id.localeCompare(b.id));
}
export async function syncBinding(
  owner: string,
  id: string,
  scheduled = false,
) {
  return withProviderDeadline(() =>
    syncBindingWithinDeadline(owner, id, scheduled),
  );
}
async function syncBindingWithinDeadline(
  owner: string,
  id: string,
  scheduled: boolean,
) {
  const deadline = Date.now() + 65000;
  const lease = randomUUID();
  const claim = await database().query(
    "update drivevision.cloud_schedule set lease_token=$3,lease_until=now()+interval '5 minutes' where binding_id=$1 and owner_id=$2 and (lease_until is null or lease_until<now()) and (not $4::boolean or due_at<=now()) returning binding_id",
    [id, owner, lease, scheduled],
  );
  if (!claim.rowCount)
    throw new ConnectorError(
      409,
      "Esta fonte já está sendo atualizada. Aguarde a conclusão.",
    );
  let interval = 60;
  let daily: import("../lib/refresh-schedule.ts").DailySchedule | undefined;
  let failed = false;
  try {
    const binding = await transaction(
      owner,
      async (c) =>
        (
          await c.query(
            "select * from drivevision.cloud_bindings where id=$1 and owner_id=$2",
            [id, owner],
          )
        ).rows[0],
    );
    if (!binding)
      throw new ConnectorError(404, "Acompanhamento não encontrado.");
    interval = binding.interval_minutes;
    daily = binding.options.daily;
    const { provider, access } = await connectionAccess(
      owner,
      binding.connection_id,
    );
    const files = await selectedFiles(
      provider,
      access,
      binding.target,
      binding.options,
    );
    const fingerprint = createHash("sha256")
      .update(JSON.stringify(files.map((f) => [f.id, f.version])))
      .digest("hex");
    let merged: Source | undefined;
    for (const item of files) {
      if (Date.now() > deadline)
        throw new ConnectorError(
          422,
          "A seleção levou tempo demais. Reduza a quantidade de arquivos.",
        );
      const file = await download(provider, access, item);
      const source = normalizedRemoteSource(
        await readRemoteWorkbook(file),
        binding.options,
      );
      if (merged) {
        assertCompatible(merged, source);
        merged.rows.push(...source.rows);
      } else merged = source;
      if (merged.rows.length > 20000)
        throw new ConnectorError(
          422,
          "A seleção ultrapassa 20 mil linhas. Reduza o intervalo ou os arquivos.",
        );
    }
    if (!merged) throw new ConnectorError(422, "A seleção não contém dados.");
    merged = { ...merged, id: binding.source_id, name: binding.name };
    const nextSource = merged;
    await transaction(owner, async (c) => {
      // Workspace lock serializes refresh with browser saves; stale tabs receive 409.
      const w = (
        await c.query(
          "select id,revision from drivevision.workspaces where owner_id=$1 for update",
          [owner],
        )
      ).rows[0];
      if (!w) throw new ConnectorError(404, "Workspace não encontrado.");
      const guard = await c.query(
        "select binding_id from drivevision.cloud_schedule where binding_id=$1 and owner_id=$2 and lease_token=$3 for update",
        [id, owner, lease],
      );
      if (!guard.rowCount)
        throw new ConnectorError(409, "A atualização foi cancelada.");
      const rows = (
        await c.query(
          "select payload from drivevision.sources where workspace_id=$1 order by position,id",
          [w.id],
        )
      ).rows.map((r) => r.payload);
      const old = rows.find((s) => s.id === binding.source_id);
      assertCompatible(old, nextSource);
      if (old) nextSource.createdAt = old.createdAt;
      const dashboards = (
        await c.query(
          "select payload from drivevision.dashboards where workspace_id=$1 order by position,id",
          [w.id],
        )
      ).rows.map((r) => r.payload);
      const workspace = {
        version: 1,
        sources: rebuildSources(
          old
            ? rows.map((s) => (s.id === binding.source_id ? nextSource : s))
            : [...rows, nextSource],
        ),
        dashboards,
      };
      if (
        !workspaceSchema.safeParse(workspace).success ||
        gzipSync(
          JSON.stringify({ workspace, revision: Number(w.revision) + 1 }),
        ).length > 3_500_000
      )
        throw new ConnectorError(
          413,
          "A atualização excederia o limite do workspace. A última versão foi preservada.",
        );
      const unchanged =
        binding.fingerprint === fingerprint &&
        old &&
        old.name === nextSource.name &&
        JSON.stringify(old.rows) === JSON.stringify(nextSource.rows);
      if (!unchanged) {
        await c.query(
          "insert into drivevision.sources(workspace_id,id,position,payload) values($1,$2,$3,$4) on conflict(workspace_id,id) do update set payload=excluded.payload,updated_at=now()",
          [w.id, binding.source_id, rows.length, JSON.stringify(nextSource)],
        );
        for (const derived of workspace.sources.filter((s) => s.recipe))
          await c.query(
            "update drivevision.sources set payload=$3,updated_at=now() where workspace_id=$1 and id=$2",
            [w.id, derived.id, JSON.stringify(derived)],
          );
        await recordSourceHistory(
          c,
          w.id,
          rows,
          workspace.sources,
          "remote-sync",
        );
        await c.query(
          "update drivevision.workspaces set revision=revision+1,updated_at=now() where id=$1",
          [w.id],
        );
      }
      await c.query(
        "update drivevision.cloud_bindings set fingerprint=$2,columns=$3,last_success_at=now(),last_checked_at=now(),last_error=null where id=$1",
        [id, fingerprint, JSON.stringify(nextSource.columns)],
      );
      await c.query(
        "insert into drivevision.cloud_runs(id,binding_id,owner_id,status,message,rows_count) values($1,$2,$3,$4,$5,$6)",
        [
          randomUUID(),
          id,
          owner,
          unchanged ? "unchanged" : "success",
          unchanged
            ? "Sem alterações no conteúdo."
            : "Fonte e dashboards atualizados.",
          nextSource.rows.length,
        ],
      );
    });
    return { ok: true, rows: nextSource.rows.length };
  } catch (error) {
    failed = true;
    const message =
      error instanceof ConnectorError
        ? error.message
        : "Não foi possível interpretar ou atualizar o conteúdo. A última versão foi preservada.";
    await transaction(owner, async (c) => {
      const found = await c.query(
        "update drivevision.cloud_bindings set last_checked_at=now(),last_error=$2 where id=$1 returning id",
        [id, message],
      );
      if (found.rowCount)
        await c.query(
          "insert into drivevision.cloud_runs(id,binding_id,owner_id,status,message) values($1,$2,$3,$4,$5)",
          [randomUUID(), id, owner, "error", message],
        );
    });
    throw error instanceof ConnectorError
      ? error
      : new ConnectorError(422, message);
  } finally {
    await transaction(owner, async (c) => {
      let due = nextRefreshAt(interval, daily);
      if (failed) {
        const recent = (
          await c.query(
            "select status from drivevision.cloud_runs where binding_id=$1 order by created_at desc limit 3",
            [id],
          )
        ).rows;
        let failures = 0;
        for (const run of recent) {
          if (run.status !== "error") break;
          failures++;
        }
        if (failures > 0 && failures < 3)
          due = new Date(
            Math.min(
              due.getTime(),
              Date.now() + (failures === 1 ? 5 : 15) * 60000,
            ),
          );
      }
      await c.query(
        "update drivevision.cloud_schedule set due_at=case when exists(select 1 from drivevision.cloud_bindings where id=$1 and paused) then 'infinity'::timestamptz else $4 end,lease_until=null,lease_token=null where binding_id=$1 and owner_id=$2 and lease_token=$3",
        [id, owner, lease, due],
      );
      await c.query(
        "delete from drivevision.cloud_runs where id in (select id from drivevision.cloud_runs where binding_id=$1 order by created_at desc offset 30)",
        [id],
      );
    });
  }
}
export async function syncDue() {
  const started = Date.now();
  let processed = 0;
  const rows = await database().query(
    "select s.binding_id,s.owner_id from drivevision.cloud_schedule s join drivevision.accounts a on a.id=s.owner_id where a.disabled_at is null and not exists(select 1 from drivevision.billing_queue b where b.owner_id=s.owner_id and coalesce(greatest(b.paid_until,b.trial_ends_at),'-infinity'::timestamptz)<=now()) and s.due_at<=now() and (s.lease_until is null or s.lease_until<now()) order by s.due_at limit 3",
  );
  for (const row of rows.rows) {
    if (Date.now() - started > 15000) break;
    processed++;
    try {
      const active = await transaction(
        row.owner_id,
        async (c) =>
          (
            await c.query(
              "select id from drivevision.cloud_bindings where id=$1 and not paused",
              [row.binding_id],
            )
          ).rowCount,
      );
      if (!active) {
        await database().query(
          "update drivevision.cloud_schedule set due_at=now()+interval '1 day' where binding_id=$1",
          [row.binding_id],
        );
        continue;
      }
      await syncBinding(row.owner_id, row.binding_id, true);
    } catch {
      /* A customer may be suspended after selection; continue with other tenants. */
    }
  }
  return { processed };
}
import { recordSourceHistory, rebuildSources } from "./source-history.ts";
import { nextRefreshAt } from "../lib/refresh-schedule.ts";
