"use client";
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
  const items = source.columns.map((c) => ({ value: c, label: c }));
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
          <div className="model-eyebrow">
            <BarChart3 size={16} /> LABORATÓRIO DE ANÁLISE
          </div>
          <DialogTitle>Encontre a próxima pergunta.</DialogTitle>
          <DialogDescription>
            {rows.length.toLocaleString("pt-BR")} registros no recorte atual.
            Explore padrões, cruze dimensões e confira a qualidade da base.
          </DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={setTab} className="hub-tabs">
          <TabsList>
            <TabsTrigger value="insights">
              <BarChart3 size={16} /> Destaques
            </TabsTrigger>
            <TabsTrigger value="pivot">
              <Table2 size={16} /> Tabela dinâmica
            </TabsTrigger>
            <TabsTrigger value="quality">
              <ShieldCheck size={16} /> Qualidade
            </TabsTrigger>
          </TabsList>
          <TabsContent value="insights" className="hub-content">
            <div className="hub-controls">
              <Field
                label="Medida para explorar"
                value={metric}
                onChange={setMetric}
                options={source.numeric.map((c) => ({ value: c, label: c }))}
              />
              <Field
                label="Analisar por"
                value={dimension}
                onChange={setDimension}
                options={items}
              />
            </div>
            {!source.numeric.length ? (
              <p className="model-note">
                Defina uma coluna numérica em Preparar dados para analisar
                valores. A tabela dinâmica permite contar registros agora.
              </p>
            ) : (
              <>
                <div className="analysis-stats">
                  <article>
                    <span>Total de {metric}</span>
                    <strong>{fmt(facts.total)}</strong>
                    <small>
                      {facts.valid} valores numéricos · {facts.missing} vazios
                      ou inválidos
                    </small>
                  </article>
                  <article>
                    <span>Maior grupo</span>
                    <strong>{facts.ranking[0]?.name || "—"}</strong>
                    <small>
                      {facts.ranking[0]
                        ? fmt(facts.ranking[0].value)
                        : "Sem dados"}
                      {facts.share !== null
                        ? ` · ${(facts.share * 100).toFixed(1)}% do total`
                        : ""}
                    </small>
                  </article>
                  <article>
                    <span>Valores fora da faixa usual</span>
                    <strong>{facts.outliers}</strong>
                    <small>
                      Regra de 1,5 × intervalo interquartil; não significa erro.
                    </small>
                  </article>
                </div>
                <h3>Onde está o resultado?</h3>
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
                        <small>Explorar registros</small>
                      </span>
                      <strong>{fmt(g.value)}</strong>
                    </button>
                  ))}
                </div>
                <p className="model-note">
                  Cálculos descritivos sobre o recorte atual, sem inferência
                  causal ou previsão. Até cinco maiores grupos de {facts.groups}
                  ; valores ausentes não entram na soma.
                </p>
              </>
            )}
          </TabsContent>
          <TabsContent value="pivot" className="hub-content">
            <div className="hub-controls pivot-controls">
              <Field
                label="Linhas"
                value={spec.row}
                onChange={(row) => setSpec({ ...spec, row })}
                options={items}
              />
              <Field
                label="Colunas"
                value={spec.column}
                onChange={(column) => setSpec({ ...spec, column })}
                options={items}
              />
              <Field
                label="Valores"
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
                label="Calcular"
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
                Mapa de calor
              </label>
              <button className="secondary-button" onClick={exportPivot}>
                <Download size={15} />
                Exportar CSV
              </button>
              <button
                className="primary-button"
                disabled={!canAdd}
                title={canAdd ? undefined : "Limite de 24 visuais por painel"}
                onClick={() => onAdd(spec)}
              >
                <Plus size={15} />
                Adicionar ao painel
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
              Base preparada completa: {source.rows.length} linhas. Filtros do
              painel não alteram este diagnóstico.
            </p>
            <div className="analysis-stats">
              <article>
                <span>Preenchimento</span>
                <strong>
                  {report.completeness === null
                    ? "—"
                    : `${report.completeness.toFixed(1)}%`}
                </strong>
                <small>{report.empty} células vazias</small>
              </article>
              <article>
                <span>Valores incompatíveis com o tipo</span>
                <strong>{report.invalid}</strong>
                <small>Campos numéricos e datas</small>
              </article>
              <article>
                <span>Linhas repetidas</span>
                <strong>{report.duplicates}</strong>
                <small>
                  Comparação de todas as colunas; revise antes de remover.
                </small>
              </article>
            </div>
            <div className="pivot-scroll">
              <table className="result-table">
                <thead>
                  <tr>
                    <th>Coluna</th>
                    <th>Tipo</th>
                    <th>Distintos</th>
                    <th>Vazios</th>
                    <th>Inválidos</th>
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
              Tratar a base em Preparar dados
            </button>
          </TabsContent>
        </Tabs>
        <footer className="model-footer">
          <span>Seus dados permanecem neste navegador.</span>
          <button className="secondary-button" onClick={onClose}>
            Concluir
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
          <div className="model-eyebrow">REGISTROS POR TRÁS DO RESULTADO</div>
          <DialogTitle>{visual?.title || "Explorar recorte"}</DialogTitle>
          <DialogDescription>
            {initial.map((s) => `${s.field}: ${s.value}`).join(" · ") ||
              "Todos os registros considerados neste visual, incluindo seus filtros."}
          </DialogDescription>
        </DialogHeader>
        <div className="data-toolbar">
          <label className="table-search">
            <input
              aria-label="Buscar registros do recorte"
              placeholder="Buscar nos registros…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
            />
          </label>
          <span>{matches.length} registros</span>
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
            Exportar registros
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
            <p className="model-note">Nenhum registro neste recorte.</p>
          )}
        </div>
        <footer className="model-footer">
          <span>
            Página {current + 1} de {pages}
          </span>
          <button
            className="secondary-button"
            disabled={!current}
            onClick={() => setPage(current - 1)}
          >
            Anterior
          </button>
          <button
            className="secondary-button"
            disabled={current + 1 >= pages}
            onClick={() => setPage(current + 1)}
          >
            Próxima
          </button>
          {initial.length > 0 && (
            <button
              className="primary-button"
              onClick={() => onFilter(initial)}
            >
              Filtrar painel por este recorte
            </button>
          )}
          <button className="secondary-button" onClick={onClose}>
            Fechar
          </button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
