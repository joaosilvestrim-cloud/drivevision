import { displayLocale } from "./display-locale.ts";
import type { Selection, Bookmark } from "./exploration";
import type { Visual, BoardAppearance } from "./visual-builder";
import type { DataStep, FilterSet } from "./data-model";
export type DataRow = Record<string, string>;
export type Source = {
  recipe?: import("./source-lifecycle").SourceRecipe;
  lastLoad?: import("./source-lifecycle").LoadOptions & { at: string; file: string; summary: import("./source-lifecycle").LoadSummary };
  importNotes?: {
    file: string;
    sheet: string;
    header: number;
    end: number;
    details: string;
  };
  id: string;
  name: string;
  columns: string[];
  numeric: string[];
  dates: string[];
  rows: DataRow[];
  demo: boolean;
  createdAt: string;
};
export type Config = {
  selections?: Selection[];
  bookmarks?: Bookmark[];
  dataSteps?: DataStep[];
  filters?: FilterSet;
  visuals?: Visual[];
  appearance?: BoardAppearance;
  filter?: { field: string; value: string };
  title: string;
  metric: string;
  dimension: string;
  chart: "area" | "bar";
  aggregation: "sum" | "average" | "count";
  period: "all" | "30" | "90";
};
export type SavedDashboard = {
  folder?: string;
  starred?: boolean;
  id: string;
  sourceId: string;
  config: Config;
  updatedAt: string;
};
export const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

export function parseNumber(raw: string): number | null {
  let s = raw
    .trim()
    .replace(/^R\$\s*/, "")
    .replace(/\s/g, "");
  if (!s) return null;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s))
    s = s.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(,\d{3})+\.\d+$/.test(s)) s = s.replace(/,/g, "");
  else if (/^-?\d+(,\d+)?$/.test(s)) s = s.replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const value = Number(s);
  return Number.isFinite(value) ? value : null;
}

export function parseDate(raw: string): number | null {
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!iso && !br) return null;
  const [y, m, d] = iso
    ? [+iso[1], +iso[2], +iso[3]]
    : [+br![3], +br![2], +br![1]];
  const time = Date.UTC(y, m - 1, d),
    date = new Date(time);
  return date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
    ? time
    : null;
}

export function parseCSV(text: string, name: string, id: string): Source {
  if (new TextEncoder().encode(text).length > 2_000_000)
    throw new Error("O limite é de 2 MB por arquivo.");
  text = text.replace(/^\uFEFF/, "");
  const first = text.split(/\r?\n/)[0] || "";
  let inQuote = false;
  const counts: Record<string, number> = { ";": 0, ",": 0, "\t": 0 };
  for (let i = 0; i < first.length; i++) {
    if (first[i] === '"') {
      if (inQuote && first[i + 1] === '"') i++;
      else inQuote = !inQuote;
    } else if (!inQuote && first[i] in counts) counts[first[i]]++;
  }
  const sep = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  const records: string[][] = [];
  let cells: string[] = [],
    value = "",
    quoted = false,
    ended = false;
  function endCell() {
    cells.push(value.trim());
    value = "";
    ended = false;
  }
  function endRow() {
    endCell();
    if (cells.some(Boolean)) records.push(cells);
    cells = [];
    if (records.length > 20001)
      throw new Error("O limite é de 20 mil linhas por arquivo.");
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          value += '"';
          i++;
        } else {
          quoted = false;
          ended = true;
        }
      } else value += ch;
    } else if (ch === '"') {
      if (value.trim() || ended)
        throw new Error("Há aspas fora de posição no CSV.");
      quoted = true;
    } else if (ch === sep) endCell();
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      endRow();
    } else {
      if (ended && ch.trim())
        throw new Error("Confira o separador e as aspas do CSV.");
      value += ch;
    }
  }
  if (quoted) throw new Error("Uma célula contém aspas sem fechamento.");
  if (value || cells.length || ended) endRow();
  if (records.length < 2)
    throw new Error(
      "Inclua os nomes das colunas e pelo menos uma linha de dados.",
    );
  const columns = records.shift()!;
  if (columns.some((c) => !c))
    throw new Error("Todas as colunas precisam ter um nome.");
  if (new Set(columns.map(normalize)).size !== columns.length)
    throw new Error("Os nomes das colunas precisam ser únicos.");
  if (columns.length > 60) throw new Error("Use até 60 colunas nesta versão.");
  const rows = records.map((record, i) => {
    if (record.length !== columns.length)
      throw new Error(
        `A linha ${i + 2} tem ${record.length} campos; eram esperados ${columns.length}.`,
      );
    return Object.fromEntries(columns.map((c, j) => [c, record[j]]));
  });
  const numeric = columns.filter((c) => {
    const values = rows.map((r) => r[c]).filter(Boolean);
    return values.length > 0 && values.every((v) => parseNumber(v) !== null);
  });
  const dates = columns.filter((c) => {
    const values = rows.map((r) => r[c]).filter(Boolean);
    return values.length > 0 && values.every((v) => parseDate(v) !== null);
  });
  return {
    id,
    name: name.replace(/\.csv$/i, ""),
    columns,
    numeric,
    dates,
    rows,
    demo: false,
    createdAt: new Date().toISOString(),
  };
}

