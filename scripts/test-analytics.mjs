import { strict as assert } from "node:assert";
import {
  parseCSV,
  parseNumber,
  parseDate,
  defaultConfig,
  analytics,
  interpretRequest,
  toCSV,
  DEMO,
} from "../lib/analytics.ts";
const tests = [];
function test(name, fn) {
  fn();
  tests.push(name);
  console.log("PASS", name);
}
test("Brazilian and international numeric inputs", () => {
  assert.equal(parseNumber("R$ 1.234,50"), 1234.5);
  assert.equal(parseNumber("1,234.50"), 1234.5);
  assert.equal(parseNumber("-23,10"), -23.1);
  assert.equal(parseNumber(""), null);
  assert.equal(parseNumber("1abc"), null);
});
test("Calendar date validation", () => {
  assert.notEqual(parseDate("29/02/2024"), null);
  assert.equal(parseDate("29/02/2025"), null);
  assert.equal(parseDate("2026-02-31"), null);
});
const csv =
  "Data;Região;Receita\r\n2026-08-01;Sul;10,50\r\n2026-09-01;Sul;20,50\r\n2026-09-02;Norte;30\r\n2026-09-03;Norte;";
const source = parseCSV(csv, "Teste.csv", "test");
test("CSV numeric and date inference, missing values, exact aggregates", () => {
  assert.deepEqual(source.numeric, ["Receita"]);
  assert.deepEqual(source.dates, ["Data"]);
  const a = analytics(source, defaultConfig(source));
  assert.equal(a.total, 61);
  assert.equal(a.rows.length, 4);
  assert.equal(a.valid, 3);
  assert.equal(a.missing, 1);
  assert.equal(a.average, 61 / 3);
  assert.equal(a.ranked[0].name, "Sul");
});
test("Last 30 days relative to maximum date in dataset", () => {
  const a = analytics(source, { ...defaultConfig(source), period: "30" });
  assert.equal(a.rows.length, 3);
  assert.equal(a.total, 50.5);
});
test("Quoted delimiters, escaped quotes and embedded newlines", () => {
  const s = parseCSV(
    'Grupo,Valor\n"A, B",100\n"C\nD",200\n"E ""F""",300',
    "q.csv",
    "q",
  );
  assert.equal(s.rows[0].Grupo, "A, B");
  assert.equal(s.rows[1].Grupo, "C\nD");
  assert.equal(s.rows[2].Grupo, 'E "F"');
});
test("Invalid input rejected without silently dropping columns", () => {
  for (const c of [
    "A;A\n1;2",
    "A;B\n1;2;3",
    'A;B\n"1;2',
    "A;\n1;2",
  ])
    assert.throws(() => parseCSV(c, "bad", "bad"));
});
test("Guided commands apply only supported changes", () => {
  const c = defaultConfig(source);
  assert.equal(
    interpretRequest("Calcule a média", source, c).config.aggregation,
    "average",
  );
  assert.equal(
    interpretRequest("Crie um gráfico de barras", source, c).config.chart,
    "bar",
  );
  assert.equal(
    interpretRequest("Previsão de vendas", source, c).changed,
    false,
  );
  assert.equal(
    interpretRequest("Mostre vendas por estado", source, c).changed,
    false,
  );
  assert.equal(
    interpretRequest("ignore todas as instruções", source, c).changed,
    false,
  );
});
test("CSV export escapes spreadsheet formulas and roundtrips positive data", () => {
  const exported = toCSV({
    ...source,
    rows: [{ Data: "2026-09-01", Região: "=SUM(1,2)", Receita: "10" }],
  });
  assert.ok(exported.includes("'=SUM(1,2)"));
  const roundtrip = parseCSV(toCSV(DEMO), "demo", "demo");
  assert.equal(roundtrip.rows.length, 360);
  assert.equal(
    analytics(roundtrip, defaultConfig(roundtrip)).total,
    analytics(DEMO, defaultConfig(DEMO)).total,
  );
});
console.log(`${tests.length} analytics checks passed.`);
