"use client";
import { t as translate, locale } from "@/lib/i18n";
import { useMemo, useState } from "react";
import {
  Plus,
  Trash2,
  Check,
  SlidersHorizontal,
  ChartNoAxesCombined,
  Filter,
  Palette,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Field, TextField, FilterBuilder } from "./model-controls";
import { VisualChart } from "./chart-renderer";
import {
  AGGREGATIONS,
  SERIES_COLORS,
  measuresFor,
  chartData,
  formatChartNumber,
  type Measure,
  type NumberStyle,
} from "@/lib/chart-model";
import { validateFilters } from "@/lib/data-model";
import { VISUAL_TYPES, type Visual } from "@/lib/visual-builder";
import type { Source, DataRow } from "@/lib/analytics";

export function ChartStudio({
  visual,
  source,
  rows,
  color,
  onApply,
  onClose,
}: {
  visual: Visual;
  source: Source;
  rows: DataRow[];
  color: string;
  onApply: (v: Visual) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Visual>({
      ...visual,
      pivotColumn: visual.pivotColumn || source.columns[1] || source.columns[0],
      measures: measuresFor(visual, color),
    }),
    [tab, setTab] = useState("data"),
    [error, setError] = useState("");
  const measures = draft.measures!,
    format = draft.numberStyle ?? {
      kind: "auto",
      decimals: 2,
      compact: true,
      prefix: "",
      suffix: "",
    };
  const calculated = useMemo(
    () => chartData(rows, source, draft, color),
    [rows, source, draft, color],
  );
  const cartesian = ["line", "area", "bar", "horizontal", "combo"].includes(
    draft.type,
  );
  const hasLegend = cartesian || ["donut", "radar"].includes(draft.type);
  const isSingle = [
      "kpi",
      "donut",
      "pivot",
      "treemap",
      "funnel",
      "gauge",
    ].includes(draft.type),
    isText = draft.type === "text";
  function patch(patch: Partial<Visual>) {
    setDraft((v) => ({ ...v, ...patch }));
    setError("");
  }
  function updateMeasure(id: string, change: Partial<Measure>) {
    patch({
      measures: measures.map((m) => (m.id === id ? { ...m, ...change } : m)),
    });
  }
  function updateFormat(change: Partial<NumberStyle>) {
    patch({ numberStyle: { ...format, ...change } });
  }
  function apply() {
    try {
      validateFilters(source, draft.filters);
      if (!isText && measures.some((m) => !source.columns.includes(m.field)))
        throw new Error("Escolha uma coluna disponível para cada medida.");
      if (
        !isText &&
        measures.some(
          (m) =>
            !["count", "distinct"].includes(m.aggregation) &&
            !source.numeric.includes(m.field),
        )
      )
        throw new Error(
          "Soma, média, mínimo, máximo e mediana precisam de uma coluna numérica. Altere o tipo em Preparar dados.",
        );
      if (
        draft.yMin !== undefined &&
        draft.yMax !== undefined &&
        draft.yMin >= draft.yMax
      )
        throw new Error("O mínimo do eixo precisa ser menor que o máximo.");
      onApply({
        ...draft,
        metric: measures[0].field,
        color: measures[0].color,
        height: !["kpi", "text"].includes(draft.type)
          ? Math.max(280, draft.height)
          : draft.height,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Confira as configurações.");
    }
  }
  const toggle = (
    label: string,
    key: "labels" | "grid" | "legend" | "axisX" | "axisY",
  ) => (
    <label className="model-toggle">
      <input
        type="checkbox"
        checked={draft[key] ?? key !== "labels"}
        onChange={(e) => patch({ [key]: e.target.checked })}
      />
      <span>{translate(label)}</span>
    </label>
  );
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="model-dialog chart-studio">
        <DialogHeader className="model-header">
          <DialogTitle>{translate("Configurar gráfico")}</DialogTitle>
          <DialogDescription>
            {translate(
              " Configure os campos e compare o resultado antes de aplicar ao painel. ",
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="chart-studio-body">
          <div className="chart-preview-panel">
            <div className="preview-meta">
              <span>{translate("PRÉVIA COM SEUS DADOS")}</span>
              <span>
                {calculated.rows.length} {translate(" linhas · ")}
                {calculated.series.length} {translate(" séries ")}
              </span>
            </div>
            <div className="chart-preview-card">
              <h3>{draft.title || translate("Visual sem título")}</h3>
              {draft.subtitle && <p>{draft.subtitle}</p>}
              <div className="chart-preview-plot">
                <VisualChart
                  visual={draft}
                  source={source}
                  rows={rows}
                  color={color}
                  dark={false}
                />
              </div>
            </div>
            <div className="preview-explanation">
              <strong>
                {isText
                  ? translate("Contexto para a equipe")
                  : isSingle
                    ? `${AGGREGATIONS.find((a) => a.value === measures[0].aggregation)?.label} de ${measures[0].field}`
                    : `${draft.dimension}${draft.splitBy ? translate(" dividido por {v0}", { v0: draft.splitBy }) : ""}`}
              </strong>
              <span>
                {draft.filters?.rules.length
                  ? translate(
                      "{v0} condições próprias + filtros do dashboard",
                      { v0: draft.filters.rules.length },
                    )
                  : translate("Usando os filtros do dashboard")}
              </span>
              {draft.type === "combo" && (
                <span>
                  {translate(
                    " Primeira medida em colunas; demais medidas em linhas. Todas usam o mesmo eixo e formato. ",
                  )}
                </span>
              )}
            </div>
            {!isText && draft.type !== "pivot" && (
              <details className="preview-result">
                <summary>
                  {translate(" Ver valores calculados (")}
                  {calculated.data.length} {translate(" grupos) ")}
                </summary>
                <div className="preview-result-scroll">
                  <table className="result-table">
                    <thead>
                      <tr>
                        <th>{draft.dimension}</th>
                        {calculated.series.map((s) => (
                          <th key={s.key}>{s.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {calculated.data.slice(0, 100).map((g) => (
                        <tr key={String(g.name)}>
                          <td>{g.name}</td>
                          {calculated.series.map((s) => (
                            <td key={s.key}>
                              {g[s.key] === null
                                ? "—"
                                : Number(g[s.key]).toLocaleString(locale(), {
                                    maximumFractionDigits: 4,
                                  })}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </div>
          <div className="chart-settings">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                <TabsTrigger value="data">
                  <SlidersHorizontal size={14} /> {translate(" Dados ")}
                </TabsTrigger>
                <TabsTrigger value="format">
                  <Palette size={14} /> {translate(" Formato ")}
                </TabsTrigger>
                <TabsTrigger value="filters">
                  <Filter size={14} /> {translate(" Filtros ")}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="data">
                <div className="settings-stack">
                  <TextField
                    label={translate("Título do gráfico")}
                    value={draft.title}
                    onChange={(title) => patch({ title })}
                  />
                  <Field
                    label={translate("Visualização")}
                    value={draft.type}
                    onChange={(type) => patch({ type: type as Visual["type"] })}
                    options={VISUAL_TYPES.map((t) => ({
                      value: t.type,
                      label: t.label,
                    }))}
                  />
                  {draft.type === "pivot" && (
                    <>
                      <Field
                        label={translate("Colunas da tabela dinâmica")}
                        value={
                          draft.pivotColumn ||
                          source.columns[1] ||
                          source.columns[0]
                        }
                        onChange={(pivotColumn) => patch({ pivotColumn })}
                        options={source.columns.map((c) => ({
                          raw: true,
                          value: c,
                          label: c,
                        }))}
                      />
                      <label className="model-toggle">
                        <input
                          type="checkbox"
                          checked={draft.heatmap ?? true}
                          onChange={(e) => patch({ heatmap: e.target.checked })}
                        />
                        {translate(" Mapa de calor ")}
                      </label>
                    </>
                  )}
                  {isText ? (
                    <label className="model-field">
                      <span>{translate("Texto da análise")}</span>
                      <textarea
                        aria-label={translate("Texto da análise")}
                        rows={7}
                        value={draft.text}
                        onChange={(e) => patch({ text: e.target.value })}
                      />
                    </label>
                  ) : (
                    <>
                      {!["kpi", "gauge"].includes(draft.type) && (
                        <>
                          <Field
                            label={translate(
                              "Eixo de categorias / agrupamento",
                            )}
                            value={draft.dimension}
                            onChange={(dimension) =>
                              patch({
                                dimension,
                                sort: source.dates.includes(dimension)
                                  ? "name"
                                  : "desc",
                              })
                            }
                            options={source.columns.map((c) => ({
                              raw: true,
                              value: c,
                              label: c,
                            }))}
                          />
                          {draft.type !== "pivot" &&
                            source.dates.includes(draft.dimension) && (
                              <Field
                                label={translate("Agrupar datas por")}
                                value={draft.grain}
                                onChange={(grain) =>
                                  patch({ grain: grain as Visual["grain"] })
                                }
                                options={[
                                  { value: "day", label: "Dia" },
                                  { value: "month", label: "Mês" },
                                  { value: "quarter", label: "Trimestre" },
                                  { value: "year", label: "Ano" },
                                ]}
                              />
                            )}
                        </>
                      )}
                      <div className="model-section-label">
                        {translate(" MEDIDAS")}{" "}
                        <span>
                          {isSingle
                            ? translate("1 medida")
                            : `${measures.length} / 4`}
                        </span>
                      </div>
                      {measures.slice(0, isSingle ? 1 : 4).map((m, index) => (
                        <div key={m.id} className="measure-card">
                          <div className="measure-title">
                            <span style={{ background: m.color }} />
                            <strong>
                              {translate("Medida ")}
                              {index + 1}
                            </strong>
                            {index > 0 && (
                              <button
                                aria-label={translate("Remover medida {v0}", {
                                  v0: index + 1,
                                })}
                                onClick={() =>
                                  patch({
                                    measures: measures.filter(
                                      (x) => x.id !== m.id,
                                    ),
                                  })
                                }
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                          <Field
                            label={translate("Campo da medida {v0}", {
                              v0: index + 1,
                            })}
                            value={m.field}
                            onChange={(field) =>
                              updateMeasure(m.id, {
                                field,
                                label: field,
                                ...(!source.numeric.includes(field)
                                  ? { aggregation: "distinct" as const }
                                  : {}),
                              })
                            }
                            options={source.columns.map((c) => ({
                              raw: true,
                              value: c,
                              label: c,
                            }))}
                          />
                          <Field
                            label={translate("Agregação da medida {v0}", {
                              v0: index + 1,
                            })}
                            value={m.aggregation}
                            onChange={(aggregation) =>
                              updateMeasure(m.id, {
                                aggregation:
                                  aggregation as Measure["aggregation"],
                              })
                            }
                            options={AGGREGATIONS.filter(
                              (a) =>
                                source.numeric.includes(m.field) ||
                                ["count", "distinct"].includes(a.value),
                            )}
                          />
                          <div className="measure-label-row">
                            <TextField
                              label={translate("Nome da série {v0}", {
                                v0: index + 1,
                              })}
                              value={m.label}
                              onChange={(label) =>
                                updateMeasure(m.id, { label })
                              }
                            />
                            <label className="model-field">
                              <span>{translate("Cor")}</span>
                              <input
                                type="color"
                                aria-label={translate("Cor da série {v0}", {
                                  v0: index + 1,
                                })}
                                value={m.color}
                                onChange={(e) =>
                                  updateMeasure(m.id, { color: e.target.value })
                                }
                              />
                            </label>
                          </div>
                        </div>
                      ))}
                      {!isSingle && !draft.splitBy && (
                        <button
                          className="secondary-button"
                          disabled={measures.length >= 4}
                          onClick={() =>
                            patch({
                              measures: [
                                ...measures,
                                {
                                  id: crypto.randomUUID(),
                                  field:
                                    source.numeric.find(
                                      (c) =>
                                        !measures.some((m) => m.field === c),
                                    ) ||
                                    source.numeric[0] ||
                                    source.columns[0],
                                  aggregation: source.numeric.length
                                    ? "sum"
                                    : "count",
                                  label:
                                    source.numeric.find(
                                      (c) =>
                                        !measures.some((m) => m.field === c),
                                    ) ||
                                    source.numeric[0] ||
                                    source.columns[0],
                                  color: SERIES_COLORS[measures.length],
                                },
                              ],
                            })
                          }
                        >
                          <Plus size={14} />{" "}
                          {translate(" Comparar outra medida ")}
                        </button>
                      )}
                      {!isSingle && (
                        <>
                          <Field
                            label={translate("Dividir em séries por")}
                            value={draft.splitBy || "__none"}
                            onChange={(v) =>
                              patch({ splitBy: v === "__none" ? undefined : v })
                            }
                            options={[
                              {
                                value: "__none",
                                label: "Sem divisão — comparar medidas",
                              },
                              ...source.columns.map((c) => ({
                                raw: true,
                                value: c,
                                label: c,
                              })),
                            ]}
                          />
                          {draft.splitBy && (
                            <p className="model-note">
                              {translate(
                                " Cada categoria vira uma série da primeira medida. Até 8 categorias, em ordem alfabética. As demais medidas ficam preservadas e voltam ao remover a divisão. ",
                              )}
                            </p>
                          )}
                        </>
                      )}
                      {!isSingle &&
                        ["bar", "horizontal", "area"].includes(draft.type) && (
                          <Field
                            label={translate("Disposição das séries")}
                            value={draft.stacking ?? "grouped"}
                            onChange={(v) =>
                              patch({ stacking: v as Visual["stacking"] })
                            }
                            options={[
                              {
                                value: "grouped",
                                label: "Lado a lado / sobrepostas",
                              },
                              { value: "stacked", label: "Empilhadas" },
                            ]}
                          />
                        )}{" "}
                      {!["kpi", "gauge"].includes(draft.type) && (
                        <div className="model-two">
                          <Field
                            label={translate("Ordenação dos grupos")}
                            value={draft.sort}
                            onChange={(sort) =>
                              patch({ sort: sort as Visual["sort"] })
                            }
                            options={[
                              { value: "desc", label: "Maior valor primeiro" },
                              { value: "asc", label: "Menor valor primeiro" },
                              {
                                value: "name",
                                label: "Categoria / cronológica",
                              },
                            ]}
                          />
                          <Field
                            label={translate("Limite de grupos")}
                            value={String(draft.limit)}
                            onChange={(v) => patch({ limit: Number(v) })}
                            options={[5, 8, 10, 12, 20, 50, 100, 0].map(
                              (v) => ({
                                value: String(v),
                                label: v ? `Top ${v}` : "Todos (até 500)",
                              }),
                            )}
                          />
                        </div>
                      )}
                      <p className="model-note">
                        {translate(
                          " A ordenação por valor considera a primeira medida. A contagem distinta desconsidera vazios. Mediana e média usam apenas valores numéricos preenchidos. ",
                        )}
                      </p>
                    </>
                  )}
                </div>
              </TabsContent>
              <TabsContent value="format">
                <div className="settings-stack">
                  <TextField
                    label={translate("Subtítulo / contexto")}
                    value={draft.subtitle ?? ""}
                    onChange={(subtitle) => patch({ subtitle })}
                  />
                  <div className="model-two">
                    <Field
                      label={translate("Largura no dashboard")}
                      value={String(draft.span)}
                      onChange={(v) =>
                        patch({ span: Number(v) as Visual["span"] })
                      }
                      options={[
                        { value: "4", label: "Um terço" },
                        { value: "6", label: "Metade" },
                        { value: "8", label: "Dois terços" },
                        { value: "12", label: "Linha inteira" },
                      ]}
                    />
                    <Field
                      label={translate("Altura no dashboard")}
                      value={String(draft.height)}
                      onChange={(v) => patch({ height: Number(v) })}
                      options={[
                        ...new Set([
                          180,
                          280,
                          320,
                          400,
                          480,
                          520,
                          draft.height,
                        ]),
                      ]
                        .sort((a, b) => a - b)
                        .map((v) => ({ value: String(v), label: `${v} px` }))}
                    />
                  </div>
                  <div className="model-section-label">
                    {translate("NÚMEROS E UNIDADES")}
                  </div>
                  <Field
                    label={translate("Formato dos valores")}
                    value={format.kind}
                    onChange={(kind) =>
                      updateFormat({ kind: kind as NumberStyle["kind"] })
                    }
                    options={[
                      { value: "auto", label: "Automático pelo campo" },
                      { value: "number", label: "Número" },
                      { value: "currency", label: "Moeda" },
                      { value: "percent", label: "Percentual" },
                    ]}
                  />
                  {format.kind === "currency" && (
                    <Field label={translate("Moeda dos valores")} value={format.currency ?? "BRL"}
                      onChange={(currency) => updateFormat({ currency: currency as NumberStyle["currency"] })}
                      options={[{ value: "BRL", label: "BRL · Real brasileiro", raw: true }, { value: "USD", label: "USD · US dollar", raw: true }, { value: "EUR", label: "EUR · Euro", raw: true }]} />
                  )}
                  {format.kind === "currency" && <p className="model-note">{translate("Altera a exibição da moeda, sem converter os valores por câmbio.")}</p>}
                  {format.kind === "percent" && (
                    <Field label={translate("Como o percentual está nos dados?")} value={format.percentInput ?? "fraction"}
                      onChange={(percentInput) => updateFormat({ percentInput: percentInput as NumberStyle["percentInput"] })}
                      options={[{ value: "fraction", label: "Fração · 0,25 vira 25%" }, { value: "whole", label: "Inteiro · 25 vira 25%" }]} />
                  )}
                  {format.kind !== "auto" && (
                    <>
                      <Field
                        label={translate("Casas decimais")}
                        value={String(format.decimals)}
                        onChange={(v) => updateFormat({ decimals: Number(v) })}
                        options={[0, 1, 2, 3, 4].map((v) => ({
                          raw: true,
                          value: String(v),
                          label: String(v),
                        }))}
                      />
                      <div className="model-two">
                        <TextField
                          label={translate("Prefixo")}
                          value={format.prefix}
                          onChange={(prefix) => updateFormat({ prefix })}
                        />
                        <TextField
                          label={translate("Sufixo")}
                          value={format.suffix}
                          onChange={(suffix) => updateFormat({ suffix })}
                        />
                      </div>
                    </>
                  )}
                  <label className="model-toggle">
                    <input
                      type="checkbox"
                      checked={format.compact}
                      onChange={(e) =>
                        updateFormat({ compact: e.target.checked })
                      }
                    />
                    {translate(" Abreviar milhares e milhões ")}
                  </label>
                  <div className="model-section-label">
                    {translate("LEITURA DO GRÁFICO")}
                  </div>
                  <p className="model-note" aria-live="polite">
                    {translate("Prévia do valor agregado")}: <strong>{formatChartNumber(calculated.value, ["count", "distinct"].includes(measures[0].aggregation) ? "Registros" : measures[0].field, format)}</strong>
                  </p>
                  {(cartesian || draft.type === "donut") &&
                    toggle("Exibir valores sobre o gráfico", "labels")}
                  {(cartesian || draft.type === "donut") && draft.labels && <>
                    <div className="model-two">
                      <Field label={translate("Tamanho dos rótulos")} value={String(draft.labelSize ?? 11)}
                        onChange={(v) => patch({ labelSize: Number(v) })}
                        options={[10, 11, 12, 14, 16, 18].map((v) => ({ value: String(v), label: `${v} px`, raw: true }))} />
                      <label className="model-field"><span>{translate("Cor dos rótulos")}</span>
                        <input type="color" aria-label={translate("Cor dos rótulos")} value={draft.labelColor ?? "#334d5d"}
                          onChange={(e) => patch({ labelColor: e.target.value })} />
                      </label>
                    </div>
                    <label className="model-toggle"><input type="checkbox" checked={!!draft.labelBold}
                      onChange={(e) => patch({ labelBold: e.target.checked })} />{translate("Rótulos em negrito")}</label>
                    {cartesian && <Field label={translate("Posição dos rótulos")} value={draft.labelPosition ?? "outside"}
                      onChange={(v) => patch({ labelPosition: v as Visual["labelPosition"] })}
                      options={[{ value: "outside", label: "Fora do gráfico" }, { value: "inside", label: "Dentro do gráfico" }]} />}
                    {draft.type === "donut" && <>
                      <Field label={translate("Conteúdo dos rótulos")} value={draft.donutLabel ?? "category-value"}
                        onChange={(v) => patch({ donutLabel: v as Visual["donutLabel"] })}
                        options={[{ value: "category-value", label: "Categoria e valor" }, { value: "value", label: "Somente valor" }, { value: "percent", label: "Participação percentual" }, { value: "category-percent", label: "Categoria e percentual" }]} />
                      <p className="model-note">{translate("A participação considera apenas os grupos exibidos, após os filtros e o limite de categorias.")}</p>
                    </>}
                    <button className="text-button" onClick={() => patch({ labelSize: undefined, labelColor: undefined, labelBold: undefined, labelPosition: undefined, donutLabel: undefined })}>{translate("Restaurar estilo dos rótulos")}</button>
                  </>}
                  {!isText && !["kpi", "gauge"].includes(draft.type) && <Field label={translate("Comprimento dos nomes das categorias")}
                    value={String(draft.categoryLabelLength ?? 22)} onChange={(v) => patch({ categoryLabelLength: Number(v) })}
                    options={[{ value: "12", label: "Curto · 12 caracteres" }, { value: "22", label: "Padrão · 22 caracteres" }, { value: "40", label: "Longo · 40 caracteres" }, { value: "0", label: "Nome completo" }]} />}
                  {hasLegend && toggle("Exibir legenda", "legend")}
                  {hasLegend && draft.legend && (
                    <Field
                      label={translate("Posição da legenda")}
                      value={draft.legendPosition ?? "bottom"}
                      onChange={(v) =>
                        patch({ legendPosition: v as Visual["legendPosition"] })
                      }
                      options={[
                        { value: "bottom", label: "Abaixo" },
                        { value: "top", label: "Acima" },
                      ]}
                    />
                  )}{" "}
                  {draft.type === "donut" ? (
                    <Field
                      label={translate("Abertura da rosca")}
                      value={String(draft.donutHole ?? 53)}
                      onChange={(v) => patch({ donutHole: Number(v) })}
                      options={[0, 35, 53, 65].map((v) => ({
                        value: String(v),
                        label: v ? `${v}%` : "Pizza sem abertura",
                      }))}
                    />
                  ) : cartesian || ["kpi", "gauge"].includes(draft.type) ? (
                    <>
                      {cartesian && (
                        <>
                          {toggle("Linhas de grade", "grid")}
                          {toggle("Exibir eixo horizontal", "axisX")}
                          {toggle("Exibir eixo vertical", "axisY")}
                          <TextField
                            label={translate("Título do eixo horizontal")}
                            value={draft.xTitle ?? ""}
                            onChange={(xTitle) => patch({ xTitle })}
                          />
                          <TextField
                            label={translate("Título do eixo vertical")}
                            value={draft.yTitle ?? ""}
                            onChange={(yTitle) => patch({ yTitle })}
                          />
                          <div className="model-two">
                            <TextField
                              label={translate("Mínimo do eixo numérico")}
                              type="number"
                              value={String(draft.yMin ?? "")}
                              onChange={(v) =>
                                patch({
                                  yMin: v === "" ? undefined : Number(v),
                                })
                              }
                              placeholder={translate("Automático")}
                            />
                            <TextField
                              label={translate("Máximo do eixo numérico")}
                              type="number"
                              value={String(draft.yMax ?? "")}
                              onChange={(v) =>
                                patch({
                                  yMax: v === "" ? undefined : Number(v),
                                })
                              }
                              placeholder={translate("Automático")}
                            />
                          </div>
                          <p className="model-note">
                            {translate(
                              " Limites manuais recortam valores fora do intervalo. ",
                            )}
                          </p>
                        </>
                      )}
                      <TextField
                        label={
                          draft.type === "gauge"
                            ? translate("Valor da meta")
                            : translate("Linha de meta / referência")
                        }
                        type="number"
                        value={String(draft.target ?? "")}
                        onChange={(v) =>
                          patch({ target: v === "" ? undefined : Number(v) })
                        }
                        placeholder={translate("Sem meta")}
                      />
                      {draft.target !== undefined && (
                        <TextField
                          label={translate("Nome da referência")}
                          value={draft.targetLabel ?? "Meta"}
                          onChange={(targetLabel) => patch({ targetLabel })}
                        />
                      )}
                    </>
                  ) : null}
                  {draft.type === "radar" && toggle("Linhas de grade", "grid")}
                  {["line", "area", "combo"].includes(draft.type) && (
                    <>
                      <Field
                        label={translate("Traçado das linhas")}
                        value={draft.curve ?? "monotone"}
                        onChange={(v) => patch({ curve: v as Visual["curve"] })}
                        options={[
                          { value: "monotone", label: "Suave" },
                          { value: "linear", label: "Reto" },
                          { value: "step", label: "Degraus" },
                        ]}
                      />
                      <Field
                        label={translate("Espessura da linha")}
                        value={String(draft.strokeWidth ?? 3)}
                        onChange={(v) => patch({ strokeWidth: Number(v) })}
                        options={[1, 2, 3, 4, 5].map((v) => ({
                          value: String(v),
                          label: `${v} px`,
                        }))}
                      />
                    </>
                  )}
                </div>
              </TabsContent>
              <TabsContent value="filters">
                <div className="settings-stack">
                  <div className="model-section-label">
                    {translate(" FILTROS DESTE VISUAL ")}
                  </div>
                  <p className="model-note">
                    {translate(
                      " Restrinja somente este gráfico. Os demais visuais continuam usando seus próprios filtros. Estas condições são aplicadas após os filtros do dashboard. ",
                    )}
                  </p>
                  <FilterBuilder
                    source={source}
                    value={draft.filters ?? { mode: "and", rules: [] }}
                    onChange={(filters) => patch({ filters })}
                  />
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
        <div className="model-footer">
          {error ? (
            <span className="model-error" role="alert">
              {translate(error)}
            </span>
          ) : (
            <span>
              {translate(
                "Alterações em prévia · aplicadas juntas ao confirmar",
              )}
            </span>
          )}
          <button className="secondary-button" onClick={onClose}>
            {translate(" Cancelar ")}
          </button>
          <button className="primary-button" onClick={apply}>
            <Check size={16} /> {translate(" Aplicar gráfico ")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
