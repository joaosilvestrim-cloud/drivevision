"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Upload,
  FileSpreadsheet,
  ShieldCheck,
  Loader2,
  ArrowRight,
  Check,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { Field, TextField } from "./model-controls";
import {
  detectTables,
  planFor,
  normalizeSheet,
  headerNames,
  type WorkbookData,
  type ImportPlan,
} from "@/lib/smart-import";
import type { Source } from "@/lib/analytics";

export function SmartImport({
  onClose,
  onImport,
  cloud = false,
}: {
  onClose: () => void;
  onImport: (source: Source) => Promise<boolean>;
  cloud?: boolean;
}) {
  const [workbook, setWorkbook] = useState<WorkbookData | null>(null),
    [sheetIndex, setSheetIndex] = useState(0),
    [plan, setPlan] = useState<ImportPlan | null>(null),
    [reading, setReading] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [name, setName] = useState("");
  const worker = useRef<Worker | null>(null),
    generation = useRef(0),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    input = useRef<HTMLInputElement>(null);
  useEffect(
    () => () => {
      generation.current++;
      worker.current?.terminate();
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const sheet = workbook?.sheets[sheetIndex];
  const candidates = useMemo(() => (sheet ? detectTables(sheet) : []), [sheet]);
  const preview = useMemo(() => {
    if (!sheet || !plan || !workbook) return { result: null, error: "" };
    try {
      return { result: normalizeSheet(sheet, plan, workbook.name), error: "" };
    } catch (e) {
      return {
        result: null,
        error: e instanceof Error ? e.message : "Confira o intervalo.",
      };
    }
  }, [sheet, plan, workbook]);
  const columns = sheet && plan ? headerNames(sheet, plan) : [];
  function update(p: Partial<ImportPlan>) {
    if (plan) setPlan({ ...plan, ...p });
  }
  function selectSheet(index: number, book = workbook) {
    if (!book) return;
    const next = book.sheets[index];
    setSheetIndex(index);
    setPlan(planFor(next, detectTables(next)[0]));
    setName(`${book.name.replace(/\.[^.]+$/, "")} · ${next.name}`);
    setError("");
  }
  async function read(file?: File) {
    if (!file) return;
    generation.current++;
    const token = generation.current;
    worker.current?.terminate();
    if (timer.current) clearTimeout(timer.current);
    setError("");
    setWorkbook(null);
    setPlan(null);
    if (!/\.(xlsx?|csv|tsv)$/i.test(file.name)) {
      setError("Escolha um arquivo XLSX, XLS, CSV ou TSV.");
      setReading(false);
      return;
    }
    if (file.size > 10_000_000) {
      setError("O limite desta versão é 10 MB por arquivo.");
      setReading(false);
      return;
    }
    setReading(true);
    try {
      const data = await file.arrayBuffer();
      if (token !== generation.current) return;
      const current = new Worker(
        new URL("../lib/spreadsheet.worker.ts", import.meta.url),
        { type: "module" },
      );
      worker.current = current;
      const finish = () => {
        current.terminate();
        if (timer.current) clearTimeout(timer.current);
        setReading(false);
      };
      timer.current = setTimeout(() => {
        if (token === generation.current) {
          finish();
          setError(
            "A leitura levou mais de 30 segundos. Reduza a área utilizada da planilha e tente novamente.",
          );
        }
      }, 30000);
      current.onmessage = (
        event: MessageEvent<{ result?: WorkbookData; error?: string }>,
      ) => {
        if (token !== generation.current) return;
        finish();
        if (event.data.error) {
          setError(event.data.error);
          return;
        }
        const book = event.data.result!;
        if (!book.sheets.length) {
          setError("Não encontramos células preenchidas no arquivo.");
          return;
        }
        setWorkbook(book);
        const best = book.sheets
          .map((s, i) => ({ i, score: detectTables(s)[0]?.score ?? 0 }))
          .sort((a, b) => b.score - a.score)[0].i;
        selectSheet(best, book);
      };
      current.onerror = () => {
        if (token === generation.current) {
          finish();
          setError(
            "Não foi possível ler o arquivo. Confira se está íntegro e sem senha.",
          );
        }
      };
      current.postMessage({ data, name: file.name }, [data]);
    } catch (e) {
      if (token === generation.current) {
        setReading(false);
        setError(e instanceof Error ? e.message : "Falha na leitura.");
      }
    } finally {
      if (input.current) input.current.value = "";
    }
  }
  async function accept() {
    if (!preview.result || !name.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      if (
        await onImport({
          ...preview.result.source,
          id: crypto.randomUUID(),
          name: name.trim(),
        })
      )
        onClose();
      else
        setError(
          "Não foi possível salvar a base. Confira o armazenamento do navegador.",
        );
    } catch {
      setError("Não foi possível importar. Sua prévia continua disponível.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent
        className="model-dialog smart-import"
        onEscapeKeyDown={(e) => saving && e.preventDefault()}
        onPointerDownOutside={(e) => saving && e.preventDefault()}
      >
        <DialogHeader className="model-header">
          <div className="model-eyebrow">
            <ShieldCheck size={16} /> LEITURA LOCAL · SEM API EXTERNA
          </div>
          <DialogTitle>Da sua planilha aos gráficos.</DialogTitle>
          <DialogDescription>
            Encontramos possíveis tabelas e sugerimos uma estrutura. Confira o
            que foi entendido antes de importar.
          </DialogDescription>
        </DialogHeader>
        <input
          ref={input}
          className="sr-only"
          type="file"
          tabIndex={-1}
          accept=".xlsx,.xls,.csv,.tsv"
          aria-label="Selecionar planilha"
          onChange={(e) => void read(e.target.files?.[0])}
        />
        {!workbook ? (
          <div className="import-welcome">
            <button
              className="smart-drop"
              disabled={reading}
              onClick={() => input.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (!reading) void read(e.dataTransfer.files[0]);
              }}
            >
              {reading ? (
                <Loader2 size={40} className="spin" />
              ) : (
                <FileSpreadsheet size={40} />
              )}
              <strong>
                {reading
                  ? "Lendo abas e procurando tabelas…"
                  : "Solte sua planilha aqui"}
              </strong>
              <span>ou clique para selecionar · Excel e CSV · até 10 MB</span>
            </button>
            <div className="import-promises">
              <article>
                <strong>Encontra o início</strong>
                <p>Procura cabeçalhos abaixo de títulos e espaços vazios.</p>
              </article>
              <article>
                <strong>Reorganiza</strong>
                <p>Combina cabeçalhos, trata mesclagens e empilha meses.</p>
              </article>
              <article>
                <strong>Explica as escolhas</strong>
                <p>
                  Você confere o intervalo, os tipos e os dados resultantes.
                </p>
              </article>
            </div>
          </div>
        ) : (
          sheet &&
          plan && (
            <>
              <div className="data-toolbar">
                <span>
                  <FileSpreadsheet size={16} />
                  {workbook.name}
                </span>
                <button
                  className="secondary-button"
                  disabled={saving}
                  onClick={() => input.current?.click()}
                >
                  <Upload size={14} />
                  Trocar arquivo
                </button>
                <span className="local-reading">
                  <ShieldCheck size={14} />
                  Processado no seu dispositivo
                </span>
              </div>
              <div className="smart-import-body">
                <aside className="import-settings">
                  <Field
                    label="Aba da planilha"
                    value={String(sheetIndex)}
                    onChange={(v) => selectSheet(Number(v))}
                    options={workbook.sheets.map((s, i) => ({
                      value: String(i),
                      label: `${s.name} · ${s.rows.length} linhas`,
                    }))}
                  />
                  <div className="detection-note">
                    <strong>
                      {candidates.length
                        ? "Possível tabela encontrada"
                        : "Estrutura ambígua: selecione o intervalo"}
                    </strong>
                    <p>
                      {candidates[0]?.reason ||
                        "Não há indício suficiente para escolher automaticamente. Ajuste as linhas e confira a prévia."}
                    </p>
                  </div>
                  {candidates.length > 1 && (
                    <Field
                      label="Blocos encontrados"
                      value={String(
                        candidates.findIndex((c) => c.header === plan.header),
                      )}
                      onChange={(v) =>
                        setPlan(planFor(sheet, candidates[Number(v)]))
                      }
                      options={[
                        { value: "-1", label: "Intervalo personalizado" },
                        ...candidates.map((c, i) => ({
                          value: String(i),
                          label: `Cabeçalho na linha ${c.header + 1} · até ${c.end + 1}`,
                        })),
                      ]}
                    />
                  )}
                  <div className="model-two">
                    <TextField
                      label="Linha do cabeçalho"
                      type="number"
                      value={String(plan.header + 1)}
                      onChange={(v) => update({ header: Number(v) - 1 })}
                    />
                    <TextField
                      label="Última linha"
                      type="number"
                      value={String(plan.end + 1)}
                      onChange={(v) => update({ end: Number(v) - 1 })}
                    />
                  </div>
                  <Field
                    label="Linhas de cabeçalho"
                    value={String(plan.headerDepth)}
                    onChange={(v) => update({ headerDepth: Number(v) })}
                    options={[1, 2, 3].map((n) => ({
                      value: String(n),
                      label: `${n} ${n === 1 ? "linha" : "linhas combinadas"}`,
                    }))}
                  />
                  <div className="model-two">
                    <TextField
                      label="Primeira coluna (nº)"
                      type="number"
                      value={String(plan.left + 1)}
                      onChange={(v) =>
                        update({
                          left: Number(v) - 1,
                          fillDown: [],
                          unpivot: [],
                        })
                      }
                    />
                    <TextField
                      label="Última coluna (nº)"
                      type="number"
                      value={String(plan.right + 1)}
                      onChange={(v) =>
                        update({
                          right: Number(v) - 1,
                          fillDown: [],
                          unpivot: [],
                        })
                      }
                    />
                  </div>
                  <p className="model-note">
                    A = 1, B = 2, C = 3… Apenas o intervalo selecionado será
                    importado. Ajuste o fim se houver espaços no meio da tabela.
                  </p>
                  <label className="model-toggle">
                    <input
                      type="checkbox"
                      checked={plan.fillMerged}
                      onChange={(e) => update({ fillMerged: e.target.checked })}
                    />
                    Repetir valores de células mescladas
                  </label>
                  <label className="model-toggle">
                    <input
                      type="checkbox"
                      checked={plan.skipRepeated}
                      onChange={(e) =>
                        update({ skipRepeated: e.target.checked })
                      }
                    />
                    Remover cabeçalhos repetidos
                  </label>
                  <label className="model-toggle">
                    <input
                      type="checkbox"
                      checked={plan.skipTotals}
                      onChange={(e) => update({ skipTotals: e.target.checked })}
                    />
                    Excluir linhas marcadas Total / Subtotal
                  </label>
                  <details className="import-option">
                    <summary>Preencher grupos para baixo</summary>
                    <p className="model-note">
                      Use apenas em categorias cujo nome aparece na primeira
                      linha de cada grupo.
                    </p>
                    <div className="column-checklist">
                      {columns.map((c, i) => (
                        <label key={i}>
                          <input
                            type="checkbox"
                            checked={plan.fillDown.includes(i + plan.left)}
                            onChange={(e) =>
                              update({
                                fillDown: e.target.checked
                                  ? [...plan.fillDown, i + plan.left]
                                  : plan.fillDown.filter(
                                      (k) => k !== i + plan.left,
                                    ),
                              })
                            }
                          />
                          {c}
                        </label>
                      ))}
                    </div>
                  </details>
                  <details className="import-option">
                    <summary>
                      Meses ou categorias espalhados em colunas?
                    </summary>
                    <p className="model-note">
                      Selecione as colunas a empilhar. Ex.: Janeiro e Fevereiro
                      viram Período + Valor. Mantenha os campos que identificam
                      cada registro.
                    </p>
                    <div className="column-checklist">
                      {columns.map((c, i) => (
                        <label key={i}>
                          <input
                            type="checkbox"
                            checked={plan.unpivot.includes(i + plan.left)}
                            onChange={(e) =>
                              update({
                                unpivot: e.target.checked
                                  ? [...plan.unpivot, i + plan.left]
                                  : plan.unpivot.filter(
                                      (k) => k !== i + plan.left,
                                    ),
                              })
                            }
                          />
                          {c}
                        </label>
                      ))}
                    </div>
                    {plan.unpivot.length > 0 && (
                      <>
                        <TextField
                          label="Nome da coluna de categorias"
                          value={plan.variableName}
                          onChange={(variableName) => update({ variableName })}
                        />
                        <TextField
                          label="Nome da coluna de valores"
                          value={plan.valueName}
                          onChange={(valueName) => update({ valueName })}
                        />
                      </>
                    )}
                  </details>
                  <TextField
                    label="Nome da base"
                    value={name}
                    onChange={setName}
                  />
                </aside>
                <div className="import-preview">
                  <div className="import-preview-label">
                    01 / ARQUIVO ORIGINAL · PERTO DO CABEÇALHO ESCOLHIDO
                  </div>
                  <div className="import-grid-scroll original-grid">
                    <table className="result-table">
                      <thead>
                        <tr>
                          <th>Linha</th>
                          {Array.from(
                            {
                              length: Math.min(
                                Math.max(0, plan.right - plan.left + 1),
                                60,
                              ),
                            },
                            (_, i) => (
                              <th key={i}>Coluna {plan.left + i + 1}</th>
                            ),
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {sheet.rows
                          .slice(
                            Math.max(0, plan.header - 2),
                            Math.max(0, plan.header - 2) + 8,
                          )
                          .map((r, i) => (
                            <tr
                              key={i}
                              className={
                                i + Math.max(0, plan.header - 2) >=
                                  plan.header &&
                                i + Math.max(0, plan.header - 2) <
                                  plan.header + plan.headerDepth
                                  ? "detected-header"
                                  : ""
                              }
                            >
                              <th>{Math.max(0, plan.header - 2) + i + 1}</th>
                              {r
                                .slice(
                                  Math.max(0, plan.left),
                                  Math.min(plan.right + 1, plan.left + 60),
                                )
                                .map((v, j) => (
                                  <td key={j}>{v || "—"}</td>
                                ))}
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="import-preview-label">
                    02 / O QUE O SISTEMA ENTENDEU
                  </div>
                  {preview.error ? (
                    <p className="model-error" role="alert">
                      {preview.error}
                    </p>
                  ) : (
                    preview.result && (
                      <>
                        <div className="import-result-stats">
                          <strong>
                            {preview.result.source.rows.length} registros
                          </strong>
                          <span>
                            {preview.result.source.columns.length} colunas
                          </span>
                          <span>
                            {preview.result.source.numeric.length} numéricas
                          </span>
                          <span>
                            {preview.result.source.dates.length} datas
                          </span>
                        </div>
                        <div className="import-grid-scroll">
                          <table className="result-table">
                            <thead>
                              <tr>
                                {preview.result.source.columns.map((c) => (
                                  <th key={c}>
                                    <span className="column-type">
                                      {preview.result!.source.numeric.includes(
                                        c,
                                      )
                                        ? "#"
                                        : preview.result!.source.dates.includes(
                                              c,
                                            )
                                          ? "DATA"
                                          : "ABC"}
                                    </span>{" "}
                                    {c}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {preview.result.source.rows
                                .slice(0, 12)
                                .map((r, i) => (
                                  <tr key={i}>
                                    {preview.result!.source.columns.map((c) => (
                                      <td key={c}>{r[c] || "—"}</td>
                                    ))}
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="interpretation-report">
                          <p>
                            <Check size={14} />
                            {preview.result.empty} linhas vazias e{" "}
                            {preview.result.removedColumns} colunas vazias
                            removidas.
                          </p>
                          <p>
                            <Check size={14} />
                            {preview.result.repeated} cabeçalhos repetidos
                            removidos; {preview.result.filled} células
                            preenchidas.
                          </p>
                          {preview.result.totals > 0 && (
                            <p className="import-warning">
                              {preview.result.totals} possíveis totais/subtotais{" "}
                              {plan.skipTotals ? "excluídos" : "mantidos"}.
                              Confira se eles duplicam os valores detalhados.
                            </p>
                          )}
                          {preview.result.mixed.length > 0 && (
                            <p className="import-warning">
                              Tipos misturados em{" "}
                              {preview.result.mixed.join(", ")}. Valores
                              preservados como texto; trate-os em Preparar
                              dados.
                            </p>
                          )}
                          {sheet.formulas > 0 && (
                            <p className="import-warning">
                              {sheet.formulas} fórmulas na aba: usamos apenas o
                              resultado salvo pelo Excel. {sheet.uncached} sem
                              resultado salvo. Fórmulas não são recalculadas;
                              abra e salve no Excel se necessário.
                            </p>
                          )}
                          <p className="model-note">
                            Sugestões estruturais por regras locais, sem IA
                            generativa. Não interpretamos imagens, macros ou o
                            significado de regras de negócio. O arquivo original
                            não é alterado.
                          </p>
                        </div>
                      </>
                    )
                  )}
                </div>
              </div>
            </>
          )
        )}
        {error && (
          <p className="model-error import-error" role="alert">
            {error}
          </p>
        )}
        <footer className="model-footer">
          <span>
            {workbook
              ? "Confira a prévia. Uma aba/tabela será importada por vez."
              : cloud
                ? "A interpretação é local. Ao confirmar, os dados organizados serão salvos na sua conta."
                : "O arquivo permanece neste dispositivo."}
          </span>
          <button
            className="secondary-button"
            disabled={saving}
            onClick={onClose}
          >
            Cancelar
          </button>
          {workbook && (
            <button
              className="primary-button"
              disabled={saving || !preview.result || !name.trim()}
              onClick={accept}
            >
              {saving ? (
                <Loader2 size={16} className="spin" />
              ) : (
                <ArrowRight size={16} />
              )}
              Confirmar estrutura e gerar painel
            </button>
          )}
        </footer>
      </DialogContent>
    </Dialog>
  );
}
