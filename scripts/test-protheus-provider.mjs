import { formatChartNumber } from "../lib/chart-model.ts";
import assert from "node:assert/strict";
import {
  fetchProtheusSource,
  protheusPeriod,
  protheusOptions,
} from "../server/protheus-provider.ts";
import { publicIPv4, protheusBase } from "../server/protheus-http.ts";
import { financialDashboard } from "../lib/financial-dashboard.ts";
const credentials = {
  baseUrl: "https://erp.example.com/rest",
  username: "qa",
  password: "fixture-only",
  company: "01",
  branch: "0101",
};
const options = {
  dataset: "protheus-financial",
  periodDays: 30,
  titleTypes: ["NF", "DP"],
};
const now = new Date("2026-10-09T14:00:00Z");
const row = (side, id, balance = 100.25) =>
  Object.fromEntries(
    Object.entries({
      filial: "0101",
      prefixo: "",
      num: String(id),
      parcela: "01",
      tipo: "NF",
      [side === 1 ? "cliente" : "fornece"]: "001",
      loja: "01",
      naturez: "001",
      emissao: "20260901",
      vencrea: "2026-10-8",
      valor: 200,
      saldo: balance,
      moeda: 1,
    }).map(([k, v]) => [`e${side}_${k}`, v]),
  );
const page = (items, remainingRecords = 0) => ({
  items,
  remainingRecords,
  hasNext: remainingRecords > 0,
});
let mode = "ok",
  calls = 0;
const transport = async (url, headers, signal, method = "GET") => {
  assert.ok(signal);
  calls++;
  if (url.pathname.endsWith("/token")) {
    assert.equal(method, "POST");
    assert.equal(headers.password, credentials.password);
    return { access_token: "fixture-token" };
  }
  assert.equal(method, "GET");
  assert.equal(headers.password, undefined);
  assert.equal(headers.Authorization, "Bearer fixture-token");
  assert.equal(headers.tenantId, "01,0101");
  assert.equal(url.searchParams.get("deletedFilter"), "true");
  assert.equal(url.searchParams.get("filialFilter"), "true");
  assert.ok(url.searchParams.get("where").includes("IN ('NF','DP')"));
  const side = url.searchParams.get("tables") === "SE1" ? 1 : 2;
  const p = Number(url.searchParams.get("page"));
  if (mode === "pagination")
    return p === 1 ? page([row(side, 1)], 1) : page([row(side, 2)]);
  if (mode === "duplicate")
    return p === 1 ? page([row(side, 1)], 1) : page([row(side, 1)]);
  if (mode === "countchange")
    return p === 1 ? page([row(side, 1)], 2) : page([row(side, 2)]);
  if (mode === "oversize") return page([row(side, 1)], 5000);
  if (mode === "permission")
    return { ...page([row(side, 1)]), protectedDataFields: [`E${side}_SALDO`] };
  if (mode === "missingpage") return page([], 10);
  if (mode === "empty") return page([]);
  if (mode === "malformed") return { items: [], hasNext: false };
  const r = row(side, 1);
  if (mode === "foreign") r[`e${side}_filial`] = "0202";
  if (mode === "shared") r[`e${side}_filial`] = " ";
  if (mode === "currency") r[`e${side}_moeda`] = 2;
  if (mode === "stringmoney") r[`e${side}_saldo`] = "1.000,25";
  if (mode === "missing") delete r[`e${side}_saldo`];
  if (mode === "date") r[`e${side}_vencrea`] = "20260230";
  if (mode === "outofrange") r[`e${side}_vencrea`] = "20250101";
  if (mode === "paid") r[`e${side}_saldo`] = 0;
  if (mode === "excluded") r[`e${side}_tipo`] = "NCC";
  if (mode === "today") r[`e${side}_vencrea`] = "20261009";
  if (mode === "upper")
    return page([
      Object.fromEntries(
        Object.entries(r).map(([k, v]) => [k.toUpperCase(), v]),
      ),
    ]);
  return page([r]);
};
for (const ip of [
  "127.0.0.1",
  "10.0.0.1",
  "172.16.1.1",
  "192.168.0.1",
  "169.254.169.254",
  "100.64.0.1",
  "0.0.0.0",
  "198.19.0.1",
  "224.1.1.1",
  "::1",
  "::ffff:127.0.0.1",
  "192.0.0.1",
  "192.0.2.1",
])
  assert.equal(publicIPv4(ip), false, ip);
assert.equal(publicIPv4("8.8.8.8"), true);
for (const url of [
  "http://erp.example.com/rest",
  "https://127.0.0.1/rest",
  "https://[::1]/rest",
  "https://a:b@erp.example.com/rest",
  "https://erp.local/rest",
  "https://erp.example.com/rest?q=x",
  "https://erp.example.com/rest#x",
  "https://erp.example.com/r%2fest",
])
  assert.throws(() => protheusBase(url), url);
assert.equal(
  protheusBase("https://erp.example.com:8443/rest/"),
  credentials.baseUrl.replace(".com", ".com:8443"),
);
assert.equal(
  protheusOptions.safeParse({
    ...options,
    titleTypes: ["NF'); DROP TABLE SE1;--"],
  }).success,
  false,
);
assert.equal(
  protheusOptions.safeParse({ ...options, titleTypes: ["NCC"] }).success,
  false,
);
assert.deepEqual(protheusPeriod(30, now), {
  today: "2026-10-09",
  from: "2026-09-10",
  to: "2026-11-08",
});
let result = await fetchProtheusSource(credentials, options, transport, now);
assert.equal(result.source.rows.length, 2);
assert.equal(calls, 3);
assert.deepEqual(result.totals, {
  receivable: 100.25,
  payable: 100.25,
  overdueReceivable: 100.25,
  overduePayable: 100.25,
});
assert.equal(
  financialDashboard(result.source).title,
  "Protheus · Títulos em aberto",
);
assert.equal(
  (
    formatChartNumber(
      100.25,
      "A receber",
      financialDashboard(result.source).visuals[0].numberStyle,
    ).match(/R\$/g) || []
  ).length,
  1,
);
assert.ok(
  financialDashboard(result.source).visuals.at(-1).text.includes("DRE"),
);
for (mode of ["pagination", "shared", "upper", "today", "empty"]) {
  result = await fetchProtheusSource(credentials, options, transport, now);
  if (mode === "pagination") assert.equal(result.source.rows.length, 4);
  if (mode === "today") assert.equal(result.totals.overduePayable, 0);
  if (mode === "empty") assert.equal(result.source.rows.length, 0);
}
for (mode of [
  "duplicate",
  "countchange",
  "oversize",
  "permission",
  "missingpage",
  "malformed",
  "foreign",
  "currency",
  "stringmoney",
  "missing",
  "date",
  "outofrange",
  "paid",
  "excluded",
])
  await assert.rejects(
    () => fetchProtheusSource(credentials, options, transport, now),
    undefined,
    mode,
  );
console.log(
  "PASS Protheus contract: authentication, fixed queries, paging, cents, dates, dashboard, empty scope, duplicates, denied fields, partial data, foreign branch, currency, row limit and SSRF input policy. No real ERP contacted.",
);