const regions = ["Sudeste", "Sul", "Nordeste", "Centro-Oeste", "Norte"];
const sellers = [
  "Ana Costa",
  "Bruno Lima",
  "Carla Souza",
  "Diego Alves",
  "Elisa Rocha",
];
const products = ["Plano Business", "Plano Pro", "Consultoria", "Treinamento"];
export const DEMO: Source = {
  id: "demo-vendas",
  name: "Vendas · base de exemplo",
  columns: ["Data", "Região", "Vendedor", "Produto", "Receita", "Custo"],
  numeric: ["Receita", "Custo"],
  dates: ["Data"],
  demo: true,
  createdAt: "2026-09-25T12:00:00Z",
  rows: Array.from({ length: 360 }, (_, i) => {
    const revenue = +(320 + ((i * 137) % 1350) + (i % 9) * 33.5).toFixed(2);
    return {
      Data: new Date(Date.UTC(2026, 6, 1 + Math.floor(i / 4)))
        .toISOString()
        .slice(0, 10),
      Região: regions[((i * 7) % 13) % 5],
      Vendedor: sellers[i % 5],
      Produto: products[i % 4],
      Receita: String(revenue),
      Custo: String(+(revenue * (0.4 + (i % 3) * 0.1)).toFixed(2)),
    };
  }),
};
export function defaultConfig(source: Source): Config {
  return {
    title: source.demo ? "Visão geral comercial" : `Análise de ${source.name}`,
    metric:
      source.numeric.find((c) =>
        /receita|faturamento|valor|total/.test(normalize(c)),
      ) ||
      source.numeric[0] ||
      source.columns[0],
    dimension:
      source.columns.find(
        (c) => !source.numeric.includes(c) && !source.dates.includes(c),
      ) || source.columns[0],
    chart: "area",
    aggregation: source.numeric.length ? "sum" : "count",
    period: "all",
  };
}
export function filteredRows(source: Source, config: Config) {
  if (config.period === "all" || !source.dates.length) return source.rows;
  const key = source.dates[0],
    times = source.rows
      .map((r) => parseDate(r[key]))
      .filter((v): v is number => v !== null);
  if (!times.length) return [];
  const max = Math.max(...times),
    min = max - (Number(config.period) - 1) * 86400000;
  return source.rows.filter((r) => {
    const t = parseDate(r[key]);
    return t !== null && t >= min && t <= max;
  });
}
export function aggregate(
  rows: DataRow[],
  metric: string,
  dimension: string,
  mode: Config["aggregation"],
) {
  const groups = new Map<
    string,
    { total: number; valid: number; count: number }
  >();
  for (const row of rows) {
    const key = row[dimension] || "Sem informação",
      g = groups.get(key) || { total: 0, valid: 0, count: 0 },
      n = parseNumber(row[metric]);
    g.count++;
    if (n !== null) {
      g.total += n;
      g.valid++;
    }
    groups.set(key, g);
  }
  return Array.from(groups, ([name, g]) => ({
    name,
    value:
      mode === "count"
        ? g.count
        : mode === "average"
          ? g.valid
            ? g.total / g.valid
            : 0
          : g.total,
    count: g.count,
  }));
}
export function analytics(source: Source, config: Config) {
  const rows = filteredRows(source, config),
    values = rows
      .map((r) => parseNumber(r[config.metric]))
      .filter((n): n is number => n !== null),
    total = values.reduce((a, b) => a + b, 0),
    average = values.length ? total / values.length : 0;
  const ranked = aggregate(
    rows,
    config.metric,
    config.dimension,
    config.aggregation,
  ).sort((a, b) => b.value - a.value);
  const timeKey = source.dates[0];
  const series = timeKey
    ? aggregate(
        rows.filter((r) => parseDate(r[timeKey]) !== null),
        config.metric,
        timeKey,
        config.aggregation,
      ).sort((a, b) => parseDate(a.name)! - parseDate(b.name)!)
    : ranked;
  return {
    rows,
    total,
    average,
    valid: values.length,
    missing: rows.length - values.length,
    ranked,
    series: config.chart === "bar" ? ranked.slice(0, 12) : series,
    timeKey,
  };
}
export function isCurrency(metric: string) {
  return /receita|faturamento|valor|custo|preco|lucro/.test(normalize(metric));
}
export function formatValue(value: number, metric: string, compact = false) {
  const abbreviated = compact && Math.abs(value) >= 10000;
  return new Intl.NumberFormat(displayLocale(), {
    ...(isCurrency(metric) ? { style: "currency", currency: "BRL" } : {}),
    maximumFractionDigits: abbreviated ? 1 : 2,
    notation: abbreviated ? "compact" : "standard",
  }).format(value);
}
export function toCSV(source: Source, rows = source.rows) {
  const cell = (s: string) => {
    const safe =
      /^[=+\-@\t\r]/.test(s) && parseNumber(s) === null ? `'${s}` : s;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  return (
    "\uFEFF" +
    [source.columns, ...rows.map((r) => source.columns.map((c) => r[c]))]
      .map((row) => row.map(cell).join(";"))
      .join("\r\n")
  );
}

export function interpretRequest(
  text: string,
  source: Source,
  config: Config,
): { config: Config; message: string; changed: boolean } {
  const q = normalize(text).trim(),
    next = { ...config };
  const changes: string[] = [];
  const requestedGroup = q.match(/\bpor\s+(.+)/)?.[1];
  if (
    requestedGroup &&
    !source.columns.some((c) => requestedGroup.includes(normalize(c)))
  )
    return {
      config,
      message: `Não identifiquei a coluna pedida. As colunas disponíveis são: ${source.columns.join(", ")}.`,
      changed: false,
    };
  if (/margem|conversao|ano anterior|previsao|meta|comparar|compare/.test(q))
    return {
      config,
      message:
        "Esse pedido precisa de uma regra ou de dados adicionais. Nesta prévia, posso somar valores, calcular médias, contar registros, agrupar por uma coluna e trocar o tipo de gráfico. A IA generativa ainda não está conectada.",
      changed: false,
    };
  for (const c of source.numeric)
    if (q.includes(normalize(c))) {
      next.metric = c;
      changes.push(`indicador ${c}`);
      break;
    }
  if (/ticket|media|medio/.test(q)) {
    next.aggregation = "average";
    changes.push("média dos valores preenchidos");
  } else if (/contagem|conte|quantos|quantidade de registros/.test(q)) {
    next.aggregation = "count";
    changes.push("contagem de registros");
  } else if (/soma|total|receita|faturamento|vendas/.test(q)) {
    next.aggregation = "sum";
    changes.push("soma dos valores");
  }
  const dimension = source.columns.find(
    (c) => !source.numeric.includes(c) && q.includes(normalize(c)),
  );
  if (dimension) {
    next.dimension = dimension;
    next.chart = "bar";
    changes.push(`agrupamento por ${dimension}`);
  }
  if (/barras/.test(q)) {
    next.chart = "bar";
    changes.push("gráfico de barras");
  }
  if (/linha|evolucao|tendencia/.test(q)) {
    next.chart = "area";
    changes.push("gráfico de evolução");
  }
  if (/30 dias|90 dias/.test(q)) {
    if (!source.dates.length)
      return {
        config,
        message:
          "Essa base não tem uma coluna de data reconhecida. Use AAAA-MM-DD ou DD/MM/AAAA para filtrar o período.",
        changed: false,
      };
    next.period = q.includes("30 dias") ? "30" : "90";
    changes.push(`últimos ${next.period} dias da base`);
  }
  if (/todo o periodo|todos os dados|limpar filtro/.test(q)) {
    next.period = "all";
    changes.push("todo o período");
  }
  if (!changes.length)
    return {
      config,
      message: `Ainda não consigo interpretar esse pedido. Experimente “Mostre ${source.numeric[0]} por ${config.dimension}”, “Calcule a média” ou “Mude para barras”. Este assistente usa comandos guiados, sem IA generativa conectada.`,
      changed: false,
    };
  return {
    config: next,
    message: `Análise atualizada: ${[...new Set(changes)].join(", ")}. Os indicadores foram recalculados com os registros da base selecionada.`,
    changed: true,
  };
}
