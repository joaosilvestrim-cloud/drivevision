"use client";
import { t as translate, locale } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { History, Download, RotateCcw, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { apiJson } from "@/lib/cloud-workspace";
import { toCSV, type Source } from "@/lib/analytics";
import { downloadFile } from "./analytics-studio";
type Version = {
  id: string;
  created_at: string;
  bytes: number;
  metadata: {
    name: string;
    file: string | null;
    rows: number;
    reason: string;
    changes: { added: number; removed: number; unchanged: number };
  };
};
type Listing = {
  versions: Version[];
  revision: number;
  usedBytes: number;
  limits: { versionsPerSource: number; workspaceBytes: number };
};
export function SourceHistory({
  source,
  onClose,
  onChanged,
}: {
  source: Source;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [listing, setListing] = useState<Listing | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<{
    action: "restore" | "delete";
    versionId?: string;
  } | null>(null);
  useEffect(() => {
    let active = true;
    apiJson<Listing>(`history?source=${encodeURIComponent(source.id)}`)
      .then((value) => {
        if (active) setListing(value);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [source.id]);
  async function exportVersion(id: string) {
    setBusy(true);
    setError("");
    try {
      const result = await apiJson<{ source: Source }>(`history?version=${id}`);
      downloadFile(
        `${source.name}-versao.csv`,
        toCSV(result.source),
        "text/csv;charset=utf-8",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    if (!confirm || !listing) return;
    setBusy(true);
    setError("");
    try {
      await apiJson("history", {
        ...confirm,
        sourceId: source.id,
        revision: listing.revision,
      });
      await onChanged();
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent
        className="app-dialog wide-dialog history-dialog"
        onEscapeKeyDown={(e) => busy && e.preventDefault()}
        onPointerDownOutside={(e) => busy && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            <History size={20} /> {translate(" Histórico · ")}
            {source.name}
          </DialogTitle>
          <DialogDescription>
            {translate(
              " Versões dos dados organizados, com exportação e recuperação. ",
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="history-body">
          <p className="history-policy">
            {translate(
              " Guardamos até 20 versões por base, dentro de 50 MB compactados por conta. As mais antigas são removidas ao atingir esses limites. Os dados atuais não são removidos. O arquivo Excel original não é armazenado aqui. Este histórico de versões não define o período de vendas que você pode analisar. ",
            )}
          </p>
          {listing && (
            <p className="history-policy">
              {translate(" Histórico da conta: ")}
              {(listing.usedBytes / 1_000_000).toFixed(2)}{" "}
              {translate(
                " / 50 MB. Excluir uma base também exclui suas versões. ",
              )}
            </p>
          )}
          {!listing && !error && (
            <p role="status">{translate("Carregando versões…")}</p>
          )}
          {listing?.versions.length === 0 && (
            <p>
              {translate(
                " Sem versões registradas. O histórico começa na próxima alteração dos dados; cargas antigas não podem ser reconstruídas. ",
              )}
            </p>
          )}
          {error && (
            <p className="model-error" role="alert">
              {translate(error)}
            </p>
          )}
          {listing?.versions.map((v, i) => (
            <article className="history-entry" key={v.id}>
              <strong>
                {v.metadata.reason.startsWith("restore:")
                  ? translate("Restauração")
                  : v.metadata.reason === "remote-sync"
                    ? translate("Atualização da conexão")
                    : v.metadata.reason === "baseline"
                      ? translate("Versão anterior preservada")
                      : translate("Publicação de dados")}
                {i === 0 ? translate(" · mais recente") : ""}
              </strong>
              <time dateTime={v.created_at}>
                {new Date(v.created_at).toLocaleString(locale())}
              </time>
              <p>
                {v.metadata.rows.toLocaleString(locale())}{" "}
                {translate(" registros ·")} {v.metadata.file || v.metadata.name}
              </p>
              <p>
                {v.metadata.changes.added} {translate(" linhas incluídas ·")}{" "}
                {v.metadata.changes.removed} {translate(" retiradas ·")}{" "}
                {v.metadata.changes.unchanged}{" "}
                {translate(
                  " iguais. Uma correção aparece como retirada + inclusão. ",
                )}
              </p>
              <div className="history-actions">
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => void exportVersion(v.id)}
                >
                  <Download size={15} /> {translate(" Exportar CSV ")}
                </button>
                {!source.recipe && (
                  <button
                    className="secondary-button"
                    disabled={busy}
                    onClick={() =>
                      setConfirm({ action: "restore", versionId: v.id })
                    }
                  >
                    <RotateCcw size={15} /> {translate(" Restaurar ")}
                  </button>
                )}
              </div>
            </article>
          ))}
          {Boolean(listing?.versions.length) && (
            <button
              className="text-button"
              disabled={busy}
              onClick={() => setConfirm({ action: "delete" })}
            >
              <Trash2 size={15} /> {translate(" Excluir histórico desta base ")}
            </button>
          )}
          {confirm && (
            <div className="history-entry" role="alert">
              <strong>
                {confirm.action === "delete"
                  ? translate("Excluir todas as versões desta base?")
                  : translate("Restaurar esta versão?")}
              </strong>
              <p>
                {confirm.action === "delete"
                  ? translate(
                      "Esta exclusão não pode ser desfeita. A base atual e seus dashboards continuam disponíveis. Futuras alterações criam novas versões.",
                    )
                  : translate(
                      "Os dashboards e combinações serão recalculados. A atualização automática desta origem será pausada, se houver. Você poderá retomá-la em Conexões.",
                    )}
              </p>
              <div className="history-actions">
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => setConfirm(null)}
                >
                  {translate(" Cancelar ")}
                </button>
                <button
                  className="primary-button"
                  disabled={busy}
                  onClick={() => void apply()}
                  autoFocus
                >
                  {busy ? translate("Aplicando…") : translate("Confirmar")}
                </button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
