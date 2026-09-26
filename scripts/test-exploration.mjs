import { strict as assert } from "node:assert";
import { parseCSV, defaultConfig } from "../lib/analytics.ts";
import {
  combineSources,
  pivotData,
  qualityReport,
  insights,
  applySelections,
  addSelection,
  groupValue,
} from "../lib/exploration.ts";
import { prepareSource } from "../lib/data-model.ts";
import { applyModel } from "../lib/workspace-model.ts";
import { boardRows, makeVisual } from "../lib/visual-builder.ts";
const sales = parseCSV(
  "Data;ID;Região;Produto;Receita\n2026-01-01;01;Sul;A;10\n2026-01-02;02;Sul;B;20\n2026-02-01;02;Norte;A;90\n2026-02-02;;Norte;A;30",
  "Vendas",
  "sales",
);
const clients = parseCSV(
  "Cliente;Nome;Limite\n01;Ana;100\n02;Bia;200\n;Sem cadastro;0",
  "Clientes",
  "clients",
);
const options = {
  mode: "left",
  leftKey: "ID",
  rightKey: "Cliente",
  trim: true,
};
let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log("PASS", name);
}
test("left join preserves input and never matches blank keys", () => {
  const before = JSON.stringify(sales);
  const r = combineSources(sales, clients, options);
  assert.equal(r.source.rows.length, 4);
  assert.equal(r.matched, 3);
  assert.equal(r.unmatched, 1);
  assert.equal(r.source.rows[0]["Clientes · Nome"], "Ana");
  assert.equal(r.source.rows[3]["Clientes · Nome"], "");
  assert.equal(JSON.stringify(sales), before);
  assert.ok(r.source.numeric.includes("Clientes · Limite"));
});
test("inner join omits unmatched and preserves multiple left transactions", () => {
  const r = combineSources(sales, clients, { ...options, mode: "inner" });
  assert.equal(r.source.rows.length, 3);
  assert.equal(
    r.source.rows.filter((r) => r["Clientes · Nome"] === "Bia").length,
    2,
  );
});
test("ambiguous keys stop before multiplying revenue", () => {
  assert.throws(
    () =>
      combineSources(
        sales,
        { ...clients, rows: [...clients.rows, clients.rows[0]] },
        options,
      ),
    /repete/,
  );
});
test("join trimming is explicit and case sensitive", () => {
  const right = {
    ...clients,
    rows: [{ Cliente: " 01 ", Nome: "Ana", Limite: "100" }],
  };
  assert.equal(combineSources(sales, right, options).matched, 1);
  assert.equal(
    combineSources(sales, right, { ...options, trim: false }).matched,
    0,
  );
});
test("append aligns by name and demotes conflicting types", () => {
  const right = parseCSV("Receita;Nova\nindefinida;x", "Mês2", "month2");
  const r = combineSources(sales, right, { ...options, mode: "append" });
  assert.equal(r.source.rows.length, 5);
  assert.equal(r.source.rows[4].Data, "");
  assert.equal(r.source.rows[0].Nova, "");
  assert.ok(!r.source.numeric.includes("Receita"));
});
test("joins enforce bounded outputs", () => {
  assert.throws(
    () =>
      combineSources(
        { ...sales, rows: Array(20000).fill(sales.rows[0]) },
        clients,
        { ...options, mode: "append" },
      ),
    /20 mil/,
  );
});
const spec = {
  row: "Região",
  column: "Produto",
  metric: "Receita",
  aggregation: "sum",
  heatmap: true,
};
test("pivot sums cells and grand total without dropping sparse groups", () => {
  const p = pivotData(sales.rows, spec);
  assert.equal(p.total, 150);
  assert.deepEqual(p.values, [
    [120, null],
    [10, 20],
  ]);
  assert.deepEqual(p.colTotals, [130, 20]);
});
test("pivot averages are weighted from records, not sums of averages", () => {
  const p = pivotData(sales.rows, { ...spec, aggregation: "average" });
  assert.equal(p.total, 37.5);
  assert.deepEqual(p.rowTotals, [60, 15]);
  assert.equal(p.colTotals[0], 130 / 3);
});
test("pivot distinct total is recalculated over all source rows", () => {
  const p = pivotData(sales.rows, {
    ...spec,
    metric: "ID",
    aggregation: "distinct",
  });
  assert.equal(p.total, 2);
  assert.deepEqual(p.rowTotals, [1, 2]);
});
test("pivot display cap keeps complete totals and reports omissions", () => {
  const rows = Array.from({ length: 120 }, (_, i) => ({
    Região: `R${i}`,
    Produto: "A",
    Receita: "1",
  }));
  const p = pivotData(rows, spec);
  assert.equal(p.rowKeys.length, 100);
  assert.equal(p.omittedRows, 20);
  assert.equal(p.total, 120);
});
test("date drill selects whole month and quarter, invalid dates remain distinguishable", () => {
  assert.equal(groupValue("2026-02-25", "quarter"), "2026-01-01");
  assert.equal(
    applySelections(sales.rows, [
      { field: "Data", value: "2026-02-01", grain: "month" },
    ]).length,
    2,
  );
  assert.equal(groupValue("bad", "month"), "Sem data");
});
test("cross filters intersect and can replace one dimension", () => {
  const a = [{ field: "Região", value: "Sul" }];
  const b = addSelection(a, { field: "Produto", value: "A" });
  assert.equal(applySelections(sales.rows, b).length, 1);
  assert.equal(addSelection(b, { field: "Região", value: "Norte" }).length, 2);
  assert.equal(
    boardRows(sales, { ...defaultConfig(sales), selections: b }).length,
    1,
  );
});
test("quality detects empty cells, invalid values, duplicate rows", () => {
  const src = {
    ...sales,
    rows: [
      ...sales.rows,
      sales.rows[0],
      { ...sales.rows[0], Receita: "inválido" },
    ],
  };
  const q = qualityReport(src);
  assert.equal(q.duplicates, 1);
  assert.equal(q.invalid, 1);
  assert.equal(q.empty, 1);
  assert.equal(q.completeness, (100 * 29) / 30);
});
test("descriptive insights exclude missing values and report concentration", () => {
  const r = insights(sales.rows, sales, "Receita", "Região");
  assert.equal(r.total, 150);
  assert.equal(r.ranking[0].name, "Norte");
  assert.equal(r.share, 0.8);
  assert.equal(r.outliers, 1);
});
test("conditional columns preserve raw data and classify using all conditions", () => {
  const step = {
    id: "c",
    kind: "conditional",
    field: "Faixa",
    value: "Alta",
    extra: "Padrão",
    filters: {
      mode: "and",
      rules: [{ id: "r", field: "Receita", op: "gte", value: "30" }],
    },
  };
  const p = prepareSource(sales, [step]);
  assert.equal(p.error, undefined);
  assert.deepEqual(
    p.source.rows.map((r) => r.Faixa),
    ["Padrão", "Padrão", "Alta", "Alta"],
  );
  assert.ok(!sales.columns.includes("Faixa"));
  assert.match(
    prepareSource(sales, [{ ...step, filters: { mode: "and", rules: [] } }])
      .error,
    /condição/,
  );
});
test("date derivations preserve original and include year in month key", () => {
  const p = prepareSource(sales, [
    { id: "d", kind: "datepart", field: "Data", value: "month", extra: "Mês" },
  ]);
  assert.equal(p.error, undefined);
  assert.equal(p.source.rows[2]["Mês"], "2026-02");
  assert.equal(p.source.rows[2].Data, "2026-02-01");
});
test("rename rebinds pivot axes, bookmarks and selections; serialization retains them", () => {
  const cfg = {
    ...defaultConfig(sales),
    selections: [{ field: "Região", value: "Sul" }],
    bookmarks: [
      {
        id: "b",
        name: "Sul",
        period: "all",
        selections: [{ field: "Região", value: "Sul" }],
      },
    ],
    visuals: [
      {
        ...makeVisual("pivot", sales, defaultConfig(sales), "p"),
        pivotColumn: "Região",
      },
    ],
  };
  const renamed = applyModel(sales, cfg, [
    { id: "r", kind: "rename", field: "Região", value: "Local" },
  ]);
  const restored = JSON.parse(JSON.stringify(renamed));
  assert.equal(restored.visuals[0].pivotColumn, "Local");
  assert.equal(restored.bookmarks[0].selections[0].field, "Local");
  assert.equal(restored.selections[0].field, "Local");
});
test("raw pivot selections distinguish empty values from display labels", () => {
  const rows = [{ Grupo: "" }, { Grupo: "Sem informação" }];
  assert.deepEqual(applySelections(rows, [{ field: "Grupo", value: "", raw: true }]), [rows[0]]);
  assert.deepEqual(applySelections(rows, [{ field: "Grupo", value: "Sem informação", raw: true }]), [rows[1]]);
});
console.log(`${passed} exploration checks passed.`);
