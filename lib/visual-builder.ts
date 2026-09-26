import { applySelections } from "./exploration.ts";
import {
  aggregate,
  filteredRows,
  normalize,
  parseDate,
  parseNumber,
  interpretRequest,
  type Config,
  type Source,
  type DataRow,
} from "./analytics.ts";
import { applyFilters, type FilterSet } from "./data-model.ts";
import type { Measure, NumberStyle } from "./chart-model";

export type VisualType =
  | "kpi"
  | "line"
  | "area"
  | "bar"
  | "horizontal"
  | "donut"
  | "table"
  | "text"
  | "combo"
  | "pivot"
  | "treemap"
  | "radar"
  | "funnel"
  | "gauge";
export type Visual = {
  pivotColumn?: string;
  heatmap?: boolean;
  id: string;
  type: VisualType;
  title: string;
  metric: string;
  dimension: string;
  aggregation: Config["aggregation"];
  span: 4 | 6 | 8 | 12;
  height: number;
  color?: string;
  grid: boolean;
  legend: boolean;
  limit: number;
  sort: "desc" | "asc" | "name";
  grain: "day" | "month" | "quarter" | "year";
  text: string;
  measures?: Measure[];
  splitBy?: string;
  filters?: FilterSet;
  numberStyle?: NumberStyle;
  stacking?: "grouped" | "stacked";
  labels?: boolean;
  axisX?: boolean;
  axisY?: boolean;
  xTitle?: string;
  yTitle?: string;
  yMin?: number;
  yMax?: number;
  legendPosition?: "top" | "bottom";
  curve?: "linear" | "monotone" | "step";
  strokeWidth?: number;
  donutHole?: number;
  target?: number;
  targetLabel?: string;
  subtitle?: string;
};
export type BoardAppearance = {
  accent: string;
  mode: "light" | "dark";
  spacing: "comfortable" | "compact";
  rounded: boolean;
};
export const DEFAULT_APPEARANCE: BoardAppearance = {
  accent: "#0b9b72",
  mode: "light",
  spacing: "comfortable",
  rounded: true,
};
export const PALETTES = [
  { name: "Esmeralda", color: "#0b9b72" },
  { name: "Oceano", color: "#2563eb" },
  { name: "Violeta", color: "#8056da" },
  { name: "Âmbar", color: "#ca7415" },
  { name: "Rosa", color: "#d94c81" },
  { name: "Grafite", color: "#596578" },
];
export const VISUAL_TYPES: {
  type: VisualType;
  label: string;
  description: string;
}[] = [
  {
    type: "treemap",
    label: "Mapa de árvore",
    description: "Participação em blocos proporcionais",
  },
  {
    type: "radar",
    label: "Radar",
    description: "Compare perfis entre categorias",
  },
  {
    type: "funnel",
    label: "Funil comparativo",
    description: "Volumes por etapa ou categoria",
  },
  {
    type: "gauge",
    label: "Medidor de meta",
    description: "Acompanhe o realizado e a meta",
  },
  { type: "kpi", label: "Indicador", description: "Um número que importa" },
  { type: "line", label: "Linhas", description: "Evolução e tendências" },
  { type: "area", label: "Área", description: "Volume ao longo do tempo" },
  { type: "bar", label: "Colunas", description: "Compare categorias" },
  { type: "horizontal", label: "Barras", description: "Rankings com clareza" },
  { type: "donut", label: "Rosca", description: "Participação de cada grupo" },
  {
    type: "combo",
    label: "Combinado",
    description: "Colunas e linhas no mesmo gráfico",
  },
  {
    type: "pivot",
    label: "Tabela dinâmica",
    description: "Cruze dimensões com totais e mapa de calor",
  },
  { type: "table", label: "Tabela", description: "Detalhe seus resultados" },
  { type: "text", label: "Texto", description: "Contexto e observações" },
];
export function makeVisual(
  type: VisualType,
  source: Source,
  config: Config,
  id: string,
): Visual {
  const dimension =
    type === "line" || type === "area"
      ? source.dates[0] || config.dimension
      : config.dimension;
  return {
    id,
    type,
    title:
      type === "text"
        ? "Sobre esta análise"
        : type === "kpi"
          ? config.metric
          : `${config.metric} por ${dimension}`,
    metric: config.metric,
    dimension,
    aggregation: config.aggregation,
    span: type === "kpi" ? 4 : type === "line" || type === "area" ? 8 : 6,
    height: type === "kpi" ? 180 : 320,
    grid: true,
    legend: true,
    limit: 8,
    sort: source.dates.includes(dimension) ? "name" : "desc",
    grain: source.dates.includes(dimension) ? "month" : "day",
    text: "Adicione aqui o contexto, as conclusões ou as próximas ações para sua equipe.",
  };
}
export function initialVisuals(source: Source, config: Config): Visual[] {
  if (config.visuals) return config.visuals;
  if (!source.numeric.length)
    return [
      {
        ...makeVisual(
          "kpi",
          source,
          { ...config, aggregation: "count" },
          "initial-count",
        ),
        title: "Registros analisados",
      },
      {
        ...makeVisual(
          "bar",
          source,
          { ...config, aggregation: "count" },
          "initial-distribution",
        ),
        title: `Registros por ${config.dimension}`,
        span: 8,
      },
      {
        ...makeVisual(
          "table",
          source,
          { ...config, aggregation: "count" },
          "initial-table",
        ),
        title: `Detalhamento por ${config.dimension}`,
        span: 12,
      },
    ];
  const total = makeVisual("kpi", source, config, "initial-total");
  const count = {
    ...makeVisual("kpi", source, config, "initial-count"),
    title: "Registros analisados",
    aggregation: "count" as const,
  };
  const average = {
    ...makeVisual("kpi", source, config, "initial-average"),
    title: `Média de ${config.metric}`,
    aggregation: "average" as const,
  };
  const area = makeVisual("area", source, config, "initial-evolution");
  if (source.dates.includes(area.dimension))
    area.title = `Evolução de ${config.metric}`;
  const donut = {
    ...makeVisual("donut", source, config, "initial-share"),
    title: `Participação por ${config.dimension}`,
    span: 4 as const,
  };
  return [total, count, average, area, donut];
}
export function boardRows(source: Source, config: Config) {
  const rows = applyFilters(
    filteredRows(source, config),
    source,
    config.filters,
  );
  const selectedRows = applySelections(rows, config.selections);
  return config.filter
    ? selectedRows.filter(
        (r) =>
          (r[config.filter!.field] || "Sem informação") ===
          config.filter!.value,
      )
    : selectedRows;
}
export function visualData(rows: DataRow[], source: Source, visual: Visual) {
  const isDate = source.dates.includes(visual.dimension);
  const input =
    isDate && visual.grain === "month"
      ? rows.map((r) => {
          const t = parseDate(r[visual.dimension]);
          return {
            ...r,
            [visual.dimension]:
              t === null
                ? "Sem data"
                : new Date(t).toISOString().slice(0, 7) + "-01",
          };
        })
      : rows;
  const grouped = aggregate(
    input,
    visual.metric,
    visual.dimension,
    visual.aggregation,
  );
  grouped.sort((a, b) =>
    visual.sort === "name"
      ? isDate
        ? (parseDate(a.name) ?? Infinity) - (parseDate(b.name) ?? Infinity)
        : a.name.localeCompare(b.name, "pt-BR")
      : visual.sort === "asc"
        ? a.value - b.value
        : b.value - a.value,
  );
  const shown =
    (visual.type === "area" || visual.type === "line") && isDate
      ? grouped
      : grouped.slice(0, visual.limit);
  const nums = rows
    .map((r) => parseNumber(r[visual.metric]))
    .filter((v): v is number => v !== null);
  const total = nums.reduce((a, b) => a + b, 0);
  const value =
    visual.aggregation === "count"
      ? rows.length
      : visual.aggregation === "average"
        ? nums.length
          ? total / nums.length
          : 0
        : total;
  return {
    groups: shown,
    totalGroups: grouped.length,
    value,
    missing: rows.length - nums.length,
    negative: shown.some((g) => g.value < 0),
  };
}
export function reorderVisuals(visuals: Visual[], from: string, to: string) {
  const a = visuals.findIndex((v) => v.id === from),
    b = visuals.findIndex((v) => v.id === to);
  if (a < 0 || b < 0 || a === b) return visuals;
  const next = [...visuals];
  const [item] = next.splice(a, 1);
  next.splice(b, 0, item);
  return next;
}
export function requestVisual(
  text: string,
  source: Source,
  config: Config,
  id: string,
): { config: Config; changed: boolean; message: string; selected?: string } {
  const q = normalize(text),
    adding = /adicion|inclu|insir|crie|criar/.test(q);
  const namedType: VisualType | null = /rosca|pizza/.test(q)
    ? "donut"
    : /tabela/.test(q)
      ? "table"
      : /indicador|cartao|kpi/.test(q)
        ? "kpi"
        : /horizontal|ranking/.test(q)
          ? "horizontal"
          : /coluna|barra/.test(q)
            ? "bar"
            : /area/.test(q)
              ? "area"
              : /linha|evolucao/.test(q)
                ? "line"
                : /texto|observacao/.test(q)
                  ? "text"
                  : null;
  if (adding && namedType) {
    if (initialVisuals(source, config).length >= 24)
      return {
        config,
        changed: false,
        message: "O painel já tem 24 blocos. Remova um para adicionar outro.",
      };
    if (/margem|conversao|previsao|meta/.test(q))
      return {
        config,
        changed: false,
        message:
          "Esse indicador precisa de uma regra de negócio. Selecione um campo numérico disponível no editor.",
      };
    const requested = q.match(/\bpor\s+(.+)/)?.[1];
    const dimension = source.columns.find((c) =>
      requested?.includes(normalize(c)),
    );
    if (requested && !dimension)
      return {
        config,
        changed: false,
        message: `Não encontrei o agrupamento. Use uma destas colunas: ${source.columns.join(", ")}.`,
      };
    const metric =
      source.numeric.find((c) => q.includes(normalize(c))) || config.metric;
    const aggregation = /media|medio/.test(q)
      ? "average"
      : /contagem|registros/.test(q)
        ? "count"
        : config.aggregation;
    const visual = makeVisual(
      namedType,
      source,
      {
        ...config,
        metric,
        dimension: dimension || config.dimension,
        aggregation,
      },
      id,
    );
    if (dimension) visual.dimension = dimension;
    visual.title =
      namedType === "kpi"
        ? `${aggregation === "average" ? "Média de " : ""}${metric}`
        : `${metric} por ${visual.dimension}`;
    return {
      config: {
        ...config,
        visuals: [...initialVisuals(source, config), visual],
      },
      changed: true,
      message: `Adicionei ${VISUAL_TYPES.find((t) => t.type === namedType)?.label.toLowerCase()} ao painel. Selecione o bloco para ajustar seus dados, cores e tamanho.`,
      selected: id,
    };
  }
  const result = interpretRequest(text, source, config);
  if (result.changed) {
    const visuals = initialVisuals(source, config).map<Visual>((v) => {
      if (v.type === "text") return v;
      const next = { ...v };
      if (result.config.metric !== config.metric)
        next.metric = result.config.metric;
      if (result.config.dimension !== config.dimension)
        next.dimension = result.config.dimension;
      if (result.config.aggregation !== config.aggregation && v.type !== "kpi")
        next.aggregation = result.config.aggregation;
      if (
        result.config.chart !== config.chart &&
        ["line", "area", "bar"].includes(v.type)
      )
        next.type = result.config.chart;
      if (next.measures)
        next.measures = next.measures.map((measure, index) =>
          index === 0
            ? {
                ...measure,
                ...(result.config.metric !== config.metric
                  ? { field: result.config.metric, label: result.config.metric }
                  : {}),
                ...(result.config.aggregation !== config.aggregation &&
                v.type !== "kpi"
                  ? { aggregation: result.config.aggregation }
                  : {}),
              }
            : measure,
        );
      if (next.metric !== v.metric || next.dimension !== v.dimension)
        next.title =
          v.type === "kpi"
            ? `${next.aggregation === "average" ? "Média de " : ""}${next.metric}`
            : `${next.metric} por ${next.dimension}`;
      return next;
    });
    return { ...result, config: { ...result.config, visuals } };
  }
  return {
    ...result,
    message:
      "Experimente “Adicione uma rosca de Receita por Região” ou use Adicionar visual. Os comandos desta prévia são guiados; a IA generativa ainda não está conectada.",
  };
}
