import assert from "node:assert/strict";
import {
  financialCents,
  financialHealth,
  financialMetrics,
  reviewFinancialSource,
  selectFinancialTitles,
} from "../lib/financial-review.ts";
import { toCSV } from "../lib/analytics.ts";
const source = {
  id: "qa",
  name: "ERP",
  remoteInfo: { provider: "protheus", fetchedAt: "2026-10-10T01:00:00Z" },
  rows: [],
  columns: ["Título", "Tipo", "Saldo em aberto"],
  numeric: [],
  dates: [],
  demo: false,
  createdAt: "",
};
const title = (days, side = "Receber", amount = "0.10") => ({
  Título: `NF/${days}`,
  Pessoa: "Álvaro",
  Loja: "01",
  Natureza: "100",
  Empresa: "01",
  Filial: "0101",
  Tipo: side,
  Vencimento: new Date(Date.UTC(2026, 9, 9 - days)).toISOString().slice(0, 10),
  "Saldo em aberto": amount,
});
source.rows = [0, 1, 7, 8, 30, 31, 60, 61, -6, -7].map((d) => title(d));
source.rows.push(title(1, "Pagar", "1234.56"));
const before = JSON.stringify(source);
const result = reviewFinancialSource(source);
assert.equal(result.reference, "2026-10-09"); // extraction date in Brazil, not UTC/browser timezone
assert.equal(result.weekEnd, "2026-10-15");
assert.deepEqual(result.totals, {
  receivable: 100,
  payable: 123456,
  overdueReceivable: 70,
  overduePayable: 123456,
  weekReceivable: 20,
  weekPayable: 0,
});
for (const [selection, count] of Object.entries({
  all: 11,
  receivable: 10,
  payable: 1,
  overdueReceivable: 7,
  overduePayable: 1,
  weekReceivable: 2,
  weekPayable: 0,
  age1: 3,
  age8: 2,
  age31: 2,
  age61: 1,
}))
  assert.equal(
    selectFinancialTitles(result, selection).length,
    count,
    selection,
  );
assert.equal(selectFinancialTitles(result, "all", "alvaro", "Pagar").length, 1);
assert.equal(selectFinancialTitles(result, "all", "no result").length, 0);
assert.equal(selectFinancialTitles(result, "all")[0].overdueDays, 61);
assert.equal(
  JSON.stringify(source),
  before,
  "never modify source or saved dashboards",
);
for (const metric of financialMetrics)
  assert.equal(
    selectFinancialTitles(result, metric).reduce(
      (sum, t) => sum + t.balance,
      0,
    ),
    result.totals[metric],
  );
for (const bad of [
  "",
  "1,234.56",
  "1.234,56",
  "1e2",
  "-10",
  "0.001",
  "Infinity",
  "9007199254740991",
])
  assert.equal(financialCents(bad), null, bad);
assert.equal(financialCents("0"), 0);
assert.equal(financialCents("1234.56"), 123456);
assert.equal(
  reviewFinancialSource({ ...source, rows: [title(0, "Receber", "bad")] }),
  null,
);
assert.equal(
  reviewFinancialSource({
    ...source,
    rows: [{ ...title(0), Vencimento: "2026-02-30" }],
  }),
  null,
);
assert.equal(
  reviewFinancialSource({
    ...source,
    remoteInfo: { ...source.remoteInfo, provider: "contaazul" },
  }),
  null,
);
assert.equal(
  reviewFinancialSource({ ...source, rows: [] }).totals.receivable,
  0,
);
assert.ok(
  toCSV({
    ...source,
    rows: [{ ...title(0), Título: '=HYPERLINK("bad")' }],
  }).includes("'=HYPERLINK"),
);
const now = Date.parse("2026-10-10T02:00:00Z");
const binding = {
  source_id: "qa",
  paused: false,
  last_error: null,
  next_due_at: "2026-10-10T10:00:00Z",
};
const state = { bindings: [binding], scheduled: true };
assert.equal(financialHealth(source, null, now).status, "unknown");
assert.equal(
  financialHealth(source, { ...state, bindings: [] }, now).status,
  "disconnected",
);
assert.equal(financialHealth(source, state, now).status, "current");
assert.equal(
  financialHealth(source, { ...state, scheduled: false }, now).status,
  "unscheduled",
);
for (const [patch, status] of [
  [{ paused: true }, "paused"],
  [{ last_error: "failure" }, "error"],
  [{ next_due_at: "2026-10-10T00:00:00Z" }, "late"],
])
  assert.equal(
    financialHealth(
      source,
      { ...state, bindings: [{ ...binding, ...patch }] },
      now,
    ).status,
    status,
  );
assert.equal(
  financialHealth(
    {
      ...source,
      remoteInfo: { ...source.remoteInfo, fetchedAt: "2026-10-08T00:00:00Z" },
    },
    state,
    now,
  ).status,
  "stale",
);
console.log(
  "PASS financial reading: exact cents, Brazil date, aging boundaries, drill-down reconciliation, search, empty/malformed source, safe CSV, immutable source and connection health.",
);
