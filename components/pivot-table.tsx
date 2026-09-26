"use client";
import { useMemo } from "react";
import { pivotData, type PivotSpec } from "@/lib/exploration";
import { formatChartNumber, type NumberStyle } from "@/lib/chart-model";
import type { DataRow } from "@/lib/analytics";

export function PivotTable({
  rows,
  spec,
  format,
  onCell,
}: {
  rows: DataRow[];
  spec: PivotSpec;
  format?: NumberStyle;
  onCell?: (row: string, column: string) => void;
}) {
  const data = useMemo(() => pivotData(rows, spec), [rows, spec]);
  const number = (n: number | null) =>
    formatChartNumber(
      n,
      ["count", "distinct"].includes(spec.aggregation)
        ? "Registros"
        : spec.metric,
      format,
    );
  if (!rows.length)
    return <p className="model-note">Nenhum registro neste recorte.</p>;
  return (
    <div className="pivot-container">
      <div className="pivot-scroll">
        <table className="pivot-table">
          <caption>
            {spec.row} × {spec.column} · {spec.metric}
          </caption>
          <thead>
            <tr>
              <th scope="col">
                {spec.row} / {spec.column}
              </th>
              {data.colKeys.map((c) => (
                <th scope="col" key={c}>
                  {c || "(Vazio)"}
                </th>
              ))}
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.rowKeys.map((r, i) => (
              <tr key={r}>
                <th scope="row">{r || "(Vazio)"}</th>
                {data.colKeys.map((c, j) => {
                  const v = data.values[i][j],
                    strength =
                      v === null
                        ? 0
                        : data.max === data.min
                          ? 0.15
                          : 0.08 +
                            (0.5 * (v - data.min)) / (data.max - data.min);
                  return (
                    <td
                      key={c}
                      style={
                        spec.heatmap && v !== null
                          ? { background: `rgba(115,207,107,${strength})` }
                          : undefined
                      }
                    >
                      {onCell ? (
                        <button
                          onClick={() => onCell(r, c)}
                          aria-label={`Ver registros: ${r || "vazio"}, ${c || "vazio"}`}
                        >
                          {number(v)}
                        </button>
                      ) : (
                        number(v)
                      )}
                    </td>
                  );
                })}
                <td className="pivot-total">{number(data.rowTotals[i])}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th>Total</th>
              {data.colTotals.map((v, i) => (
                <td key={data.colKeys[i]}>{number(v)}</td>
              ))}
              <td>{number(data.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="model-note">
        Totais recalculados sobre os registros, inclusive para média e contagem
        distinta.
        {data.omittedRows > 0 || data.omittedCols > 0
          ? ` Exibição limitada: ${data.omittedRows} grupos de linha e ${data.omittedCols} de coluna omitidos; totais incluem todos.`
          : ""}
      </p>
    </div>
  );
}
