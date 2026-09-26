"use client";
import { PivotTable } from "./pivot-table";
import type { Selection } from "@/lib/exploration";

import { useMemo, useState } from "react";
import {
  Treemap,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Area,
  Bar,
  Line,
  ComposedChart,
  Pie,
  PieChart,
  Cell,
  ResponsiveContainer,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  LabelList,
  ReferenceLine,
} from "recharts";
import { parseDate, type DataRow, type Source } from "@/lib/analytics";
import { chartData, formatChartNumber, measuresFor } from "@/lib/chart-model";
import { gaugeProgress } from "@/lib/layout";
import type { Visual } from "@/lib/visual-builder";

export function VisualChart({
  visual,
  source,
  rows,
  color,
  dark,
  onFilter,
  onInspect,
}: {
  visual: Visual;
  source: Source;
  rows: DataRow[];
  color: string;
  dark: boolean;
  onFilter?: (value: string) => void;
  onInspect?: (selections: Selection[]) => void;
}) {
  const [chartWidth, setChartWidth] = useState(600);
  const result = useMemo(
    () => chartData(rows, source, visual, color),
    [rows, source, visual, color],
  );
  const { data, series } = result,
    primary = measuresFor(visual, color)[0];
  const unit = ["count", "distinct"].includes(primary.aggregation)
    ? "Registros"
    : primary.field;
  const format = (value: number | null) =>
    formatChartNumber(value, unit, visual.numberStyle);
  const ink = dark ? "#c1d2dd" : "#637585",
    grid = dark ? "#304656" : "#e5ecf1";
  const label = (value: string) => {
    const t = parseDate(value);
    if (t !== null && source.dates.includes(visual.dimension)) {
      const d = new Date(t);
      if (visual.grain === "year") return String(d.getUTCFullYear());
      if (visual.grain === "quarter")
        return `T${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`;
      return new Intl.DateTimeFormat("pt-BR", {
        month: "short",
        year: "2-digit",
        ...(visual.grain === "day" ? { day: "2-digit" as const } : {}),
        timeZone: "UTC",
      }).format(d);
    }
    return value.length > 22 ? value.slice(0, 20) + "…" : value;
  };
  const unknown =
    measuresFor(visual).some((m) => !source.columns.includes(m.field)) ||
    (!["kpi", "text"].includes(visual.type) &&
      !source.columns.includes(visual.dimension)) ||
    visual.filters?.rules.some((r) => !source.columns.includes(r.field));
  if (visual.type === "text")
    return (
      <div className="visual-note">
        {visual.text || "Adicione uma observação nas configurações do bloco."}
      </div>
    );
  if (unknown)
    return (
      <div className="visual-empty">
        Uma coluna usada por este visual não está disponível. Abra Configurar
        gráfico e selecione os campos do resultado atual.
      </div>
    );
  if (visual.type === "kpi")
    return (
      <div className="visual-kpi">
        <strong
          style={{ color: primary.color }}
          title={formatChartNumber(result.value, unit, {
            kind: "number",
            decimals: 2,
            compact: false,
            prefix: "",
            suffix: "",
          })}
        >
          {format(result.value)}
        </strong>
        <p>
          {primary.label || primary.field} ·{" "}
          {
            {
              sum: "Soma",
              average: "Média",
              count: "Contagem de linhas",
              distinct: "Valores distintos",
              min: "Mínimo",
              max: "Máximo",
              median: "Mediana",
            }[primary.aggregation]
          }
        </p>
        {result.missing > 0 &&
          !["count", "distinct"].includes(primary.aggregation) && (
            <small>
              {result.missing} valores vazios ou inválidos desconsiderados
            </small>
          )}
        {visual.target !== undefined && (
          <small>
            Meta: {format(visual.target)}
            {result.value !== null
              ? ` · diferença: ${format(result.value - visual.target)}`
              : ""}
          </small>
        )}
      </div>
    );
  if (!result.rows.length)
    return (
      <div className="visual-empty">
        Nenhum registro atende aos filtros deste visual.
      </div>
    );
  if (visual.type === "gauge") {
    const progress = gaugeProgress(result.value, visual.target);
    if (!progress)
      return (
        <div className="visual-empty">
          Configure uma meta maior que zero na aba Formato. O medidor precisa de
          um resultado não negativo.
        </div>
      );
    return (
      <div className="target-gauge">
        <svg
          viewBox="0 0 240 140"
          role="img"
          aria-label={`${format(result.value)} de ${format(visual.target!)}: ${(progress.ratio * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% da meta`}
        >
          <path
            d="M25 120 A95 95 0 0 1 215 120"
            fill="none"
            stroke={grid}
            strokeWidth="18"
            strokeLinecap="round"
          />
          <path
            d="M25 120 A95 95 0 0 1 215 120"
            fill="none"
            stroke={primary.color}
            strokeWidth="18"
            strokeLinecap="round"
            pathLength="100"
            strokeDasharray={`${progress.arc * 100} 100`}
          />
          <text
            x="120"
            y="108"
            textAnchor="middle"
            fill={dark ? "#e3eef5" : "#24382d"}
            fontSize="29"
            fontWeight="600"
          >
            {(progress.ratio * 100).toLocaleString("pt-BR", {
              maximumFractionDigits: 1,
            })}
            %
          </text>
        </svg>
        <strong>{format(result.value)}</strong>
        <span>
          {visual.targetLabel || "Meta"}: {format(visual.target!)}
        </span>
        {progress.ratio > 1 && (
          <small>
            Meta superada em {format(result.value! - visual.target!)}
          </small>
        )}
      </div>
    );
  }
  if (visual.type === "funnel") {
    if (result.negative || !data.some((g) => Number(g.s0) > 0))
      return (
        <div className="visual-empty">
          O funil precisa de valores não negativos e pelo menos um valor
          positivo.
        </div>
      );
    const max = Math.max(...data.map((g) => Number(g.s0)));
    return (
      <div className="comparison-funnel">
        {data.map((g, i) => (
          <button
            key={String(g.name)}
            disabled={!onFilter}
            onClick={() => onFilter?.(String(g.name))}
            title={`${g.name}: ${format(Number(g.s0))}`}
          >
            <span>{label(String(g.name))}</span>
            <div className="funnel-track">
              <i
                style={{
                  width: `${(Number(g.s0) / max) * 100}%`,
                  background: primary.color,
                  opacity: 1 - (i / (data.length + 2)) * 0.5,
                }}
              />
            </div>
            <strong>{g.s0 === null ? "—" : format(Number(g.s0))}</strong>
          </button>
        ))}
        <p className="visual-caption">
          Largura proporcional ao maior valor. Ordenação configurada no visual;
          não representa taxa de conversão.
          {result.totalGroups > data.length
            ? ` Exibindo ${data.length} de ${result.totalGroups} grupos.`
            : ""}
        </p>
      </div>
    );
  }
  if (visual.type === "radar" && (result.negative || data.length < 3))
    return (
      <div className="visual-empty">
        O radar precisa de pelo menos três categorias e valores não negativos.
        Ajuste os filtros ou use barras.
      </div>
    );
  if (visual.type === "pivot")
    return visual.pivotColumn && source.columns.includes(visual.pivotColumn) ? (
      <PivotTable
        rows={result.rows}
        spec={{
          row: visual.dimension,
          column: visual.pivotColumn,
          metric: primary.field,
          aggregation: primary.aggregation,
          heatmap: visual.heatmap ?? true,
        }}
        format={visual.numberStyle}
        onCell={
          onInspect
            ? (r, c) =>
                onInspect([
                  { field: visual.dimension, value: r, raw: true },
                  { field: visual.pivotColumn!, value: c, raw: true },
                ])
            : undefined
        }
      />
    ) : (
      <p className="visual-empty">
        Escolha uma coluna para a tabela dinâmica em Configurar.
      </p>
    );
  if (visual.type === "table")
    return (
      <div className="visual-table">
        <table className="result-table">
          <thead>
            <tr>
              <th>{visual.dimension}</th>
              {series.map((s) => (
                <th key={s.key}>{s.label}</th>
              ))}
              <th>Linhas</th>
            </tr>
          </thead>
          <tbody>
            {data.map((g) => (
              <tr key={String(g.name)}>
                <td>{label(String(g.name))}</td>
                {series.map((s) => (
                  <td key={s.key}>
                    {formatChartNumber(
                      g[s.key] as number | null,
                      ["count", "distinct"].includes(s.aggregation)
                        ? "Registros"
                        : s.field,
                      visual.numberStyle,
                    )}
                  </td>
                ))}
                <td>{g.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {result.totalGroups > data.length && (
          <p className="visual-caption">
            {data.length} de {result.totalGroups} grupos
          </p>
        )}
      </div>
    );
  if (
    ["donut", "treemap"].includes(visual.type) &&
    (result.negative || !data.some((g) => Number(g.s0) > 0))
  )
    return (
      <div className="visual-empty">
        Este visual exige valores positivos. Use barras para apresentar valores
        negativos ou nulos.
      </div>
    );
  const tip = (
    <Tooltip
      formatter={(v, name) => {
        const s = series.find((s) => s.label === name);
        return formatChartNumber(
          v === null ? null : Number(v),
          s
            ? ["count", "distinct"].includes(s.aggregation)
              ? "Registros"
              : s.field
            : unit,
          visual.numberStyle,
        );
      }}
      labelFormatter={(v) => label(String(v))}
      contentStyle={{
        background: dark ? "#152a39" : "white",
        color: dark ? "#e3edf3" : "#283943",
        border: `1px solid ${grid}`,
        borderRadius: 9,
        fontSize: 12,
      }}
    />
  );
  const legend = visual.legend ? (
    <Legend
      verticalAlign={visual.legendPosition ?? "bottom"}
      iconType="circle"
      wrapperStyle={{ fontSize: 12, padding: 8 }}
    />
  ) : null;
  const horizontal = visual.type === "horizontal";
  const numericalDomain: [number | "auto", number | "auto"] = [
    visual.yMin ?? (result.negative ? "auto" : 0),
    visual.yMax ?? "auto",
  ];
  const fills = [
    primary.color,
    `${primary.color}bb`,
    `${primary.color}88`,
    `${primary.color}dd`,
    `${primary.color}66`,
    `${primary.color}99`,
  ];
  const content =
    visual.type === "radar" ? (
      <RadarChart data={data} outerRadius="65%">
        {visual.grid && <PolarGrid stroke={grid} />}
        <PolarAngleAxis
          dataKey="name"
          tickFormatter={label}
          tick={{ fontSize: 11, fill: ink }}
        />
        <PolarRadiusAxis
          tickFormatter={(v) => format(Number(v))}
          tick={{ fontSize: 9, fill: ink }}
          domain={[0, "auto"]}
        />
        {tip}
        {legend}
        {series.map((s) => (
          <Radar
            key={s.key}
            name={s.label}
            dataKey={s.key}
            stroke={s.color}
            fill={s.color}
            fillOpacity={0.18}
            isAnimationActive={false}
          />
        ))}
      </RadarChart>
    ) : visual.type === "treemap" ? (
      <Treemap
        data={data.filter((g) => Number(g.s0) > 0)}
        dataKey="s0"
        nameKey="name"
        isAnimationActive={false}
        fill={primary.color}
        stroke={dark ? "#182c3b" : "white"}
        onClick={(node) => onFilter?.(String(node.name))}
        content={(node) => (
          <g>
            <rect
              x={node.x}
              y={node.y}
              width={node.width}
              height={node.height}
              fill={fills[node.index % fills.length]}
              stroke={dark ? "#182c3b" : "white"}
              strokeWidth={3}
            />
            {node.depth > 0 && node.width > 55 && node.height > 35 && (
              <text
                x={node.x + 9}
                y={node.y + 22}
                fontSize={11}
                fill={dark ? "#fff" : "#10261c"}
              >
                {String(node.name).slice(
                  0,
                  Math.max(3, Math.floor(node.width / 7) - 2),
                )}
              </text>
            )}
            {node.depth > 0 && node.width > 80 && node.height > 62 && (
              <text
                x={node.x + 9}
                y={node.y + 43}
                fontSize={12}
                fontWeight={600}
                fill={dark ? "#fff" : "#10261c"}
              >
                {format(node.value)}
              </text>
            )}
          </g>
        )}
      >
        {tip}
      </Treemap>
    ) : visual.type === "donut" ? (
      <PieChart>
        {tip}
        {legend}
        <Pie
          data={data}
          dataKey="s0"
          nameKey="name"
          innerRadius={`${visual.donutHole ?? 53}%`}
          outerRadius="76%"
          paddingAngle={2}
          stroke="none"
          isAnimationActive={false}
          label={
            visual.labels
              ? (entry) =>
                  `${label(String(entry.name))}: ${format(Number(entry.value))}`
              : false
          }
          onClick={(g) => onFilter?.(String(g.name))}
        >
          {data.map((g, i) => (
            <Cell
              key={String(g.name)}
              fill={fills[i % fills.length]}
              cursor={onFilter ? "pointer" : "default"}
            />
          ))}
        </Pie>
      </PieChart>
    ) : (
      <ComposedChart
        onClick={(state) => {
          if (onFilter && state.activeLabel != null)
            onFilter(String(state.activeLabel));
        }}
        data={data}
        layout={horizontal ? "vertical" : "horizontal"}
        margin={{
          top: visual.labels ? 24 : 12,
          right: 20,
          left: visual.yTitle ? 18 : 0,
          bottom: visual.xTitle ? 24 : 5,
        }}
      >
        {visual.grid && (
          <CartesianGrid
            strokeDasharray="3 5"
            vertical={horizontal}
            horizontal={!horizontal}
            stroke={grid}
          />
        )}
        <XAxis
          hide={visual.axisX === false}
          type={horizontal ? "number" : "category"}
          dataKey={horizontal ? undefined : "name"}
          domain={horizontal ? numericalDomain : undefined}
          allowDataOverflow={
            horizontal &&
            (visual.yMin !== undefined || visual.yMax !== undefined)
          }
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 11, fill: ink }}
          tickFormatter={horizontal ? (v) => format(v) : label}
          minTickGap={20}
          label={
            visual.xTitle
              ? {
                  value: visual.xTitle,
                  position: "insideBottom",
                  offset: -14,
                  fill: ink,
                  fontSize: 12,
                }
              : undefined
          }
        />
        <YAxis
          hide={visual.axisY === false}
          type={horizontal ? "category" : "number"}
          dataKey={horizontal ? "name" : undefined}
          domain={!horizontal ? numericalDomain : undefined}
          allowDataOverflow={
            !horizontal &&
            (visual.yMin !== undefined || visual.yMax !== undefined)
          }
          axisLine={false}
          tickLine={false}
          width={horizontal ? 105 : 78}
          tick={{ fontSize: 11, fill: ink }}
          tickFormatter={horizontal ? label : (v) => format(v)}
          label={
            visual.yTitle
              ? {
                  value: visual.yTitle,
                  angle: -90,
                  position: "insideLeft",
                  offset: -9,
                  fill: ink,
                  fontSize: 12,
                }
              : undefined
          }
        />
        {tip}
        {legend}
        {visual.target !== undefined && (
          <ReferenceLine
            {...(horizontal ? { x: visual.target } : { y: visual.target })}
            stroke={dark ? "#f1b969" : "#b57222"}
            strokeDasharray="5 4"
            label={{
              value: visual.targetLabel || "Meta",
              fill: ink,
              fontSize: 11,
            }}
          />
        )}
        {series.map((s, index) => {
          const labels = visual.labels ? (
            <LabelList
              dataKey={s.key}
              position={horizontal ? "right" : "top"}
              formatter={(v) =>
                formatChartNumber(
                  Number(v),
                  ["count", "distinct"].includes(s.aggregation)
                    ? "Registros"
                    : s.field,
                  chartWidth < 420
                    ? {
                        kind:
                          visual.numberStyle?.kind === "percent"
                            ? "percent"
                            : "number",
                        decimals: 0,
                        compact: true,
                        prefix: "",
                        suffix: "",
                      }
                    : visual.numberStyle,
                )
              }
              style={{
                fontSize: 11,
                fill: dark ? "#e3eef5" : "#334d5d",
                paintOrder: "stroke",
                stroke: dark ? "#182c3b" : "#ffffff",
                strokeWidth: 3,
                strokeLinejoin: "round",
              }}
            />
          ) : null;
          if (visual.type === "line" || (visual.type === "combo" && index > 0))
            return (
              <Line
                key={s.key}
                type={visual.curve ?? "monotone"}
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={visual.strokeWidth ?? 3}
                dot={data.length < 20}
                isAnimationActive={false}
                connectNulls={false}
              >
                {labels}
              </Line>
            );
          if (visual.type === "area")
            return (
              <Area
                key={s.key}
                type={visual.curve ?? "monotone"}
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                fill={s.color}
                fillOpacity={0.18}
                stackId={visual.stacking === "stacked" ? "stack" : undefined}
                strokeWidth={visual.strokeWidth ?? 2.5}
                isAnimationActive={false}
              >
                {labels}
              </Area>
            );
          return (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={s.color}
              stackId={visual.stacking === "stacked" ? "stack" : undefined}
              maxBarSize={44}
              radius={3}
              isAnimationActive={false}
              cursor={onFilter ? "pointer" : "default"}
            >
              {labels}
            </Bar>
          );
        })}
      </ComposedChart>
    );
  return (
    <>
      <div
        className="visual-chart"
        role="img"
        aria-label={`${visual.title}: ${data.length} grupos, ${series.length} séries`}
      >
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={0}
          initialDimension={{ width: 600, height: 300 }}
          onResize={(width) => setChartWidth(width)}
        >
          {content}
        </ResponsiveContainer>
      </div>
      {(result.totalGroups > data.length || result.omittedSeries > 0) && (
        <p className="visual-caption">
          {data.length} de {result.totalGroups} grupos
          {result.omittedSeries
            ? ` · ${result.omittedSeries} séries adicionais não exibidas`
            : ""}
          {["donut", "treemap"].includes(visual.type)
            ? " · participação somente entre grupos exibidos"
            : ""}
        </p>
      )}
    </>
  );
}
