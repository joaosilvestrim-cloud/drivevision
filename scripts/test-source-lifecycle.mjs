import assert from "node:assert/strict";
import { parseCSV } from "../lib/analytics.ts";
import { planLoad, refreshDerived } from "../lib/source-lifecycle.ts";
import { combineSources } from "../lib/exploration.ts";
const source = (text, id = "sales") =>
  parseCSV("ID;Data;Cliente;Valor\n" + text, id, id);
const original = source("01;2026-01-01;A;10\n02;2026-02-01;B;20");
const update = source("02;2026-02-01;B;25\n03;2026-02-02;A;30");
const options = { mode: "upsert", keys: ["ID"] };
let count = 0;
function test(name, fn) {
  fn();
  count++;
  console.log("PASS", name);
}
test("upsert preserves identity, updates one and appends one without mutating input", () => {
  const result = planLoad(original, update, options);
  assert.equal(result.source.id, original.id);
  assert.equal(result.source.rows.length, 3);
  assert.deepEqual(result.summary, {
    added: 1,
    updated: 1,
    unchanged: 0,
    removed: 0,
    duplicates: 0,
  });
  assert.equal(original.rows[1].Valor, "20");
});
test("retry is idempotent and repeated rows in upload are counted", () => {
  const first = planLoad(original, update, options).source;
  const next = planLoad(
    first,
    { ...update, rows: [...update.rows, update.rows[0]] },
    options,
  );
  assert.equal(next.source.rows.length, 3);
  assert.deepEqual(next.summary, {
    added: 0,
    updated: 0,
    unchanged: 2,
    removed: 0,
    duplicates: 1,
  });
});
test("append never silently overwrites changed operations", () =>
  assert.throws(
    () => planLoad(original, update, { ...options, mode: "append" }),
    /valores diferentes/,
  ));
test("identical existing operation is ignored in append", () =>
  assert.equal(
    planLoad(original, original, { ...options, mode: "append" }).summary
      .unchanged,
    2,
  ));
test("conflicting or blank keys fail closed", () => {
  assert.throws(
    () =>
      planLoad(
        original,
        {
          ...update,
          rows: [update.rows[0], { ...update.rows[0], Valor: "200" }],
        },
        options,
      ),
    /conflitantes/,
  );
  assert.throws(
    () =>
      planLoad(
        original,
        { ...update, rows: [{ ...update.rows[0], ID: "" }] },
        options,
      ),
    /vazios/,
  );
  assert.throws(
    () =>
      planLoad(
        { ...original, rows: [original.rows[0], original.rows[0]] },
        update,
        options,
      ),
    /repete/,
  );
});
test("composite identifiers preserve two legitimate equal-value sales items", () => {
  const s = source("01;2026-01-01;A;10\n01;2026-01-01;B;10");
  assert.equal(
    planLoad(s, s, { ...options, keys: ["ID", "Cliente"] }).summary.unchanged,
    2,
  );
});
test("period replacement removes only missing operations within inclusive bounds", () => {
  const next = planLoad(original, source("03;2026-02-02;A;30"), {
    ...options,
    mode: "replace-period",
    dateField: "Data",
    start: "2026-02-01",
    end: "2026-02-28",
  });
  assert.equal(next.summary.removed, 1);
  assert.deepEqual(
    next.source.rows.map((r) => r.ID),
    ["01", "03"],
  );
  assert.throws(
    () =>
      planLoad(original, update, {
        ...options,
        mode: "replace-period",
        dateField: "Data",
        start: "2026-02-02",
        end: "2026-02-28",
      }),
    /fora do período/,
  );
});
test("changed schema and oversized results are rejected", () => {
  assert.throws(
    () => planLoad(original, { ...update, numeric: [] }, options),
    /tipos/,
  );
  assert.throws(
    () =>
      planLoad(
        original,
        {
          ...update,
          rows: Array.from({ length: 20001 }, (_, i) => ({
            ...update.rows[0],
            ID: String(i + 100),
          })),
        },
        options,
      ),
    /20 mil/,
  );
});
const clients = parseCSV("Cliente;Nome\nA;Ana\nB;Bia", "Clientes", "clients");
const join = {
  mode: "left",
  leftKey: "Cliente",
  rightKey: "Cliente",
  trim: true,
};
const combined = {
  ...combineSources(original, clients, join).source,
  id: "joined",
  name: "Combinada",
  recipe: {
    leftId: original.id,
    rightId: clients.id,
    rightName: clients.name,
    options: join,
  },
};
test("dependent sources refresh and keep identity and field names after rename", () => {
  const changed = planLoad(original, update, options).source;
  const next = refreshDerived([
    combined,
    { ...clients, name: "Renomeada" },
    changed,
  ]);
  assert.equal(next[0].rows.length, 3);
  assert.equal(next[0].id, "joined");
  assert.equal(next[0].rows[2]["Clientes · Nome"], "Ana");
});
test("missing parents, cycles and ambiguous joins abort entire rebuild", () => {
  assert.throws(() => refreshDerived([combined, original]), /ausente/);
  assert.throws(
    () =>
      refreshDerived([
        { ...combined, recipe: { ...combined.recipe, leftId: "joined" } },
        clients,
      ]),
    /circular/,
  );
  assert.throws(
    () =>
      refreshDerived([
        combined,
        original,
        { ...clients, rows: [...clients.rows, clients.rows[0]] },
      ]),
    /repete/,
  );
  assert.equal(combined.rows.length, 2);
});
test("derived data cannot be imported over directly", () =>
  assert.throws(() => planLoad(combined, combined, options), /origens/));
console.log(`${count} source lifecycle checks passed.`);
