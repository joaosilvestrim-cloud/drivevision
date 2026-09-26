import { strict as assert } from "node:assert";
import {
  readWorkbook,
  detectTables,
  planFor,
  normalizeSheet,
  headerNames,
} from "../lib/smart-import.ts";
import * as XLSX from "xlsx";
let passed = 0;
async function test(name, fn) {
  await fn();
  passed++;
  console.log("PASS", name);
}
const encode = (s) => new TextEncoder().encode(s).buffer;
const messy =
  "RELATÓRIO COMERCIAL - USO INTERNO\n\nGerado em setembro\n\nRegião;Produto;Janeiro;Fevereiro\nSul;Plano A;100;200\nNorte;Plano B;300;400\nRegião;Produto;Janeiro;Fevereiro\nTotal geral;;400;600\n";
const book = await readWorkbook(encode(messy), "bagunçada.csv"),
  sheet = book.sheets[0],
  candidate = detectTables(sheet)[0],
  plan = planFor(sheet, candidate);
await test("finds CSV table beneath title, notes and blank lines", () => {
  assert.equal(candidate.header, 4);
  assert.equal(candidate.left, 0);
  assert.equal(candidate.right, 3);
  assert.equal(book.sheets.length, 1);
});
await test("keeps totals by default and reports repeated headers", () => {
  const p = normalizeSheet(sheet, plan, book.name);
  assert.equal(p.totals, 1);
  assert.equal(p.repeated, 1);
  assert.equal(p.source.rows.length, 3);
  assert.equal(p.source.importNotes.header, 5);
});
await test("unpivot converts month columns to records without changing sums", () => {
  const p = normalizeSheet(
    sheet,
    { ...plan, skipTotals: true, unpivot: [2, 3] },
    book.name,
  );
  assert.equal(p.source.rows.length, 4);
  assert.deepEqual(p.source.columns, ["Região", "Produto", "Período", "Valor"]);
  assert.equal(
    p.source.rows.reduce((sum, r) => sum + Number(r.Valor), 0),
    1000,
  );
  assert.ok(p.source.numeric.includes("Valor"));
});
await test("quoted CSV separators and embedded newlines remain intact", async () => {
  const b = await readWorkbook(
    encode('Título\n\nNome;Valor\n"A;B";10\n"Duas\nlinhas";20'),
    "quoted.csv",
  );
  const s = b.sheets[0];
  const p = normalizeSheet(s, planFor(s, detectTables(s)[0]), b.name);
  assert.equal(p.source.rows[0].Nome, "A;B");
  assert.equal(p.source.rows[1].Nome, "Duas\nlinhas");
});
await test("Excel sheets, merged headers, dates and saved formulas are read locally", async () => {
  const ws = XLSX.utils.aoa_to_sheet([
    ["Relatório"],
    [],
    ["Região", "2026", null],
    ["Nome", "Janeiro", "Fevereiro"],
    ["Sul", 10, 20],
    ["Norte", 30, 40],
  ]);
  ws["!merges"] = [{ s: { r: 2, c: 1 }, e: { r: 2, c: 2 } }];
  ws.B5 = { t: "n", f: "5+5", v: 10 };
  ws.C5 = { t: "n", f: "10+10" };
  const second = XLSX.utils.aoa_to_sheet(
    [
      ["Data", "Valor"],
      [new Date("2026-09-01T00:00:00Z"), 42],
      [new Date("2026-09-02T00:00:00Z"), 84],
    ],
    { UTC: true },
  );
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Resumo");
  XLSX.utils.book_append_sheet(wb, second, "Detalhes");
  const bytes = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  const b = await readWorkbook(bytes, "merged.xlsx");
  assert.equal(b.sheets.length, 2);
  assert.equal(b.sheets[0].formulas, 2);
  assert.equal(b.sheets[0].uncached, 1);
  const p = {
    ...planFor(b.sheets[0]),
    header: 2,
    headerDepth: 2,
    left: 0,
    right: 2,
    end: 5,
  };
  assert.deepEqual(headerNames(b.sheets[0], p), [
    "Região · Nome",
    "2026 · Janeiro",
    "2026 · Fevereiro",
  ]);
  assert.equal(b.sheets[1].rows[1][0], "2026-09-01");
});
await test("merged values and explicit fill-down preserve row identity", () => {
  const s = {
    name: "Sheet",
    rows: [
      ["Grupo", "Item", "Valor"],
      ["Sul", "A", "10"],
      ["", "B", "20"],
      ["Norte", "C", "30"],
      ["", "D", "40"],
    ],
    merges: [{ r0: 1, r1: 2, c0: 0, c1: 0 }],
    formulas: 0,
    uncached: 0,
  };
  const p = planFor(s);
  const a = normalizeSheet(s, p, "groups.xlsx");
  assert.equal(a.source.rows[1].Grupo, "Sul");
  assert.equal(a.source.rows[3].Grupo, "");
  const b = normalizeSheet(s, { ...p, fillDown: [0] }, "groups.xlsx");
  assert.equal(b.source.rows[3].Grupo, "Norte");
});
await test("blank headers and duplicates receive stable unique names", () => {
  const s = {
    name: "Sheet",
    rows: [
      ["Valor", "Valor", ""],
      ["10", "20", "A"],
      ["30", "40", "B"],
    ],
    merges: [],
    formulas: 0,
    uncached: 0,
  };
  assert.deepEqual(normalizeSheet(s, planFor(s), "test").source.columns, [
    "Valor",
    "Valor (2)",
    "Coluna 3",
  ]);
});
await test("leading zeros and mixed types are never silently coerced", () => {
  const s = {
    name: "Sheet",
    rows: [
      ["Código", "Valor"],
      ["001", "10"],
      ["002", "n/a"],
    ],
    merges: [],
    formulas: 0,
    uncached: 0,
  };
  const p = normalizeSheet(s, planFor(s), "test");
  assert.equal(p.source.rows[0]["Código"], "001");
  assert.deepEqual(p.source.numeric, []);
  assert.deepEqual(p.mixed, ["Valor"]);
});
await test("separate table blocks are candidates and ranges are editable", async () => {
  const b = await readWorkbook(
    encode("Nome;Valor\nA;10\nB;20\n\nProduto;Custo\nX;1\nY;2"),
    "blocks.csv",
  );
  const found = detectTables(b.sheets[0]);
  assert.ok(found.some((c) => c.header === 0));
  assert.ok(found.some((c) => c.header === 4));
  assert.equal(found.find((c) => c.header === 0).end, 2);
});
await test("invalid ranges and unsafe expansion are rejected", () => {
  assert.throws(
    () => normalizeSheet(sheet, { ...plan, right: 999 }, book.name),
    /intervalo/,
  );
  assert.deepEqual(headerNames(sheet, { ...plan, right: 1e10 }), []);
  assert.throws(
    () => normalizeSheet(sheet, { ...plan, unpivot: [0, 1, 2, 3] }, book.name),
    /identificação/,
  );
  assert.throws(
    () =>
      normalizeSheet(
        sheet,
        { ...plan, unpivot: [2], variableName: "Região" },
        book.name,
      ),
    /nomes/,
  );
  const big = {
    ...sheet,
    rows: [
      ["Grupo", "A", "B"],
      ...Array.from({ length: 11000 }, () => ["x", "1", "2"]),
    ],
  };
  assert.throws(
    () => normalizeSheet(big, { ...planFor(big), unpivot: [1, 2] }, "big"),
    /20 mil/,
  );
});
await test("source sheet is immutable after all transformations", () => {
  const before = JSON.stringify(sheet);
  normalizeSheet(
    sheet,
    { ...plan, skipTotals: true, fillDown: [0], unpivot: [2, 3] },
    book.name,
  );
  assert.equal(JSON.stringify(sheet), before);
});
console.log(`${passed} smart import checks passed.`);
