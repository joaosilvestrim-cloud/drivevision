import {
  parseDate,
  parseNumber,
  type DataRow,
  type Source,
  type Config,
} from "./analytics.ts";
import { calculate, type Aggregation } from "./chart-model.ts";
import { profileColumn } from "./data-model.ts";

export type Selection = {
  field: string;
  value: string;
  raw?: boolean;
  grain?: "day" | "month" | "quarter" | "year";
};
export type Bookmark = {
  id: string;
  name: string;
  period: Config["period"];
  filter?: Config["filter"];
  filters?: Config["filters"];
  selections?: Selection[];
};
export type PivotSpec = {
  row: string;
  column: string;
  metric: string;
  aggregation: Aggregation;
  heatmap: boolean;
};
export function groupValue(raw: string, grain?: Selection["grain"]): string {
  if (!grain) return raw || "Sem informação";
  const time = parseDate(raw);
  if (time === null) return "Sem data";
  const date = new Date(time),
    year = date.getUTCFullYear(),
    month = date.getUTCMonth();
  return grain === "year"
    ? `${year}-01-01`
    : grain === "quarter"
      ? `${year}-${String(Math.floor(month / 3) * 3 + 1).padStart(2, "0")}-01`
      : grain === "month"
        ? `${year}-${String(month + 1).padStart(2, "0")}-01`
        : date.toISOString().slice(0, 10);
}
export function applySelections(
  rows: DataRow[],
  selections: Selection[] = [],
): DataRow[] {
  return rows.filter((row) =>
    selections.every(
      (s) =>
        (s.raw
          ? (row[s.field] ?? "")
          : groupValue(row[s.field] ?? "", s.grain)) === s.value,
    ),
  );
}
export function addSelection(
  selections: Selection[] = [],
  next: Selection,
): Selection[] {
  return [...selections.filter((s) => s.field !== next.field), next];
}
export function pivotData(rows: DataRow[], spec: PivotSpec) {
  const rowGroups = new Map<string, DataRow[]>(),
    colGroups = new Map<string, DataRow[]>(),
    cells = new Map<string, DataRow[]>();
  const push = (map: Map<string, DataRow[]>, key: string, row: DataRow) => {
    const arr = map.get(key);
    if (arr) arr.push(row);
    else map.set(key, [row]);
  };
  for (const row of rows) {
    const r = row[spec.row] ?? "",
      c = row[spec.column] ?? "";
    push(rowGroups, r, row);
    push(colGroups, c, row);
    push(cells, JSON.stringify([r, c]), row);
  }
  const allRows = [...rowGroups.keys()].sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
  const allCols = [...colGroups.keys()].sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
  const rowKeys = allRows.slice(0, 100),
    colKeys = allCols.slice(0, 30);
  const aggregate = (data: DataRow[]) =>
    calculate(data, spec.metric, spec.aggregation);
  const values = rowKeys.map((r) =>
    colKeys.map((c) => aggregate(cells.get(JSON.stringify([r, c])) ?? [])),
  );
  const nums = values.flat().filter((v): v is number => v !== null);
  return {
    rowKeys,
    colKeys,
    values,
    rowTotals: rowKeys.map((r) => aggregate(rowGroups.get(r)!)),
    colTotals: colKeys.map((c) => aggregate(colGroups.get(c)!)),
    total: aggregate(rows),
    min: nums.length ? Math.min(...nums) : 0,
    max: nums.length ? Math.max(...nums) : 0,
    omittedRows: allRows.length - rowKeys.length,
    omittedCols: allCols.length - colKeys.length,
  };
}
export function qualityReport(source: Source) {
  const columns = source.columns.map((field) => ({
    field,
    ...profileColumn(source, field),
    type: source.numeric.includes(field)
      ? "Número"
      : source.dates.includes(field)
        ? "Data"
        : "Texto",
  }));
  const unique = new Set(
    source.rows.map((row) =>
      JSON.stringify(source.columns.map((c) => row[c] ?? "")),
    ),
  );
  const empty = columns.reduce((n, c) => n + c.empty, 0),
    invalid = columns.reduce((n, c) => n + c.invalid, 0),
    total = source.rows.length * source.columns.length;
  return {
    columns,
    duplicates: source.rows.length - unique.size,
    empty,
    invalid,
    completeness: total ? (100 * (total - empty)) / total : null,
  };
}
export function insights(
  rows: DataRow[],
  source: Source,
  metric: string,
  dimension: string,
) {
  const total = calculate(rows, metric, "sum");
  const groups = new Map<string, DataRow[]>();
  for (const row of rows) {
    const k = row[dimension] || "Sem informação";
    const g = groups.get(k);
    if (g) g.push(row);
    else groups.set(k, [row]);
  }
  const ranking = [...groups]
    .map(([name, rs]) => ({ name, value: calculate(rs, metric, "sum") }))
    .filter((g): g is { name: string; value: number } => g.value !== null)
    .sort((a, b) => b.value - a.value);
  const values = rows
    .map((r) => parseNumber(r[metric] ?? ""))
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);
  const quantile = (p: number) => {
    const n = (values.length - 1) * p,
      i = Math.floor(n);
    return values[i] + (values[Math.ceil(n)] - values[i]) * (n - i);
  };
  const low = values.length ? quantile(0.25) : 0,
    high = values.length ? quantile(0.75) : 0,
    range = high - low;
  const outliers =
    values.length >= 4
      ? values.filter((v) => v < low - 1.5 * range || v > high + 1.5 * range)
          .length
      : 0;
  const positive = values.every((v) => v >= 0);
  return {
    total,
    ranking: ranking.slice(0, 5),
    groups: ranking.length,
    share:
      positive && total && ranking.length ? ranking[0].value / total : null,
    outliers,
    valid: values.length,
    missing: rows.length - values.length,
  };
}
export type CombineOptions = {
  mode: "append" | "left" | "inner";
  leftKey: string;
  rightKey: string;
  trim: boolean;
};
export function combineSources(
  left: Source,
  right: Source,
  options: CombineOptions,
): { source: Source; matched: number; unmatched: number; note: string } {
  const columns = [...left.columns],
    numeric = [...left.numeric],
    dates = [...left.dates];
  let rows: DataRow[] = [],
    matched = 0,
    unmatched = 0;
  if (options.mode === "append") {
    for (const c of right.columns) if (!columns.includes(c)) columns.push(c);
    for (const c of columns) {
      const both = left.columns.includes(c) && right.columns.includes(c);
      const isNumber = both
        ? left.numeric.includes(c) && right.numeric.includes(c)
        : left.numeric.includes(c) || right.numeric.includes(c);
      const isDate = both
        ? left.dates.includes(c) && right.dates.includes(c)
        : left.dates.includes(c) || right.dates.includes(c);
      if (isNumber && !numeric.includes(c)) numeric.push(c);
      if (!isNumber && numeric.includes(c))
        numeric.splice(numeric.indexOf(c), 1);
      if (isDate && !dates.includes(c)) dates.push(c);
      if (!isDate && dates.includes(c)) dates.splice(dates.indexOf(c), 1);
    }
    rows = [...left.rows, ...right.rows].map((r) =>
      Object.fromEntries(columns.map((c) => [c, r[c] ?? ""])),
    );
  } else {
    if (
      !left.columns.includes(options.leftKey) ||
      !right.columns.includes(options.rightKey)
    )
      throw new Error("Escolha as colunas de ligação nas duas bases.");
    const key = (v: string) => (options.trim ? v.trim() : v);
    const lookup = new Map<string, DataRow>();
    for (const row of right.rows) {
      const k = key(row[options.rightKey] ?? "");
      if (!k.trim()) continue;
      if (lookup.has(k))
        throw new Error(
          `A chave “${k}” se repete na segunda base. Remova duplicados antes de combinar para evitar multiplicar valores.`,
        );
      lookup.set(k, row);
    }
    const mapping = right.columns
      .filter((c) => c !== options.rightKey)
      .map((c) => {
        let target = `${right.name} · ${c}`,
          i = 2;
        while (columns.includes(target))
          target = `${right.name} · ${c} (${i++})`;
        columns.push(target);
        if (right.numeric.includes(c)) numeric.push(target);
        if (right.dates.includes(c)) dates.push(target);
        return { from: c, to: target };
      });
    for (const row of left.rows) {
      const k = key(row[options.leftKey] ?? ""),
        match = k.trim() ? lookup.get(k) : undefined;
      if (match) matched++;
      else unmatched++;
      if (match || options.mode === "left")
        rows.push({
          ...row,
          ...Object.fromEntries(
            mapping.map((m) => [m.to, match?.[m.from] ?? ""]),
          ),
        });
    }
  }
  if (rows.length > 20000)
    throw new Error(
      "O resultado excede 20 mil registros. Reduza as bases antes de combinar.",
    );
  if (columns.length > 60)
    throw new Error(
      "O resultado excede 60 colunas. Reduza as bases antes de combinar.",
    );
  if (!rows.length)
    throw new Error(
      "A combinação não encontrou registros. Confira as chaves ou mantenha todas as linhas da primeira base.",
    );
  return {
    source: {
      id: "combined-preview",
      name: `${left.name} + ${right.name}`,
      columns,
      numeric,
      dates,
      rows,
      demo: false,
      createdAt: new Date().toISOString(),
    },
    matched,
    unmatched,
    note:
      options.mode === "append"
        ? "Colunas alinhadas pelo nome exato. Campos ausentes ficam vazios; tipos incompatíveis viram texto."
        : "Chaves comparadas como texto, diferenciando maiúsculas. Vazios nunca se relacionam. A segunda base precisa ter chaves únicas.",
  };
}
