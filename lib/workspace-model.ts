import { prepareSource, type DataStep, type FilterSet } from "./data-model.ts";
import { initialVisuals } from "./visual-builder.ts";
import type { Config, Source } from "./analytics.ts";

export function applyModel(
  original: Source,
  config: Config,
  dataSteps: DataStep[],
): Config {
  const before = prepareSource(original, config.dataSteps),
    after = prepareSource(original, dataSteps);
  if (after.error) throw new Error(after.error);
  const field = (name: string) => {
    const origin = Object.keys(before.aliases).find(
      (key) => before.aliases[key] === name,
    );
    return origin ? (after.aliases[origin] ?? name) : name;
  };
  const filters = (value?: FilterSet) =>
    value
      ? {
          ...value,
          rules: value.rules.map((r) => ({ ...r, field: field(r.field) })),
        }
      : undefined;
  return {
    ...config,
    dataSteps,
    metric: field(config.metric),
    dimension: field(config.dimension),
    filter: config.filter
      ? { ...config.filter, field: field(config.filter.field) }
      : undefined,
    filters: filters(config.filters),
    selections: config.selections?.map((s) => ({
      ...s,
      field: field(s.field),
    })),
    bookmarks: config.bookmarks?.map((b) => ({
      ...b,
      filter: b.filter
        ? { ...b.filter, field: field(b.filter.field) }
        : undefined,
      filters: filters(b.filters),
      selections: b.selections?.map((s) => ({ ...s, field: field(s.field) })),
    })),
    visuals: initialVisuals(before.source, config).map((v) => ({
      ...v,
      metric: field(v.metric),
      dimension: field(v.dimension),
      pivotColumn: v.pivotColumn ? field(v.pivotColumn) : undefined,
      splitBy: v.splitBy ? field(v.splitBy) : undefined,
      filters: filters(v.filters),
      measures: v.measures?.map((m) => ({ ...m, field: field(m.field) })),
    })),
  };
}
