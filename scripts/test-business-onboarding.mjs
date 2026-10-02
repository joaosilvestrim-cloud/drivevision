import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseCSV } from "../lib/analytics.ts";
import {
  buildBusinessDashboard,
  suggestMapping,
  inspectBusinessSource,
  salesTemplate,
  SEGMENTS,
  OBJECTIVES,
  ROLES,
  KNOWLEDGE_LEVELS,
} from "../lib/business-onboarding.ts";
import { chartData } from "../lib/chart-model.ts";
import { workspaceSchema } from "../server/validation.ts";
import { planLoad } from "../lib/source-lifecycle.ts";
const profile = {
  segment: "commerce",
  operation: "Loja e e-commerce",
  objective: "sales",
};
const source = parseCSV(
  salesTemplate(profile, true),
  "vendas.csv",
  "sales-test",
);
const mapping = suggestMapping(source);
assert.equal(mapping.order, "ID Venda");
assert.equal(mapping.value, "Valor");
const config = buildBusinessDashboard(source, profile, mapping, true);
const kpis = config.visuals
  .filter((v) => v.type === "kpi")
  .map((v) => chartData(source.rows, source, v).value);
assert.deepEqual(kpis, [450, 2, 2]);
assert.equal(config.visuals.find((v) => v.type === "line").grain, "day");
assert.equal(config.visuals.find((v) => v.type === "line").limit, 0);
assert.ok(!config.visuals.some((v) => /ticket|lucro|margem/i.test(v.title)));
assert.throws(() => buildBusinessDashboard(source, profile, mapping, false));
console.log(
  "PASS real preview totals, multi-item order counted once, no fake ticket/profit, explicit confirmation.",
);
const unknown = parseCSV(
  "Numero;Quantidade;Preco unitario\n123;2;50\n124;3;10",
  "desconhecida.csv",
  "unknown",
);
assert.equal(suggestMapping(unknown).value, undefined);
const generic = buildBusinessDashboard(unknown, profile, {}, true);
assert.equal(chartData(unknown.rows, unknown, generic.visuals[0]).value, 2);
assert.equal(generic.visuals[0].numberStyle.kind, "number");
const ambiguous = { ...source, columns: [...source.columns, "Receita"] };
assert.equal(suggestMapping(ambiguous).value, undefined);
console.log(
  "PASS no guessing numeric IDs, unit prices or ambiguous revenue fields.",
);
const bad = { ...source, rows: [{ ...source.rows[0], Valor: "" }] };
assert.equal(inspectBusinessSource(bad, mapping).total, null);
assert.throws(() => buildBusinessDashboard(bad, profile, mapping, true));
assert.throws(() =>
  buildBusinessDashboard(
    source,
    profile,
    { value: "Valor", order: "Valor" },
    true,
  ),
);
assert.throws(() =>
  buildBusinessDashboard(source, profile, { value: "missing" }, true),
);
const invalidDate = {
  ...source,
  rows: [{ ...source.rows[0], Data: "31/02/2026" }],
};
assert.throws(() =>
  buildBusinessDashboard(invalidDate, profile, mapping, true),
);
const negatives = { ...source, rows: [{ ...source.rows[0], Valor: "-20" }] };
assert.equal(inspectBusinessSource(negatives, mapping).negative, 1);
assert.equal(
  chartData(
    negatives.rows,
    negatives,
    buildBusinessDashboard(negatives, profile, mapping, true).visuals[0],
  ).value,
  -20,
);
console.log(
  "PASS invalid/missing amounts and dates blocked, duplicate mappings rejected, refunds preserved.",
);
const customerFirst = buildBusinessDashboard(
  source,
  { ...profile, objective: "customers" },
  mapping,
  true,
);
assert.equal(
  customerFirst.visuals.find((v) => v.type === "horizontal").dimension,
  "Cliente",
);
const saved = {
  version: 1,
  sources: [source],
  dashboards: [
    {
      id: "dash-test",
      sourceId: source.id,
      config,
      updatedAt: new Date().toISOString(),
    },
  ],
};
const roundtrip = workspaceSchema.parse(JSON.parse(JSON.stringify(saved)));
assert.deepEqual(
  roundtrip.dashboards[0].config.businessContext.mapping,
  mapping,
);
assert.deepEqual(
  suggestMapping(source, roundtrip.dashboards[0].config.businessContext),
  mapping,
);
const next = {
  ...source,
  rows: [
    { ...source.rows[0], "ID Venda": "P003", "ID Item": "I004", Valor: "50" },
  ],
};
const refreshed = planLoad(source, next, {
  mode: "append",
  keys: ["ID Venda", "ID Item"],
}).source;
assert.equal(
  chartData(refreshed.rows, refreshed, config.visuals[0]).value,
  500,
);
assert.equal(chartData(refreshed.rows, refreshed, config.visuals[1]).value, 3);
assert.equal(
  planLoad(refreshed, next, { mode: "append", keys: ["ID Venda", "ID Item"] })
    .source.rows.length,
  4,
);
console.log(
  "PASS objective ordering, server schema roundtrip, mapping reuse and idempotent source refresh with existing dashboard.",
);
const operational = parseCSV("Data;Categoria;Valor\n01/09/2026;A;2\n02/09/2026;B;3", "operacao.csv", "ops");
for (const level of KNOWLEDGE_LEVELS) {
  const c = buildBusinessDashboard(operational, { segment: "other", operation: "", objective: "explore", knowledge: level.value }, suggestMapping(operational), true);
  assert.equal(c.visuals[0].title, "Total informado");
  assert.equal(c.visuals[0].numberStyle.kind, "number");
  assert.equal(chartData(operational.rows, operational, c.visuals[0]).value, 5);
  assert.ok(c.visuals.some(v => v.dimension === "Categoria" && v.type === "horizontal"));
  assert.ok(!c.visuals.some(v => /vendas|lucro|margem/i.test(v.title)));
  const stored=workspaceSchema.parse({version:1,sources:[operational],dashboards:[{id:"ops-panel",sourceId:operational.id,config:c,updatedAt:new Date().toISOString()}]});
  assert.equal(stored.dashboards[0].config.businessContext.profile.knowledge,level.value);
}
console.log("PASS all knowledge levels survive persistence; operational data is not labeled as sales or currency.");
for (const lang of ["en", "es"]) {
  const dictionary = JSON.parse(
    readFileSync(new URL(`../lib/locales/${lang}.json`, import.meta.url)),
  );
  for (const option of [...SEGMENTS, ...OBJECTIVES, ...ROLES, ...KNOWLEDGE_LEVELS])
    assert.ok(dictionary[option.label], `${lang}: ${option.label}`);
  for (const segment of SEGMENTS) assert.ok(dictionary[segment.detail]);
}
console.log(
  "PASS business segments, goals and semantic field labels available in English and Spanish.",
);
