"use client";
import { t as translate, locale } from "@/lib/i18n";
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
    return (
      <p className="model-note">
        {translate("Nenhum registro neste recorte.")}
      </p>
    );
  return (
    <div className="pivot-container">
      <div className="pivot-scroll">
        <table className="pivot-table">
          <caption>
            {spec.row} {translate(" × ")}
            {spec.column} · {spec.metric}
          </caption>
          <thead>
            <tr>
              <th scope="col">
                {spec.row} / {spec.column}
              </th>
              {data.colKeys.map((c) => (
                <th scope="col" key={c}>
                  {c || translate("(Vazio)")}
                </th>
              ))}
              <th scope="col">{translate("Total")}</th>
            </tr>
          </thead>
          <tbody>
            {data.rowKeys.map((r, i) => (
              <tr key={r}>
                <th scope="row">{r || translate("(Vazio)")}</th>
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
                          aria-label={translate("Ver registros: {v0}, {v1}", {
                            v0: r || "vazio",
                            v1: c || "vazio",
                          })}
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
              <th>{translate("Total")}</th>
              {data.colTotals.map((v, i) => (
                <td key={data.colKeys[i]}>{number(v)}</td>
              ))}
              <td>{number(data.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="model-note">
        {translate(
          " Totais recalculados sobre os registros, inclusive para média e contagem distinta. ",
        )}
        {data.omittedRows > 0 || data.omittedCols > 0
          ? translate(
              " Exibição limitada: {v0} grupos de linha e {v1} de coluna omitidos; totais incluem todos.",
              { v0: data.omittedRows, v1: data.omittedCols },
            )
          : ""}
      </p>
    </div>
  );
}
