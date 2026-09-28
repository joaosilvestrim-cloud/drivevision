import { randomUUID, createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import type { PoolClient } from "pg";
import type { Source } from "../lib/analytics.ts";
import {
  refreshDerived,
  assertSourceCompatible,
} from "../lib/source-lifecycle.ts";
import { transaction } from "./database.ts";
import { ConnectorError } from "./connector-security.ts";
import { workspaceSchema } from "./validation.ts";

export const HISTORY_LIMITS = {
  versionsPerSource: 20,
  workspaceBytes: 50_000_000,
};
const digest = (source: Source) =>
  createHash("sha256")
    .update(
      JSON.stringify({
        columns: source.columns,
        numeric: source.numeric,
        dates: source.dates,
        rows: source.rows,
        recipe: source.recipe,
      }),
    )
    .digest("hex");
function delta(before: Source | undefined, after: Source) {
  const cols = [...after.columns].sort();
  const key = (row: Record<string, string>) =>
    JSON.stringify(cols.map((c) => row[c] ?? ""));
  const counts = new Map<string, number>();
  for (const row of before?.rows || []) {
    const k = key(row);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  let unchanged = 0;
  for (const row of after.rows) {
    const k = key(row),
      n = counts.get(k) || 0;
    if (n) {
      unchanged++;
      counts.set(k, n - 1);
    }
  }
  return {
    added: after.rows.length - unchanged,
    removed: (before?.rows.length || 0) - unchanged,
    unchanged,
  };
}
// Call while holding the workspace lock, in the same transaction as publication.
export async function recordSourceHistory(
  c: PoolClient,
  workspaceId: string,
  before: Source[],
  after: Source[],
  reason: string,
) {
  for (const source of after) {
    const old = before.find((s) => s.id === source.id);
    if (old && digest(old) === digest(source)) continue;
    const entries = await c.query(
      "select id from drivevision.source_versions where workspace_id=$1 and source_id=$2 limit 1",
      [workspaceId, source.id],
    );
    const snapshots =
      old && !entries.rowCount
        ? [
            { source: old, before: undefined, reason: "baseline" },
            { source, before: old, reason },
          ]
        : [{ source, before: old, reason }];
    for (const entry of snapshots) {
      const payload = gzipSync(JSON.stringify(entry.source));
      await c.query(
        "insert into drivevision.source_versions(id,workspace_id,source_id,payload,bytes,metadata) values($1,$2,$3,$4,$5,$6)",
        [
          randomUUID(),
          workspaceId,
          source.id,
          payload,
          payload.length,
          JSON.stringify({
            name: entry.source.name,
            file: entry.source.importNotes?.file || null,
            rows: entry.source.rows.length,
            reason: entry.reason,
            changes: delta(entry.before, entry.source),
          }),
        ],
      );
    }
  }
  // Volume-based retention is explicit in the UI. Current source data is never pruned.
  await c.query(
    "delete from drivevision.source_versions where id in (select id from (select id,row_number() over(partition by source_id order by created_at desc,sequence desc) as n from drivevision.source_versions where workspace_id=$1) ranked where n>$2)",
    [workspaceId, HISTORY_LIMITS.versionsPerSource],
  );
  await c.query(
    "delete from drivevision.source_versions where id in (select id from (select id,sum(bytes) over(order by created_at desc,sequence desc) as total from drivevision.source_versions where workspace_id=$1) ranked where total>$2)",
    [workspaceId, HISTORY_LIMITS.workspaceBytes],
  );
}
export async function historyRoute(
  owner: string,
  method: string,
  url: URL,
  input?: unknown,
) {
  return transaction(owner, async (c) => {
    const w = (
      await c.query(
        `select id,revision from drivevision.workspaces where owner_id=$1 ${method === "POST" ? "for update" : "for share"}`,
        [owner],
      )
    ).rows[0];
    if (!w) throw new ConnectorError(404, "Workspace não encontrado.");
    if (method === "GET") {
      const versionId = url.searchParams.get("version");
      if (versionId) {
        if (!/^[0-9a-f-]{36}$/i.test(versionId))
          throw new ConnectorError(400, "Versão inválida.");
        const v = (
          await c.query(
            "select payload from drivevision.source_versions where workspace_id=$1 and id=$2",
            [w.id, versionId],
          )
        ).rows[0];
        if (!v)
          throw new ConnectorError(
            404,
            "Versão indisponível ou removida pela retenção.",
          );
        return { source: JSON.parse(gunzipSync(v.payload).toString()) };
      }
      const source = url.searchParams.get("source");
      if (!source || source.length > 100)
        throw new ConnectorError(400, "Selecione uma base.");
      const versions = await c.query(
        "select id,created_at,bytes,metadata from drivevision.source_versions where workspace_id=$1 and source_id=$2 order by created_at desc,sequence desc limit 20",
        [w.id, source],
      );
      const bytes = (
        await c.query(
          "select coalesce(sum(bytes),0) as used from drivevision.source_versions where workspace_id=$1",
          [w.id],
        )
      ).rows[0].used;
      return {
        versions: versions.rows,
        limits: HISTORY_LIMITS,
        usedBytes: Number(bytes),
        revision: Number(w.revision),
      };
    }
    const body = input as
      | {
          action?: string;
          versionId?: string;
          sourceId?: string;
          revision?: number;
        }
      | undefined;
    if (
      method !== "POST" ||
      !body ||
      !["restore", "delete"].includes(body.action || "")
    )
      throw new ConnectorError(400, "Operação inválida.");
    if (body.revision !== Number(w.revision))
      throw new ConnectorError(
        409,
        "O workspace mudou. Recarregue antes de alterar o histórico.",
      );
    if (body.action === "delete") {
      if (typeof body.sourceId !== "string" || body.sourceId.length > 100)
        throw new ConnectorError(400, "Base inválida.");
      await c.query(
        "delete from drivevision.source_versions where workspace_id=$1 and source_id=$2",
        [w.id, body.sourceId],
      );
    } else {
      if (
        typeof body.versionId !== "string" ||
        !/^[0-9a-f-]{36}$/i.test(body.versionId)
      )
        throw new ConnectorError(400, "Versão inválida.");
      const version = (
        await c.query(
          "select payload from drivevision.source_versions where workspace_id=$1 and id=$2",
          [w.id, body.versionId],
        )
      ).rows[0];
      if (!version) throw new ConnectorError(404, "Versão indisponível.");
      const restored = JSON.parse(
        gunzipSync(version.payload).toString(),
      ) as Source;
      const before = (
        await c.query(
          "select payload from drivevision.sources where workspace_id=$1 order by position,id",
          [w.id],
        )
      ).rows.map((r) => r.payload as Source);
      const current = before.find((s) => s.id === restored.id);
      if (!current)
        throw new ConnectorError(404, "A base original foi excluída.");
      if (current.recipe)
        throw new ConnectorError(
          422,
          "Restaure uma origem para recalcular esta combinação.",
        );
      try {
        assertSourceCompatible(current, restored);
      } catch (e) {
        throw new ConnectorError(422, (e as Error).message);
      }
      const sources = rebuildSources(
        before.map((s) =>
          s.id === restored.id ? { ...restored, name: current.name } : s,
        ),
      );
      const dashboards = (
        await c.query(
          "select payload from drivevision.dashboards where workspace_id=$1 order by position,id",
          [w.id],
        )
      ).rows.map((r) => r.payload);
      const workspace = { version: 1, sources, dashboards };
      if (
        !workspaceSchema.safeParse(workspace).success ||
        gzipSync(
          JSON.stringify({ workspace, revision: Number(w.revision) + 1 }),
        ).length > 3_500_000
      )
        throw new ConnectorError(
          413,
          "A restauração ultrapassaria o limite do workspace.",
        );
      for (const source of sources)
        await c.query(
          "update drivevision.sources set payload=$3,updated_at=now() where workspace_id=$1 and id=$2",
          [w.id, source.id, JSON.stringify(source)],
        );
      await recordSourceHistory(
        c,
        w.id,
        before,
        sources,
        `restore:${body.versionId}`,
      );
      // Pause automatic refresh so it cannot immediately undo a reviewed restoration.
      await c.query(
        "update drivevision.cloud_bindings set paused=true where owner_id=$1 and source_id=$2",
        [owner, restored.id],
      );
      await c.query(
        "update drivevision.cloud_schedule set due_at='infinity',lease_until=null,lease_token=null where owner_id=$1 and binding_id in (select id from drivevision.cloud_bindings where owner_id=$1 and source_id=$2)",
        [owner, restored.id],
      );
    }
    await c.query(
      "update drivevision.workspaces set revision=revision+1,updated_at=now() where id=$1",
      [w.id],
    );
    return { ok: true };
  });
}
export function rebuildSources(sources: Source[]) {
  try {
    return refreshDerived(sources);
  } catch (e) {
    throw new ConnectorError(422, (e as Error).message);
  }
}
