import assert from "node:assert/strict";
import { DEMO, defaultConfig } from "../lib/analytics.ts";
import {
  duplicateDashboard,
  selectDashboards,
  dashboardFolder,
} from "../lib/dashboard-library.ts";
import { makeVisual } from "../lib/visual-builder.ts";
import { chartData } from "../lib/chart-model.ts";
import { resizedVisual, gaugeProgress } from "../lib/layout.ts";
import { workspaceSchema } from "../server/validation.ts";
const config = defaultConfig(DEMO);
const original = {
  id: "a",
  sourceId: DEMO.id,
  config: {
    ...config,
    title: "Análise comercial",
    visuals: [makeVisual("bar", DEMO, config, "v")],
  },
  folder: "Diretoria",
  starred: true,
  updatedAt: "2026-09-25T12:00:00Z",
};
const copied = duplicateDashboard(original, "b", "2026-09-25T13:00:00Z");
copied.config.visuals[0].title = "Independente";
assert.notEqual(original.config.visuals[0].title, "Independente");
assert.equal(copied.starred, false);
assert.equal(dashboardFolder({ ...original, folder: "" }), "Sem pasta");
assert.deepEqual(
  selectDashboards(
    [copied, original],
    "analise",
    "Diretoria",
    true,
    "recent",
  ).map((d) => d.id),
  ["a"],
);
assert.deepEqual(
  selectDashboards([original, copied], "", "", false, "recent").map(
    (d) => d.id,
  ),
  ["b", "a"],
);
assert.equal(
  selectDashboards([original], "", "Financeiro", false, "recent").length,
  0,
);
const moreThan100 = {
  version: 1,
  sources: [],
  dashboards: Array.from({ length: 125 }, (_, i) => ({
    ...original,
    id: `dash-${i}`,
  })),
};
assert.equal(workspaceSchema.parse(moreThan100).dashboards.length, 125);
assert.equal(
  workspaceSchema.parse(moreThan100).dashboards[0].folder,
  "Diretoria",
);
assert.equal(
  workspaceSchema.safeParse({
    ...moreThan100,
    dashboards: [original, original],
  }).success,
  false,
);
assert.equal(
  workspaceSchema.safeParse({
    ...moreThan100,
    dashboards: [{ ...original, folder: "a".repeat(81) }],
  }).success,
  false,
);
const v = original.config.visuals[0];
assert.deepEqual(resizedVisual(v, 500, 120, 1200), { span: 12, height: 440 });
assert.deepEqual(resizedVisual(v, -1000, -1000, 1200), {
  span: 4,
  height: 280,
});
assert.equal(resizedVisual(v, 0, 9000, 1200).height, 900);
assert.deepEqual(gaugeProgress(150, 100), { ratio: 1.5, arc: 1 });
assert.equal(gaugeProgress(10, 0), null);
assert.equal(gaugeProgress(-5, 100), null);
assert.equal(gaugeProgress(null, 100), null);
for (const type of ["treemap", "funnel", "gauge"]) {
  const visual = {
    ...makeVisual(type, DEMO, config, type),
    splitBy: DEMO.columns[1],
    measures: [
      {
        id: "a",
        field: config.metric,
        aggregation: "sum",
        label: "A",
        color: "#123456",
      },
      {
        id: "b",
        field: config.metric,
        aggregation: "count",
        label: "B",
        color: "#223456",
      },
    ],
  };
  const result = chartData(DEMO.rows, DEMO, visual);
  assert.equal(result.series.length, 1);
  assert.equal(result.omittedSeries, 0);
}
console.log(
  "PASS desktop: independent duplication, folder/search/favorites, ordering, 125 dashboards and metadata, duplicate-ID rejection, resize bounds, target overflow and invalid targets, single-measure visuals",
);
