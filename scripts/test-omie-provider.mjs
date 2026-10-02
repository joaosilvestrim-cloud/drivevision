import assert from "node:assert/strict";
import { fetchOmieSource, omiePeriod } from "../server/omie-provider.ts";
import {
  suggestMapping,
  inspectBusinessSource,
} from "../lib/business-onboarding.ts";
const credentials = {
  appKey: "1234567890",
  appSecret: "fixture-secret-not-real",
};
const options = { dataset: "omie-invoiced-orders", periodDays: 90 };
const actual = globalThis.fetch;
const date = omiePeriod(90).to.split("-").reverse().join("/");
export const order = (id, amount, extra = {}) => ({
  cabecalho: {
    codigo_pedido: id,
    numero_pedido: String(id),
    codigo_cliente: 100,
    origem_pedido: "ERP",
  },
  total_pedido: { valor_total_pedido: amount },
  infoCadastro: { dFat: date, faturado: "S", cancelado: "N", ...extra },
});
let calls = 0;
function mock(fn) {
  calls = 0;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://app.omie.com.br/api/v1/produtos/pedido/");
    assert.equal(init.redirect, "error");
    assert.equal(init.method, "POST");
    assert.ok(init.signal);
    const body = JSON.parse(init.body);
    assert.equal(body.call, "ListarPedidos");
    assert.equal(body.app_key, credentials.appKey);
    assert.equal(body.param[0].status_pedido, "FATURADO");
    calls++;
    return fn(body.param[0].pagina);
  };
}
const response = (rows, page = 1, total = rows.length, pages = 1) =>
  new Response(
    JSON.stringify({
      pagina: page,
      total_de_paginas: pages,
      registros: rows.length,
      total_de_registros: total,
      pedido_venda_produto: rows,
    }),
  );
try {
  assert.deepEqual(omiePeriod(30, new Date("2026-10-02T01:00:00Z")), {
    from: "2026-09-02",
    to: "2026-10-01",
  });
  mock((p) =>
    p === 1
      ? response([order(1, 100), order(2, 350)], 1, 4, 2)
      : response(
          [
            order(3, 999, { cancelado: "S" }),
            order(4, 777, { devolvido_parcial: "S" }),
          ],
          2,
          4,
          2,
        ),
  );
  const good = await fetchOmieSource(credentials, options);
  assert.equal(calls, 2);
  assert.equal(good.excluded, 2);
  assert.equal(good.source.rows.length, 2);
  assert.equal(
    good.source.rows.reduce((n, r) => n + Number(r["Valor total"]), 0),
    450,
  );
  const mapping = suggestMapping(good.source);
  assert.equal(mapping.value, "Valor total");
  assert.equal(mapping.order, "Pedido");
  assert.equal(mapping.date, "Data de faturamento");
  assert.equal(mapping.customer, "Cliente (código)");
  assert.equal(mapping.seller, undefined, "Do not suggest charts for an entirely empty optional column");
  assert.equal(good.source.remoteInfo.provider, "omie");
  assert.equal(inspectBusinessSource(good.source, mapping).errors.length, 0);
  console.log(
    "PASS exact totals, one row per order, returns/cancellations excluded, guided mapping and Brazil date window",
  );
  for (const [label, fn] of [
    ["duplicate order", (p) => response([order(1, 100)], p, 2, 2)],
    [
      "missing final records",
      (p) => response(p === 1 ? [order(1, 100)] : [], p, 2, 2),
    ],
    [
      "changed pagination",
      (p) => response([order(p, 100)], p, p === 1 ? 2 : 3, 2),
    ],
    [
      "missing monetary value",
      () => response([{ ...order(1, 100), total_pedido: {} }]),
    ],
    ["invalid date", () => response([order(1, 100, { dFat: "31/02/2026" })])],
    ["out of window", () => response([order(1, 100, { dFat: "01/01/2000" })])],
    ["too many results", () => response([], 1, 5001, 51)],
    [
      "provider error",
      () =>
        new Response(
          JSON.stringify({
            faultcode: "bad",
            faultstring: credentials.appSecret,
          }),
          { status: 500 },
        ),
    ],
    ["throttled", () => new Response("", { status: 429 })],
    ["unauthorized", () => new Response("", { status: 401 })],
    ["malformed JSON", () => new Response("<html>unavailable</html>")],
    [
      "timeout",
      () => {
        throw new Error("timeout " + credentials.appSecret);
      },
    ],
  ]) {
    mock(fn);
    await assert.rejects(
      () => fetchOmieSource(credentials, options),
      (e) => {
        assert.ok(!e.message.includes(credentials.appSecret));
        return e.status >= 400;
      },
    );
    console.log("PASS fails closed:", label);
  }
  mock(() => response([], 1, 0, 0));
  assert.equal(
    (await fetchOmieSource(credentials, options)).source.rows.length,
    0,
  );
  mock((p) =>
    p === 1
      ? response([order(1, 100)], 1, 2, 2)
      : new Response(
          JSON.stringify({
            faultcode: "SOAP-ENV:Client-5113",
            faultstring: "Não existem registros",
          }),
          { status: 500 },
        ),
  );
  await assert.rejects(() => fetchOmieSource(credentials, options));
  console.log(
    "PASS genuine empty selection allowed, empty fault on later page cannot erase data",
  );
} finally {
  globalThis.fetch = actual;
}
