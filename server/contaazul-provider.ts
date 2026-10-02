import { z } from "zod";
import {
  ConnectorError,
  boundedBody,
  encryptionKey,
} from "./connector-security.ts";
import { validTimeZone } from "../lib/refresh-schedule.ts";
import { parseDate, type DataRow, type Source } from "../lib/analytics.ts";

export const contaAzulOptions = z
  .object({
    dataset: z.literal("contaazul-financial"),
    periodDays: z.union([z.literal(30), z.literal(90), z.literal(365)]),
    daily: z
      .object({
        time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        timeZone: z.string().max(100).refine(validTimeZone),
      })
      .strict(),
  })
  .strict();
export function contaAzulReady() {
  try {
    encryptionKey();
    return !!(
      process.env.DRIVEVISION_CONTAAZUL_CLIENT_ID &&
      process.env.DRIVEVISION_CONTAAZUL_CLIENT_SECRET
    );
  } catch {
    return false;
  }
}
export function contaAzulAuthorize(state: string, redirect: string) {
  if (!contaAzulReady())
    throw new ConnectorError(
      503,
      "A integração Conta Azul aguarda configuração pelo administrador.",
    );
  return (
    "https://login.contaazul.com/#/oauth/authorize?" +
    new URLSearchParams({
      response_type: "code",
      client_id: process.env.DRIVEVISION_CONTAAZUL_CLIENT_ID!,
      redirect_uri: redirect,
      state,
      scope: "openid profile aws.cognito.signin.user.admin",
    })
  );
}
export type CaTokens = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};
export async function contaAzulExchange(
  values: Record<string, string>,
): Promise<CaTokens> {
  if (!contaAzulReady())
    throw new ConnectorError(
      503,
      "A integração Conta Azul aguarda configuração pelo administrador.",
    );
  const r = await fetch("https://api-v2.contaazul.com/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization:
        "Basic " +
        Buffer.from(
          process.env.DRIVEVISION_CONTAAZUL_CLIENT_ID +
            ":" +
            process.env.DRIVEVISION_CONTAAZUL_CLIENT_SECRET,
        ).toString("base64"),
    },
    body: new URLSearchParams(values),
    signal: AbortSignal.timeout(12000),
    redirect: "error",
  });
  if (!r.ok)
    throw new ConnectorError(
      r.status === 400 || r.status === 401 ? 401 : 502,
      "Não foi possível renovar a autorização Conta Azul. Reconecte a empresa ou tente novamente.",
    );
  const d = JSON.parse(Buffer.from(await boundedBody(r, 100000)).toString());
  if (
    typeof d.access_token !== "string" ||
    !d.access_token ||
    typeof d.refresh_token !== "string" ||
    !d.refresh_token ||
    !Number.isFinite(d.expires_in) ||
    d.expires_in <= 0
  )
    throw new ConnectorError(
      502,
      "A Conta Azul retornou uma autorização incompleta. Conecte novamente.",
    );
  return {
    access_token: d.access_token,
    refresh_token: d.refresh_token,
    expires_in: d.expires_in,
  };
}
export async function caGet(
  access: string,
  path: string,
  params: Record<string, string | number> = {},
) {
  if (!/^\/v1\/financeiro\/eventos-financeiros\//.test(path))
    throw new ConnectorError(400, "Recurso Conta Azul inválido.");
  const url = new URL("https://api-v2.contaazul.com" + path);
  for (const [k, v] of Object.entries(params))
    url.searchParams.set(k, String(v));
  const r = await fetch(url, {
    headers: { Authorization: "Bearer " + access, Accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok)
    throw new ConnectorError(
      r.status === 401 ? 401 : r.status === 429 ? 429 : 502,
      r.status === 401
        ? "A autorização Conta Azul expirou. Reconecte a empresa."
        : r.status === 429
          ? "A Conta Azul limitou as consultas. A atualização será retomada."
          : "Não foi possível consultar a Conta Azul. Os dados anteriores foram preservados.",
    );
  return JSON.parse(Buffer.from(await boundedBody(r, 5_000_000)).toString());
}
export function caPage(raw: unknown, page: number) {
  const r = raw as Record<string, unknown>;
  const items = r?.itens ?? r?.items;
  const total = r?.itens_totais ?? r?.total_itens ?? r?.totalItems;
  if (
    !Array.isArray(items) ||
    !Number.isInteger(total) ||
    Number(total) < 0 ||
    items.length > 100 ||
    Number(total) > 20000 ||
    (items.length === 0 && (page - 1) * 100 < Number(total))
  )
    throw new ConnectorError(
      422,
      "A paginação da Conta Azul mudou ou excede 20 mil parcelas. Reduza o período.",
    );
  return {
    items: items as Record<string, unknown>[],
    total: Number(total),
    done: page * 100 >= Number(total),
  };
}
export function caWindows(days: number, now = new Date()): [string, string][] {
  const day = new Date(
    now.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) +
      "T00:00:00Z",
  );
  const start = new Date(+day - (days - 1) * 86400000),
    end = new Date(+day + 30 * 86400000),
    windows: [string, string][] = [];
  for (let cursor = start; cursor <= end;) {
    const last = new Date(
      Math.min(
        +end,
        Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0),
      ),
    );
    windows.push([
      cursor.toISOString().slice(0, 10),
      last.toISOString().slice(0, 10),
    ]);
    cursor = new Date(+last + 86400000);
  }
  return windows;
}
export const CA_NUMERIC = [
  "Valor da parcela",
  "Recebido na parcela",
  "Pago na parcela",
  "A receber",
  "A pagar",
  "Recebimentos vencidos",
  "Pagamentos vencidos",
];
export const CA_COLUMNS = [
  "ID da parcela",
  "Tipo",
  "Descrição",
  "Pessoa",
  "Vencimento",
  "Situação",
  ...CA_NUMERIC,
];
// Exactly one row per installment. Paid values are settlement totals for that installment,
// not cash movements by payment date; the dashboard deliberately uses due dates.
export function caRow(
  r: Record<string, unknown>,
  kind: "receber" | "pagar",
  today: string,
): DataRow {
  const date = String(r.data_vencimento ?? "");
  const money = (v: unknown) => {
    if (
      v === null ||
      v === undefined ||
      v === "" ||
      !Number.isFinite(Number(v)) ||
      Number(v) < 0
    )
      throw new ConnectorError(
        422,
        "Uma parcela retornou valor inválido. A carga anterior foi preservada.",
      );
    return Number(v);
  };
  if (typeof r.id !== "string" || !r.id || parseDate(date) === null)
    throw new ConnectorError(
      422,
      "Uma parcela retornou identificador ou vencimento inválido.",
    );
  const status = String(r.status_traduzido ?? r.status ?? "").toUpperCase();
  const inactive = /CANCEL|RENEGOTI|PERDIDO|LOST/.test(status);
  const total = money(r.total),
    paid = money(r.pago),
    remaining = money(r.nao_pago);
  const p = (r.cliente ?? r.fornecedor ?? r.pessoa) as
    { nome?: string } | undefined;
  const due = !inactive && date < today ? remaining : 0,
    receive = kind === "receber";
  return {
    "ID da parcela": kind + ":" + r.id,
    Tipo: receive ? "Receber" : "Pagar",
    Descrição: String(r.descricao ?? "").slice(0, 1000),
    Pessoa: String(p?.nome ?? "Não informado").slice(0, 500),
    Vencimento: date,
    Situação: status || "Não informado",
    "Valor da parcela": String(inactive ? 0 : total),
    "Recebido na parcela": String(inactive || !receive ? 0 : paid),
    "Pago na parcela": String(inactive || receive ? 0 : paid),
    "A receber": String(inactive || !receive ? 0 : remaining),
    "A pagar": String(inactive || receive ? 0 : remaining),
    "Recebimentos vencidos": String(receive ? due : 0),
    "Pagamentos vencidos": String(receive ? 0 : due),
  };
}
export function caSource(rows: DataRow[], from: string, to: string): Source {
  return {
    id: "contaazul",
    name: "Conta Azul · Financeiro",
    columns: CA_COLUMNS,
    numeric: CA_NUMERIC,
    dates: ["Vencimento"],
    rows,
    demo: false,
    createdAt: new Date().toISOString(),
    remoteInfo: {
      provider: "contaazul",
      from,
      to,
      excluded: 0,
      fetchedAt: new Date().toISOString(),
    },
  };
}
