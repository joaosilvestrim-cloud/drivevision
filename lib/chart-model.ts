import {
  formatValue,
  parseDate,
  parseNumber,
  type DataRow,
  type Source,
} from "./analytics.ts";
import { applyFilters } from "./data-model.ts";
import type { Visual } from "./visual-builder";

export type Aggregation =
  | "sum"
  | "average"
  | "count"
  | "distinct"
  | "min"
  | "max"
  | "median";
export type Measure = {
  id: string;
  field: string;
  aggregation: Aggregation;
  label: string;
  color: string;
};
export type NumberStyle = {
  kind: "auto" | "number" | "currency" | "percent";
  decimals: number;
  compact: boolean;
  prefix: string;
  suffix: string;
};
export const AGGREGATIONS = [
  { value: "sum", label: "Soma" },
  { value: "average", label: "Média" },
  { value: "count", label: "Contagem de linhas" },
  { value: "distinct", label: "Contagem distinta" },
  { value: "min", label: "Mínimo" },
  { value: "max", label: "Máximo" },
  { value: "median", label: "Mediana" },
];
export const SERIES_COLORS = [
  "#0b9b72",
  "#4f73df",
  "#e7a03d",
  "#b271c2",
  "#db6b7c",
  "#38a8b8",
  "#829354",
  "#aa8068",
];
export function measuresFor(visual: Visual, color?: string): Measure[] {
  return visual.measures?.length
    ? visual.measures
    : [
        {
          id: "primary",
          field: visual.metric,
          aggregation: visual.aggregation,
          label: visual.metric,
          color: visual.color || color || SERIES_COLORS[0],
        },
      ];
}
export function calculate(
  rows: DataRow[],
  field: string,
  mode: Aggregation,
): number | null {
  if (mode === "count") return rows.length;
  if (mode === "distinct")
    return new Set(rows.map((r) => r[field]).filter((v) => v?.trim())).size;
  const values = rows
    .map((r) => parseNumber(r[field] ?? ""))
    .filter((v): v is number => v !== null);
  if (!values.length) return null;
  if (mode === "min") return Math.min(...values);
  if (mode === "max") return Math.max(...values);
  if (mode === "median") {
    values.sort((a, b) => a - b);
    const mid = Math.floor(values.length / 2);
    return values.length % 2
      ? values[mid]
      : (values[mid - 1] + values[mid]) / 2;
  }
  const sum = values.reduce((a, b) => a + b, 0);
  return mode === "average" ? sum / values.length : sum;
}
export function formatChartNumber(
  value: number | null,
  metric: string,
  style?: NumberStyle,
): string {
  if (value === null || !Number.isFinite(value)) return "—";
  if (!style || style.kind === "auto")
    return formatValue(value, metric, style?.compact ?? true);
  const text = new Intl.NumberFormat("pt-BR", {
    style:
      style.kind === "currency"
        ? "currency"
        : style.kind === "percent"
          ? "percent"
          : "decimal",
    ...(style.kind === "currency" ? { currency: "BRL" } : {}),
    minimumFractionDigits: style.decimals,
    maximumFractionDigits: style.decimals,
    notation: style.compact ? "compact" : "standard",
  }).format(value);
  return `${style.prefix}${text}${style.suffix}`;
}
export function chartData(
  input: DataRow[],
  source: Source,
  visual: Visual,
  color?: string,
) {
  const rows = applyFilters(input, source, visual.filters),
    measures = measuresFor(visual, color);
  const isDate = source.dates.includes(visual.dimension);
  const groupKey = (r: DataRow) => {
    const raw = r[visual.dimension] ?? "";
    if (isDate) {
      const t = parseDate(raw);
      if (t === null) return "Sem data";
      const date = new Date(t),
        year = date.getUTCFullYear(),
        month = date.getUTCMonth();
      return visual.grain === "year"
        ? `${year}-01-01`
        : visual.grain === "quarter"
          ? `${year}-${String(Math.floor(month / 3) * 3 + 1).padStart(2, "0")}-01`
          : visual.grain === "month"
            ? `${year}-${String(month + 1).padStart(2, "0")}-01`
            : date.toISOString().slice(0, 10);
    }
    return raw || "Sem informação";
  };
  const grouped = new Map<string, DataRow[]>();
  for (const row of rows) {
    const key = groupKey(row);
    const group = grouped.get(key);
    if (group) group.push(row);
    else grouped.set(key, [row]);
  }
  let groups = [...grouped].map(([name, data]) => ({
    name,
    data,
    total: calculate(data, measures[0].field, measures[0].aggregation),
  }));
  groups.sort((a, b) =>
    visual.sort === "name"
      ? isDate
        ? (parseDate(a.name) ?? Infinity) - (parseDate(b.name) ?? Infinity)
        : a.name.localeCompare(b.name, "pt-BR")
      : visual.sort === "asc"
        ? (a.total ?? -Infinity) - (b.total ?? -Infinity)
        : (b.total ?? -Infinity) - (a.total ?? -Infinity),
  );
  const totalGroups = groups.length;
  groups = groups.slice(0, visual.limit === 0 ? 500 : visual.limit);
  const split =
    visual.splitBy &&
    source.columns.includes(visual.splitBy) &&
    !["donut", "kpi"].includes(visual.type)
      ? visual.splitBy
      : undefined;
  const categories = split
    ? [...new Set(rows.map((r) => r[split] || "Sem informação"))].sort((a, b) =>
        a.localeCompare(b, "pt-BR"),
      )
    : [];
  const series = split
    ? categories
        .slice(0, 8)
        .map((name, i) => ({
          key: `s${i}`,
          label: name,
          color: SERIES_COLORS[i],
          field: measures[0].field,
          aggregation: measures[0].aggregation,
        }))
    : measures
        .slice(0, ["donut", "kpi"].includes(visual.type) ? 1 : 4)
        .map((m, i) => ({
          key: `s${i}`,
          label: m.label || m.field,
          color: m.color,
          field: m.field,
          aggregation: m.aggregation,
        }));
  const data = groups.map((g) => {
    const item: Record<string, string | number | null> = {
      name: g.name,
      count: g.data.length,
    };
    for (const s of series) {
      const subset = split
        ? g.data.filter((r) => (r[split] || "Sem informação") === s.label)
        : g.data;
      item[s.key] = calculate(subset, s.field, s.aggregation);
    }
    return item;
  });
  const missing = rows.filter(
    (r) => parseNumber(r[measures[0].field] ?? "") === null,
  ).length;
  return {
    rows,
    data,
    series,
    totalGroups,
    omittedSeries: Math.max(0, categories.length - 8),
    value: calculate(rows, measures[0].field, measures[0].aggregation),
    missing,
    negative: data.some((g) => series.some((s) => Number(g[s.key]) < 0)),
  };
}
