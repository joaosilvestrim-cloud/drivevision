import https from "node:https";
import dns from "node:dns/promises";
import { syncBuiltinESMExports } from "node:module";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import assert from "node:assert/strict";
import { protheusPeriod } from "../../server/protheus-provider.ts";
export function fixtureProtheus() {
  const originalRequest = https.request,
    originalResolve = dns.resolve4;
  const state = { mode: "ok", value: 100, calls: 0 };
  dns.resolve4 = async (host) => {
    if (host === "private.example.com") return ["127.0.0.1"];
    assert.equal(host, "erp.example.com", "Unexpected outbound DNS in fixture");
    return ["8.8.8.8"];
  };
  https.request = (url, options, callback) => {
    state.calls++;
    assert.equal(url.hostname, "erp.example.com");
    assert.equal(options.agent, false);
    assert.equal(options.servername, url.hostname);
    options.lookup(url.hostname, {}, (err, ip, family) => {
      assert.equal(err, null);
      assert.equal(ip, "8.8.8.8");
      assert.equal(family, 4);
    });
    const req = new EventEmitter();
    req.end = () =>
      process.nextTick(() => {
        const res = new PassThrough();
        res.statusCode = 200;
        res.headers = {};
        let body;
        if (
          options.headers.password === "invalid-secret" ||
          state.mode === "invalid"
        ) {
          res.statusCode = 401;
          body = { message: "fixture-secret must not leak" };
        } else if (state.mode === "throttled") {
          res.statusCode = 429;
          body = {};
        } else if (state.mode === "redirect") {
          res.statusCode = 302;
          res.headers.location = "https://private.example.com";
          body = {};
        } else if (url.pathname.endsWith("/token")) {
          assert.equal(options.method, "POST");
          body = { access_token: "fixture-token" };
        } else {
          assert.equal(options.method, "GET");
          assert.equal(options.headers.Authorization, "Bearer fixture-token");
          const side = url.searchParams.get("tables") === "SE1" ? 1 : 2;
          const date = protheusPeriod(90).today;
          const item = Object.fromEntries(
            Object.entries({
              filial: "0101",
              prefixo: "",
              num: "001",
              parcela: "01",
              tipo: "NF",
              [side === 1 ? "cliente" : "fornece"]: "001",
              loja: "01",
              naturez: "001",
              emissao: date,
              vencrea: date,
              valor: 500,
              saldo: side === 1 ? state.value : 350,
              moeda: 1,
            }).map(([k, v]) => [`e${side}_${k}`, v]),
          );
          body = {
            items: state.mode === "empty" ? [] : [item],
            hasNext: false,
            remainingRecords: 0,
          };
          if (state.mode === "malformed") delete body.hasNext;
        }
        callback(res);
        res.end(JSON.stringify(body));
      });
    return req;
  };
  syncBuiltinESMExports();
  return {
    state,
    restore() {
      https.request = originalRequest;
      dns.resolve4 = originalResolve;
      syncBuiltinESMExports();
    },
  };
}
