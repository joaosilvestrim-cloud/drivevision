"use client";
import { t as translate, locale } from "@/lib/i18n";
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
import type { Source, Config } from "@/lib/analytics";
import { BusinessProfileFields, BusinessReview } from "./business-onboarding";
import { EMPTY_PROFILE, type BusinessContext } from "@/lib/business-onboarding";
import { planLoad, type LoadOptions } from "@/lib/source-lifecycle";

export function SmartImport({
  onClose,
  onImport,
  cloud = false,
  sources = [],
  previous,
}: {
  onClose: () => void;
  onImport: (source: Source, config?: Config) => Promise<boolean>;
  cloud?: boolean;
  sources?: Source[];
  previous?: BusinessContext;
}) {
  const [profile, setProfile] = useState(previous?.profile || EMPTY_PROFILE);
  const [preparedConfig, setPreparedConfig] = useState<Config | null>(null);
  const [createPanel, setCreatePanel] = useState(true);
  const [targetId, setTargetId] = useState("");
  const [stage, setStage] = useState<"structure" | "publish">("structure");
  const [loadOptions, setLoadOptions] = useState<LoadOptions>({
    mode: "append",
    keys: [],
  });
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);
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
  const publication = useMemo(() => {
    if (!preview.result) return { source: null, summary: null, error: "" };
    const target = sources.find((s) => s.id === targetId);
    try {
      if (target)
        return {
          ...planLoad(target, preview.result.source, loadOptions),
          error: "",
        };
      const incoming = preview.result.source;
      const duplicate = sources.find(
        (s) =>
          !s.recipe &&
          s.columns.length === incoming.columns.length &&
          s.columns.every((c) => incoming.columns.includes(c)) &&
          s.rows.length === incoming.rows.length &&
          JSON.stringify(
            s.rows.map((r) => s.columns.map((c) => r[c] ?? "")).sort(),
          ) ===
            JSON.stringify(
              incoming.rows.map((r) => s.columns.map((c) => r[c] ?? "")).sort(),
            ),
      );
      if (duplicate)
        throw new Error(
          `Este conteúdo já está na base “${duplicate.name}”. Selecione essa base como destino para revisar a carga sem duplicar.`,
        );
      return { source: incoming, summary: null, error: "" };
    } catch (e) {
      return {
        source: null,
        summary: null,
        error: e instanceof Error ? e.message : "Confira a carga.",
      };
    }
  }, [preview, sources, targetId, loadOptions]);
  function update(p: Partial<ImportPlan>) {
    setReplaceConfirmed(false);
    if (plan) setPlan({ ...plan, ...p });
  }
  function selectSheet(index: number, book = workbook) {
    setReplaceConfirmed(false);
    if (!book) return;
    const next = book.sheets[index];
    setSheetIndex(index);
    setPlan(planFor(next, detectTables(next)[0]));
    setName(`${book.name.replace(/\.[^.]+$/, "")} · ${next.name}`);
    setError("");
  }
  async function read(file?: File) {
    if (!file) return;
    if (!profile.segment) {
      setError(translate("Escolha seu segmento antes de enviar a planilha."));
      return;
    }
    setPreparedConfig(null);
    setStage("structure");
    setReplaceConfirmed(false);
    generation.current++;
    const token = generation.current;
    worker.current?.terminate();
    if (timer.current) clearTimeout(timer.current);
    setError("");
    setWorkbook(null);
    setPlan(null);
    if (!/\.(xlsx?|csv|tsv)$/i.test(file.name)) {
      setError(translate("Escolha um arquivo XLSX, XLS, CSV ou TSV."));
      setReading(false);
      return;
    }
    if (file.size > 10_000_000) {
      setError(translate("O limite desta versão é 10 MB por arquivo."));
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
            translate(
              "A leitura levou mais de 30 segundos. Reduza a área utilizada da planilha e tente novamente.",
            ),
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
          setError(
            translate("Não encontramos células preenchidas no arquivo."),
          );
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
            translate(
              "Não foi possível ler o arquivo. Confira se está íntegro e sem senha.",
            ),
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
    if (
      !publication.source ||
      !name.trim() ||
      saving ||
      (!targetId && createPanel && !preparedConfig) ||
      (targetId && loadOptions.mode === "replace-period" && !replaceConfirmed)
    )
      return;
    setSaving(true);
    setError("");
    try {
      if (
        await onImport(
          {
            ...publication.source,
            id: targetId || crypto.randomUUID(),
            name: targetId ? publication.source.name : name.trim(),
          },
          !targetId && createPanel ? preparedConfig || undefined : undefined,
        )
      )
        onClose();
      else
        setError(
          translate(
            "Não foi possível salvar a base. Confira o armazenamento do navegador.",
          ),
        );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Não foi possível importar. Sua prévia continua disponível.",
      );
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
          <DialogTitle>
            {stage === "structure"
              ? translate("Da sua planilha aos gráficos.")
              : translate("Revise antes de publicar.")}
          </DialogTitle>
          <DialogDescription>
            {stage === "structure"
              ? translate(
                  "1 de 2 · Confira a tabela e os campos encontrados no arquivo.",
                )
              : translate(
                  "2 de 2 · Escolha o destino e confira o impacto sobre seus dados.",
                )}
          </DialogDescription>
        </DialogHeader>
        <input
          ref={input}
          className="sr-only"
          type="file"
          tabIndex={-1}
          accept=".xlsx,.xls,.csv,.tsv"
          aria-label={translate("Selecionar planilha")}
          onChange={(e) => void read(e.target.files?.[0])}
        />
        {!workbook ? (
          <div className="import-welcome">
            <BusinessProfileFields
              value={profile}
              onChange={setProfile}
              templates
            />
            <button
              className="smart-drop"
              disabled={reading || !profile.segment}
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
                  ? translate("Lendo abas e procurando tabelas…")
                  : translate("Solte sua planilha aqui")}
              </strong>
              <span>
                {translate(
                  "ou clique para selecionar · Excel e CSV · até 10 MB",
                )}
              </span>
            </button>
            <div className="import-promises">
              <article>
                <strong>{translate("Encontra o início")}</strong>
                <p>
                  {translate(
                    "Procura cabeçalhos abaixo de títulos e espaços vazios.",
                  )}
                </p>
              </article>
              <article>
                <strong>{translate("Reorganiza")}</strong>
                <p>
                  {translate(
                    "Combina cabeçalhos, trata mesclagens e empilha meses.",
                  )}
                </p>
              </article>
              <article>
                <strong>{translate("Explica as escolhas")}</strong>
                <p>
                  {translate(
                    " Você confere o intervalo, os tipos e os dados resultantes. ",
                  )}
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
                  {translate(" Trocar arquivo ")}
                </button>
                <span className="local-reading">
                  <ShieldCheck size={14} />
                  {translate(" Processado no seu dispositivo ")}
                </span>
              </div>
              <div
                className="smart-import-body"
                style={stage === "publish" ? { display: "none" } : undefined}
              >
                <aside className="import-settings">
                  <Field
                    label={translate("Aba da planilha")}
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
                        ? translate("Possível tabela encontrada")
                        : translate("Estrutura ambígua: selecione o intervalo")}
                    </strong>
                    <p>
                      {candidates[0]?.reason ||
                        translate(
                          "Não há indício suficiente para escolher automaticamente. Ajuste as linhas e confira a prévia.",
                        )}
                    </p>
                  </div>
                  {candidates.length > 1 && (
                    <Field
                      label={translate("Blocos encontrados")}
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
                      label={translate("Linha do cabeçalho")}
                      type="number"
                      value={String(plan.header + 1)}
                      onChange={(v) => update({ header: Number(v) - 1 })}
                    />
                    <TextField
                      label={translate("Última linha")}
                      type="number"
                      value={String(plan.end + 1)}
                      onChange={(v) => update({ end: Number(v) - 1 })}
                    />
                  </div>
                  <Field
                    label={translate("Linhas de cabeçalho")}
                    value={String(plan.headerDepth)}
                    onChange={(v) => update({ headerDepth: Number(v) })}
                    options={[1, 2, 3].map((n) => ({
                      value: String(n),
                      label: `${n} ${n === 1 ? "linha" : "linhas combinadas"}`,
                    }))}
                  />
                  <div className="model-two">
                    <TextField
                      label={translate("Primeira coluna (nº)")}
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
                      label={translate("Última coluna (nº)")}
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
                    {translate(
                      " A = 1, B = 2, C = 3… Apenas o intervalo selecionado será importado. Ajuste o fim se houver espaços no meio da tabela. ",
                    )}
                  </p>
                  <label className="model-toggle">
                    <input
                      type="checkbox"
                      checked={plan.fillMerged}
                      onChange={(e) => update({ fillMerged: e.target.checked })}
                    />
                    {translate(" Repetir valores de células mescladas ")}
                  </label>
                  <label className="model-toggle">
                    <input
                      type="checkbox"
                      checked={plan.skipRepeated}
                      onChange={(e) =>
                        update({ skipRepeated: e.target.checked })
                      }
                    />
                    {translate(" Remover cabeçalhos repetidos ")}
                  </label>
                  <label className="model-toggle">
                    <input
                      type="checkbox"
                      checked={plan.skipTotals}
                      onChange={(e) => update({ skipTotals: e.target.checked })}
                    />
                    {translate(" Excluir linhas marcadas Total / Subtotal ")}
                  </label>
                  <details className="import-option">
                    <summary>
                      {translate("Preencher grupos para baixo")}
                    </summary>
                    <p className="model-note">
                      {translate(
                        " Use apenas em categorias cujo nome aparece na primeira linha de cada grupo. ",
                      )}
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
                      {translate(
                        " Meses ou categorias espalhados em colunas? ",
                      )}
                    </summary>
                    <p className="model-note">
                      {translate(
                        " Selecione as colunas a empilhar. Ex.: Janeiro e Fevereiro viram Período + Valor. Mantenha os campos que identificam cada registro. ",
                      )}
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
                          label={translate("Nome da coluna de categorias")}
                          value={plan.variableName}
                          onChange={(variableName) => update({ variableName })}
                        />
                        <TextField
                          label={translate("Nome da coluna de valores")}
                          value={plan.valueName}
                          onChange={(valueName) => update({ valueName })}
                        />
                      </>
                    )}
                  </details>
                  <TextField
                    label={translate("Nome da base")}
                    value={name}
                    onChange={setName}
                  />
                </aside>
                <div className="import-preview">
                  <div className="import-preview-label">
                    {translate(
                      " 01 / ARQUIVO ORIGINAL · PERTO DO CABEÇALHO ESCOLHIDO ",
                    )}
                  </div>
                  <div className="import-grid-scroll original-grid">
                    <table className="result-table">
                      <thead>
                        <tr>
                          <th>{translate("Linha")}</th>
                          {Array.from(
                            {
                              length: Math.min(
                                Math.max(0, plan.right - plan.left + 1),
                                60,
                              ),
                            },
                            (_, i) => (
                              <th key={i}>
                                {translate("Coluna ")}
                                {plan.left + i + 1}
                              </th>
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
                    {translate(" 02 / O QUE O SISTEMA ENTENDEU ")}
                  </div>
                  {preview.error ? (
                    <p className="model-error" role="alert">
                      {translate(preview.error)}
                    </p>
                  ) : (
                    preview.result && (
                      <>
                        <div className="import-result-stats">
                          <strong>
                            {preview.result.source.rows.length}{" "}
                            {translate(" registros ")}
                          </strong>
                          <span>
                            {preview.result.source.columns.length}{" "}
                            {translate(" colunas ")}
                          </span>
                          <span>
                            {preview.result.source.numeric.length}{" "}
                            {translate(" numéricas ")}
                          </span>
                          <span>
                            {preview.result.source.dates.length}{" "}
                            {translate(" datas ")}
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
                                          ? translate("DATA")
                                          : translate("ABC")}
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
                            {preview.result.empty}{" "}
                            {translate(" linhas vazias e")}{" "}
                            {preview.result.removedColumns}{" "}
                            {translate(" colunas vazias removidas. ")}
                          </p>
                          <p>
                            <Check size={14} />
                            {preview.result.repeated}{" "}
                            {translate(" cabeçalhos repetidos removidos; ")}
                            {preview.result.filled}{" "}
                            {translate(" células preenchidas. ")}
                          </p>
                          {preview.result.totals > 0 && (
                            <p className="import-warning">
                              {preview.result.totals}{" "}
                              {translate(" possíveis totais/subtotais")}{" "}
                              {plan.skipTotals
                                ? translate("excluídos")
                                : translate("mantidos")}
                              {translate(
                                ". Confira se eles duplicam os valores detalhados. ",
                              )}
                            </p>
                          )}
                          {preview.result.mixed.length > 0 && (
                            <p className="import-warning">
                              {translate(" Tipos misturados em")}{" "}
                              {preview.result.mixed.join(", ")}
                              {translate(
                                ". Valores preservados como texto; trate-os em Preparar dados. ",
                              )}
                            </p>
                          )}
                          {sheet.formulas > 0 && (
                            <p className="import-warning">
                              {sheet.formulas}{" "}
                              {translate(
                                " fórmulas na aba: usamos apenas o resultado salvo pelo Excel. ",
                              )}
                              {sheet.uncached}{" "}
                              {translate(
                                " sem resultado salvo. Fórmulas não são recalculadas; abra e salve no Excel se necessário. ",
                              )}
                            </p>
                          )}
                          <p className="model-note">
                            {translate(
                              " Sugestões estruturais por regras locais, sem IA generativa. Não interpretamos imagens, macros ou o significado de regras de negócio. O arquivo original não é alterado. ",
                            )}
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
        {preview.result && stage === "publish" && (
          <section
            className="load-review"
            aria-label={translate("Revisão da publicação")}
          >
            <h3>{translate("Como estes dados entram na sua base?")}</h3>
            <Field
              label={translate("Destino da carga")}
              value={targetId}
              onChange={(id) => {
                setTargetId(id);
                setReplaceConfirmed(false);
                setLoadOptions({
                  mode: "append",
                  keys: sources.find((s) => s.id === id)?.lastLoad?.keys || [],
                });
              }}
              options={[
                { value: "", label: "Criar uma nova base" },
                ...sources
                  .filter((s) => !s.recipe)
                  .map((s) => ({ value: s.id, label: s.name })),
              ]}
            />
            {targetId && (
              <>
                <Field
                  label={translate("Modo de atualização")}
                  value={loadOptions.mode}
                  onChange={(mode) => {
                    setLoadOptions({
                      ...loadOptions,
                      mode: mode as LoadOptions["mode"],
                    });
                    setReplaceConfirmed(false);
                  }}
                  options={[
                    {
                      value: "append",
                      label: "Acrescentar apenas operações novas",
                    },
                    { value: "upsert", label: "Atualizar por identificador" },
                    { value: "replace-period", label: "Substituir um período" },
                  ]}
                />
                <fieldset>
                  <legend>
                    {translate("Colunas que identificam uma operação")}
                  </legend>
                  <p>
                    {translate(
                      " Exemplo: ID da venda + ID do item. Valores são comparados exatamente; não usamos valor ou data para adivinhar duplicidades. ",
                    )}
                  </p>
                  <div className="load-keys">
                    {preview.result.source.columns.map((c) => (
                      <label key={c}>
                        <input
                          type="checkbox"
                          checked={loadOptions.keys.includes(c)}
                          onChange={(e) => {
                            setReplaceConfirmed(false);
                            setLoadOptions({
                              ...loadOptions,
                              keys: e.target.checked
                                ? [...loadOptions.keys, c]
                                : loadOptions.keys.filter((k) => k !== c),
                            });
                          }}
                        />
                        {c}
                      </label>
                    ))}
                  </div>
                </fieldset>
                {loadOptions.mode === "replace-period" && (
                  <>
                    <Field
                      label={translate("Data da operação")}
                      value={loadOptions.dateField || ""}
                      onChange={(dateField) => {
                        setReplaceConfirmed(false);
                        setLoadOptions({ ...loadOptions, dateField });
                      }}
                      options={[
                        { value: "", label: "Selecione a data" },
                        ...preview.result.source.dates.map((c) => ({
                          raw: true,
                          value: c,
                          label: c,
                        })),
                      ]}
                    />
                    <div className="model-two">
                      <label>
                        {translate(" Início ")}
                        <input
                          type="date"
                          value={loadOptions.start || ""}
                          onChange={(e) => {
                            setReplaceConfirmed(false);
                            setLoadOptions({
                              ...loadOptions,
                              start: e.target.value,
                            });
                          }}
                        />
                      </label>
                      <label>
                        {translate(" Fim ")}
                        <input
                          type="date"
                          value={loadOptions.end || ""}
                          onChange={(e) => {
                            setReplaceConfirmed(false);
                            setLoadOptions({
                              ...loadOptions,
                              end: e.target.value,
                            });
                          }}
                        />
                      </label>
                    </div>
                    <label className="load-confirm">
                      <input
                        type="checkbox"
                        checked={replaceConfirmed}
                        onChange={(e) => setReplaceConfirmed(e.target.checked)}
                      />
                      {translate(
                        " Confirmo a substituição deste período, incluindo a remoção das operações que não estão no novo arquivo. ",
                      )}
                    </label>
                  </>
                )}
              </>
            )}
            {publication.error && (
              <p className="model-error" role="alert">
                {translate(publication.error)}
              </p>
            )}
            {publication.summary && (
              <div className="load-impact" aria-live="polite">
                {Object.entries({
                  Novos: publication.summary.added,
                  Alterados: publication.summary.updated,
                  "Já existentes": publication.summary.unchanged,
                  Removidos: publication.summary.removed,
                  "Repetidos no arquivo": publication.summary.duplicates,
                }).map(([label, count]) => (
                  <div key={label}>
                    <strong>{count}</strong>
                    <span>{translate(label)}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="model-note">
              {targetId
                ? translate(
                    "Os dashboards mantêm o vínculo. As combinações dependentes serão recalculadas antes de salvar.",
                  )
                : translate(
                    "Para enviar novos meses da mesma operação, selecione uma base existente nas próximas cargas.",
                  )}
            </p>
            {!targetId && (
              <>
                <label className="business-confirm">
                  <input
                    type="checkbox"
                    checked={createPanel}
                    onChange={(e) => setCreatePanel(e.target.checked)}
                  />
                  <span>
                    {translate(
                      "Criar e salvar um painel pronto com esta fonte",
                    )}
                  </span>
                </label>
                {createPanel && publication.source && (
                  <BusinessReview
                    key={`${sheetIndex}:${publication.source.columns.join("|")}`}
                    source={publication.source}
                    profile={profile}
                    onProfile={setProfile}
                    previous={previous}
                    onReady={setPreparedConfig}
                  />
                )}
              </>
            )}
          </section>
        )}
        {error && (
          <p className="model-error import-error" role="alert">
            {translate(error)}
          </p>
        )}
        <footer className="model-footer">
          <span>
            {workbook
              ? stage === "structure"
                ? translate(
                    "Confira a prévia. Uma aba/tabela será importada por vez.",
                  )
                : translate("A publicação só acontece após sua confirmação.")
              : cloud
                ? translate(
                    "A interpretação é local. Ao confirmar, os dados organizados serão salvos na sua conta.",
                  )
                : translate("O arquivo permanece neste dispositivo.")}
          </span>
          <button
            className="secondary-button"
            disabled={saving}
            onClick={onClose}
          >
            {translate(" Cancelar ")}
          </button>
          {stage === "publish" && (
            <button
              className="secondary-button"
              disabled={saving}
              onClick={() => setStage("structure")}
            >
              {translate(" Voltar à estrutura ")}
            </button>
          )}
          {workbook && (
            <button
              className="primary-button"
              disabled={
                saving ||
                (stage === "publish" ? !publication.source : !preview.result) ||
                !name.trim() ||
                (stage === "publish" &&
                  !targetId &&
                  createPanel &&
                  !preparedConfig) ||
                Boolean(
                  stage === "publish" &&
                  targetId &&
                  loadOptions.mode === "replace-period" &&
                  !replaceConfirmed,
                )
              }
              onClick={() =>
                stage === "structure" ? setStage("publish") : void accept()
              }
            >
              {saving ? (
                <Loader2 size={16} className="spin" />
              ) : (
                <ArrowRight size={16} />
              )}
              {stage === "structure"
                ? translate("Revisar publicação")
                : targetId
                  ? translate("Publicar atualização")
                  : createPanel
                    ? translate("Salvar e abrir meu painel")
                    : translate("Salvar somente a base")}
            </button>
          )}
        </footer>
      </DialogContent>
    </Dialog>
  );
}
