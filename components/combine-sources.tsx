"use client";
import { useMemo, useState } from "react";
import { GitMerge } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { Field, TextField } from "./model-controls";
import { combineSources, type CombineOptions } from "@/lib/exploration";
import type { Source } from "@/lib/analytics";
export function CombineSources({
  sources,
  onClose,
  onSave,
}: {
  sources: Source[];
  onClose: () => void;
  onSave: (source: Source) => Promise<boolean>;
}) {
  const [leftId, setLeftId] = useState(sources[0]?.id),
    [rightId, setRightId] = useState(sources[1]?.id || sources[0]?.id),
    [name, setName] = useState("Base combinada"),
    [busy, setBusy] = useState(false),
    [saveError, setSaveError] = useState("");
  const left = sources.find((s) => s.id === leftId)!,
    right = sources.find((s) => s.id === rightId)!;
  const [options, setOptions] = useState<CombineOptions>({
    mode: "left",
    leftKey: left?.columns[0] || "",
    rightKey: right?.columns[0] || "",
    trim: true,
  });
  const preview = useMemo(() => {
    try {
      return { result: combineSources(left, right, options), error: "" };
    } catch (e) {
      return {
        result: null,
        error: e instanceof Error ? e.message : "Não foi possível combinar.",
      };
    }
  }, [left, right, options]);
  const sourceOptions = sources.map((s) => ({
    value: s.id,
    label: `${s.name} (${s.rows.length} linhas)`,
  }));
  async function save() {
    if (!preview.result || !name.trim() || busy) return;
    setBusy(true);
    setSaveError("");
    try {
      if (
        await onSave({
          ...preview.result.source,
          id: crypto.randomUUID(),
          name: name.trim(),
          recipe: {
            leftId: left.id,
            rightId: right.id,
            rightName: right.name,
            options,
          },
        })
      )
        onClose();
      else
        setSaveError("Não foi possível salvar a nova base. Tente novamente.");
    } catch {
      setSaveError("Falha ao salvar. As bases originais estão preservadas.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent
        className="model-dialog combine-dialog"
        onEscapeKeyDown={(e) => busy && e.preventDefault()}
        onPointerDownOutside={(e) => busy && e.preventDefault()}
      >
        <DialogHeader className="model-header">
          <div className="model-eyebrow">
            <GitMerge size={16} /> COMBINAR FONTES
          </div>
          <DialogTitle>Conecte as peças.</DialogTitle>
          <DialogDescription>
            Junte vendas ao cadastro de clientes ou acrescente novos meses. Uma
            nova base será criada e acompanhará as atualizações das origens. As
            originais ficam preservadas.
          </DialogDescription>
        </DialogHeader>
        <div className="hub-content">
          <div className="model-two">
            <Field
              label="Primeira base"
              value={leftId}
              onChange={(id) => {
                setLeftId(id);
                setOptions({
                  ...options,
                  leftKey: sources.find((s) => s.id === id)!.columns[0],
                });
              }}
              options={sourceOptions}
            />
            <Field
              label="Segunda base"
              value={rightId}
              onChange={(id) => {
                setRightId(id);
                setOptions({
                  ...options,
                  rightKey: sources.find((s) => s.id === id)!.columns[0],
                });
              }}
              options={sourceOptions}
            />
          </div>
          <Field
            label="Como combinar"
            value={options.mode}
            onChange={(mode) =>
              setOptions({ ...options, mode: mode as CombineOptions["mode"] })
            }
            options={[
              {
                value: "left",
                label: "Relacionar · manter todas as linhas da primeira base",
              },
              {
                value: "inner",
                label: "Relacionar · apenas registros com correspondência",
              },
              {
                value: "append",
                label: "Acrescentar linhas · empilhar as duas bases",
              },
            ]}
          />
          {options.mode !== "append" && (
            <>
              <div className="model-two">
                <Field
                  label="Chave da primeira base"
                  value={options.leftKey}
                  onChange={(leftKey) => setOptions({ ...options, leftKey })}
                  options={left.columns.map((c) => ({ value: c, label: c }))}
                />
                <Field
                  label="Chave da segunda base"
                  value={options.rightKey}
                  onChange={(rightKey) => setOptions({ ...options, rightKey })}
                  options={right.columns.map((c) => ({ value: c, label: c }))}
                />
              </div>
              <label className="model-toggle">
                <input
                  type="checkbox"
                  checked={options.trim}
                  onChange={(e) =>
                    setOptions({ ...options, trim: e.target.checked })
                  }
                />
                Ignorar espaços no início e no fim das chaves
              </label>
            </>
          )}
          <TextField
            label="Nome da nova base"
            value={name}
            onChange={setName}
          />
          {preview.error ? (
            <p className="model-error" role="alert">
              {preview.error}
            </p>
          ) : (
            preview.result && (
              <>
                <div className="analysis-stats">
                  <article>
                    <span>Resultado</span>
                    <strong>{preview.result.source.rows.length}</strong>
                    <small>
                      {preview.result.source.columns.length} colunas
                    </small>
                  </article>
                  {options.mode !== "append" && (
                    <>
                      <article>
                        <span>Linhas com correspondência</span>
                        <strong>{preview.result.matched}</strong>
                        <small>Da primeira base</small>
                      </article>
                      <article>
                        <span>Sem correspondência</span>
                        <strong>{preview.result.unmatched}</strong>
                        <small>
                          {options.mode === "left"
                            ? "Mantidas com campos vazios"
                            : "Excluídas do resultado"}
                        </small>
                      </article>
                    </>
                  )}
                </div>
                <p className="model-note">
                  {preview.result.note} Este resultado é uma cópia; não
                  sincroniza futuras alterações nas fontes.
                </p>
                <div className="pivot-scroll">
                  <table className="result-table">
                    <caption>Prévia das primeiras 8 linhas</caption>
                    <thead>
                      <tr>
                        {preview.result.source.columns.map((c) => (
                          <th key={c}>{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.result.source.rows.slice(0, 8).map((r, i) => (
                        <tr key={i}>
                          {preview.result!.source.columns.map((c) => (
                            <td key={c}>{r[c] || "—"}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )
          )}
          {saveError && (
            <p className="model-error" role="alert">
              {saveError}
            </p>
          )}
        </div>
        <footer className="model-footer">
          <span>Até 20 mil linhas e 60 colunas no resultado.</span>
          <button
            className="secondary-button"
            onClick={onClose}
            disabled={busy}
          >
            Cancelar
          </button>
          <button
            className="primary-button"
            disabled={busy || !preview.result || !name.trim()}
            onClick={save}
          >
            {busy ? "Salvando…" : "Criar nova base"}
          </button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
