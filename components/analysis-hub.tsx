"use client";
import { t as translate, locale } from "@/lib/i18n";
import { useMemo, useState } from "react";
import { BarChart3, Download, Plus, ShieldCheck, Table2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Field } from "./model-controls";
import { PivotTable } from "./pivot-table";
import { AGGREGATIONS, formatChartNumber } from "@/lib/chart-model";
import {
  insights,
  qualityReport,
  pivotData,
  type PivotSpec,
  type Selection,
} from "@/lib/exploration";
import { toCSV, type Source, type DataRow } from "@/lib/analytics";
import { downloadFile } from "./analytics-studio";
import type { Visual } from "@/lib/visual-builder";

export function AnalysisHub({
  source,
  rows,
  onClose,
  onAdd,
  onDrill,
  onPrepare,
  canAdd,
}: {
  source: Source;
  rows: DataRow[];
  canAdd: boolean;
  onClose: () => void;
  onAdd: (spec: PivotSpec) => void;
  onDrill: (selections: Selection[]) => void;
  onPrepare: () => void;
}) {
  const dimensions = source.columns.filter(
    (c) => !source.numeric.includes(c) && !source.dates.includes(c),
  );
  const [tab, setTab] = useState("insights"),
    [metric, setMetric] = useState(source.numeric[0] || source.columns[0]),
    [dimension, setDimension] = useState(dimensions[0] || source.columns[0]);
  const [spec, setSpec] = useState<PivotSpec>({
    row: dimensions[0] || source.columns[0],
    column: dimensions[1] || source.columns[1] || source.columns[0],
    metric: source.numeric[0] || source.columns[0],
    aggregation: source.numeric.length ? "sum" : "count",
    heatmap: true,
  });
  const report = useMemo(() => qualityReport(source), [source]);
  const facts = useMemo(
    () => insights(rows, source, metric, dimension),
    [rows, source, metric, dimension],
  );
  const items = source.columns.map((c) => ({ raw: true, value: c, label: c }));
  const fmt = (v: number | null) => formatChartNumber(v, metric);
  function exportPivot() {
    const p = pivotData(rows, spec);
    const columns = [
      "Grupo",
      ...p.colKeys.map((c, i) => `${i + 1}. ${c || "(Vazio)"}`),
      "Total",
    ];
    const csvRows = p.rowKeys.map((r, i) =>
      Object.fromEntries(
        columns.map((c, j) => [
          c,
          j === 0
            ? r
            : String(
                (j === columns.length - 1
                  ? p.rowTotals[i]
                  : p.values[i][j - 1]) ?? "",
              ),
        ]),
      ),
    );
    csvRows.push(
      Object.fromEntries(
        columns.map((c, j) => [
          c,
          j === 0
            ? "Total"
            : String(
                (j === columns.length - 1 ? p.total : p.colTotals[j - 1]) ?? "",
              ),
        ]),
      ),
    );
    downloadFile(
      "tabela-dinamica.csv",
      toCSV({ ...source, columns, rows: csvRows }),
      "text/csv;charset=utf-8",
    );
  }
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="model-dialog analysis-hub">
        <DialogHeader className="model-header">
          <DialogTitle>{translate("Encontre a próxima pergunta.")}</DialogTitle>
          <DialogDescription>
            {rows.length.toLocaleString(locale())}{" "}
            {translate(
              " registros no recorte atual. Explore padrões, cruze dimensões e confira a qualidade da base. ",
            )}
          </DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={setTab} className="hub-tabs">
          <TabsList>
            <TabsTrigger value="insights">
              <BarChart3 size={16} /> {translate(" Destaques ")}
            </TabsTrigger>
            <TabsTrigger value="pivot">
              <Table2 size={16} /> {translate(" Tabela dinâmica ")}
            </TabsTrigger>
            <TabsTrigger value="quality">
              <ShieldCheck size={16} /> {translate(" Qualidade ")}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="insights" className="hub-content">
            <div className="hub-controls">
              <Field
                label={translate("Medida para explorar")}
                value={metric}
                onChange={setMetric}
                options={source.numeric.map((c) => ({
                  raw: true,
                  value: c,
                  label: c,
                }))}
              />
              <Field
                label={translate("Analisar por")}
                value={dimension}
                onChange={setDimension}
                options={items}
              />
            </div>
            {!source.numeric.length ? (
              <p className="model-note">
                {translate(
                  " Defina uma coluna numérica em Preparar dados para analisar valores. A tabela dinâmica permite contar registros agora. ",
                )}
              </p>
            ) : (
              <>
                <div className="analysis-stats">
                  <article>
                    <span>
                      {translate("Total de ")}
                      {metric}
                    </span>
                    <strong>{fmt(facts.total)}</strong>
                    <small>
                      {facts.valid} {translate(" valores numéricos · ")}
                      {facts.missing} {translate(" vazios ou inválidos ")}
                    </small>
                  </article>
                  <article>
                    <span>{translate("Maior grupo")}</span>
                    <strong>{facts.ranking[0]?.name || "—"}</strong>
                    <small>
                      {facts.ranking[0]
                        ? fmt(facts.ranking[0].value)
                        : translate("Sem dados")}
                      {facts.share !== null
                        ? translate(" · {v0}% do total", {
                            v0: (facts.share * 100).toFixed(1),
                          })
                        : ""}
                    </small>
                  </article>
                  <article>
                    <span>{translate("Valores fora da faixa usual")}</span>
                    <strong>{facts.outliers}</strong>
                    <small>
                      {translate(
                        " Regra de 1,5 × intervalo interquartil; não significa erro. ",
                      )}
                    </small>
                  </article>
                </div>
                <h3>{translate("Onde está o resultado?")}</h3>
                <div className="insight-ranking">
                  {facts.ranking.map((g, i) => (
                    <button
                      key={g.name}
                      onClick={() =>
                        onDrill([{ field: dimension, value: g.name }])
                      }
                    >
                      <span className="ranking-index">0{i + 1}</span>
                      <span>
                        {g.name}
                        <small>{translate("Explorar registros")}</small>
                      </span>
                      <strong>{fmt(g.value)}</strong>
                    </button>
                  ))}
                </div>
                <p className="model-note">
                  {translate(
                    " Cálculos descritivos sobre o recorte atual, sem inferência causal ou previsão. Até cinco maiores grupos de ",
                  )}
                  {facts.groups}
                  {translate(" ; valores ausentes não entram na soma. ")}
                </p>
              </>
            )}
          </TabsContent>
          <TabsContent value="pivot" className="hub-content">
            <div className="hub-controls pivot-controls">
              <Field
                label={translate("Linhas")}
                value={spec.row}
                onChange={(row) => setSpec({ ...spec, row })}
                options={items}
              />
              <Field
                label={translate("Colunas")}
                value={spec.column}
                onChange={(column) => setSpec({ ...spec, column })}
                options={items}
              />
              <Field
                label={translate("Valores")}
                value={spec.metric}
                onChange={(metric) =>
                  setSpec({
                    ...spec,
                    metric,
                    aggregation: source.numeric.includes(metric)
                      ? "sum"
                      : "count",
                  })
                }
                options={items}
              />
              <Field
                label={translate("Calcular")}
                value={spec.aggregation}
                onChange={(aggregation) =>
                  setSpec({
                    ...spec,
                    aggregation: aggregation as PivotSpec["aggregation"],
                  })
                }
                options={AGGREGATIONS.filter(
                  (a) =>
                    source.numeric.includes(spec.metric) ||
                    ["count", "distinct"].includes(a.value),
                )}
              />
            </div>
            <div className="hub-inline-actions">
              <label className="model-toggle">
                <input
                  type="checkbox"
                  checked={spec.heatmap}
                  onChange={(e) =>
                    setSpec({ ...spec, heatmap: e.target.checked })
                  }
                />
                {translate(" Mapa de calor ")}
              </label>
              <button className="secondary-button" onClick={exportPivot}>
                <Download size={15} />
                {translate(" Exportar CSV ")}
              </button>
              <button
                className="primary-button"
                disabled={!canAdd}
                title={
                  canAdd
                    ? undefined
                    : translate("Limite de 24 visuais por painel")
                }
                onClick={() => onAdd(spec)}
              >
                <Plus size={15} />
                {translate(" Adicionar ao painel ")}
              </button>
            </div>
            <PivotTable
              rows={rows}
              spec={spec}
              onCell={(r, c) =>
                onDrill([
                  { field: spec.row, value: r, raw: true },
                  { field: spec.column, value: c, raw: true },
                ])
              }
            />
          </TabsContent>
          <TabsContent value="quality" className="hub-content">
            <p className="model-note">
              {translate(" Base preparada completa: ")}
              {source.rows.length}{" "}
              {translate(
                " linhas. Filtros do painel não alteram este diagnóstico. ",
              )}
            </p>
            <div className="analysis-stats">
              <article>
                <span>{translate("Preenchimento")}</span>
                <strong>
                  {report.completeness === null
                    ? "—"
                    : `${report.completeness.toFixed(1)}%`}
                </strong>
                <small>
                  {report.empty} {translate(" células vazias")}
                </small>
              </article>
              <article>
                <span>{translate("Valores incompatíveis com o tipo")}</span>
                <strong>{report.invalid}</strong>
                <small>{translate("Campos numéricos e datas")}</small>
              </article>
              <article>
                <span>{translate("Linhas repetidas")}</span>
                <strong>{report.duplicates}</strong>
                <small>
                  {translate(
                    " Comparação de todas as colunas; revise antes de remover. ",
                  )}
                </small>
              </article>
            </div>
            <div className="pivot-scroll">
              <table className="result-table">
                <thead>
                  <tr>
                    <th>{translate("Coluna")}</th>
                    <th>{translate("Tipo")}</th>
                    <th>{translate("Distintos")}</th>
                    <th>{translate("Vazios")}</th>
                    <th>{translate("Inválidos")}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.columns.map((c) => (
                    <tr key={c.field}>
                      <th>{c.field}</th>
                      <td>{c.type}</td>
                      <td>{c.distinct}</td>
                      <td className={c.empty ? "quality-attention" : ""}>
                        {c.empty}
                      </td>
                      <td className={c.invalid ? "quality-attention" : ""}>
                        {c.invalid}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="primary-button" onClick={onPrepare}>
              {translate(" Tratar a base em Preparar dados ")}
            </button>
          </TabsContent>
        </Tabs>
        <footer className="model-footer">
          <span>{translate("Seus dados permanecem neste navegador.")}</span>
          <button className="secondary-button" onClick={onClose}>
            {translate(" Concluir ")}
          </button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

export function DrillExplorer({
  source,
  rows,
  visual,
  selections: initial,
  onClose,
  onFilter,
}: {
  source: Source;
  rows: DataRow[];
  visual?: Visual;
  selections: Selection[];
  onClose: () => void;
  onFilter: (selection: Selection[]) => void;
}) {
  const [query, setQuery] = useState(""),
    [page, setPage] = useState(0);
  const [sort, setSort] = useState<{ field: string; desc: boolean } | null>(
    null,
  );
  const matches = useMemo(() => {
    let result = rows.filter((row) =>
      source.columns.some((c) =>
        (row[c] ?? "").toLowerCase().includes(query.toLowerCase()),
      ),
    );
    if (sort)
      result = [...result].sort(
        (a, b) =>
          (a[sort.field] ?? "").localeCompare(b[sort.field] ?? "", "pt-BR", {
            numeric: true,
          }) * (sort.desc ? -1 : 1),
      );
    return result;
  }, [rows, query, source.columns, sort]);
  const pages = Math.max(1, Math.ceil(matches.length / 40)),
    current = Math.min(page, pages - 1);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="model-dialog drill-dialog">
        <DialogHeader className="model-header">
          <DialogTitle>
            {visual?.title || translate("Explorar recorte")}
          </DialogTitle>
          <DialogDescription>
            {initial.map((s) => `${s.field}: ${s.value}`).join(" · ") ||
              translate(
                "Todos os registros considerados neste visual, incluindo seus filtros.",
              )}
          </DialogDescription>
        </DialogHeader>
        <div className="data-toolbar">
          <label className="table-search">
            <input
              aria-label={translate("Buscar registros do recorte")}
              placeholder={translate("Buscar nos registros…")}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
            />
          </label>
          <span>
            {matches.length} {translate(" registros")}
          </span>
          <button
            className="secondary-button"
            onClick={() =>
              downloadFile(
                "registros-do-recorte.csv",
                toCSV({ ...source, rows: matches }),
                "text/csv;charset=utf-8",
              )
            }
          >
            <Download size={15} />
            {translate(" Exportar registros ")}
          </button>
        </div>
        <div className="drill-table">
          <table className="result-table">
            <thead>
              <tr>
                {source.columns.map((c) => (
                  <th key={c}>
                    <button
                      onClick={() => {
                        setSort({
                          field: c,
                          desc: sort?.field === c ? !sort.desc : false,
                        });
                        setPage(0);
                      }}
                    >
                      {c}
                      {sort?.field === c ? (sort.desc ? " ↓" : " ↑") : ""}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matches.slice(current * 40, current * 40 + 40).map((r, i) => (
                <tr key={current * 40 + i}>
                  {source.columns.map((c) => (
                    <td key={c}>{r[c] || "—"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {!matches.length && (
            <p className="model-note">
              {translate("Nenhum registro neste recorte.")}
            </p>
          )}
        </div>
        <footer className="model-footer">
          <span>
            {translate(" Página ")}
            {current + 1} {translate(" de ")}
            {pages}
          </span>
          <button
            className="secondary-button"
            disabled={!current}
            onClick={() => setPage(current - 1)}
          >
            {translate(" Anterior ")}
          </button>
          <button
            className="secondary-button"
            disabled={current + 1 >= pages}
            onClick={() => setPage(current + 1)}
          >
            {translate(" Próxima ")}
          </button>
          {initial.length > 0 && (
            <button
              className="primary-button"
              onClick={() => onFilter(initial)}
            >
              {translate(" Filtrar painel por este recorte ")}
            </button>
          )}
          <button className="secondary-button" onClick={onClose}>
            {translate(" Fechar ")}
          </button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
