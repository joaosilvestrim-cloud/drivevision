import { createHash } from "node:crypto";
import { z } from "zod";
import { ConnectorError } from "./connector-security.ts";
import { protheusBase, protheusRequest } from "./protheus-http.ts";
import { validTimeZone } from "../lib/refresh-schedule.ts";
import type { Source, DataRow } from "../lib/analytics.ts";
import type {
  ProtheusOptions,
  ProtheusPreview,
} from "../lib/protheus-types.ts";

export const protheusOptions = z
  .object({
    dataset: z.literal("protheus-financial"),
    periodDays: z.union([z.literal(30), z.literal(90), z.literal(365)]),
    titleTypes: z
      .array(z.string().regex(/^[A-Z0-9]{1,3}$/))
      .min(1)
      .max(12)
      .refine(
        (v) =>
          new Set(v).size === v.length &&
          !v.some((t) => ["RA", "PA", "NCC", "NDF"].includes(t)),
      ),
    daily: z
      .object({
        time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        timeZone: z.string().max(100).refine(validTimeZone),
      })
      .strict()
      .optional(),
  })
  .strict();
const headerText = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[\x20-\x7E]+$/);
export const protheusCredentials = z
  .object({
    baseUrl: z.string().max(300).transform(protheusBase),
    username: headerText,
    password: headerText,
    company: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9 ]{1,20}$/),
    branch: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9 ]{1,20}$/),
  })
  .strict();
export type ProtheusCredentials = z.infer<typeof protheusCredentials>;
export type ProtheusResult = {
  source: Source;
  from: string;
  to: string;
  fetchedAt: string;
  fingerprint: string;
  totals: ProtheusPreview["totals"];
};
const numeric = [
  "Valor original",
  "Saldo em aberto",
  "A receber",
  "A pagar",
  "Recebimentos vencidos",
  "Pagamentos vencidos",
];
const columns = [
  "Título",
  "Empresa",
  "Filial",
  "Tipo",
  "Tipo de título",
  "Pessoa",
  "Loja",
  "Natureza",
  "Emissão",
  "Vencimento",
  "Situação",
  ...numeric,
];
const inconsistent = () =>
  new ConnectorError(
    422,
    "Dados Protheus incompletos, duplicados ou incompatíveis com o escopo. Confira campos, permissões, moeda e filtros; nenhum resultado parcial foi publicado.",
  );
export function protheusPeriod(days: number, now = new Date()) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const date = new Date(today + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() - days + 1);
  const end = new Date(today + "T12:00:00Z");
  end.setUTCDate(end.getUTCDate() + 30);
  return {
    from: date.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
    today,
  };
}
function dateValue(value: unknown) {
  if (typeof value !== "string") throw inconsistent();
  const m = /^(\d{4})-?(\d{1,2})-?(\d{1,2})$/.exec(value.trim());
  if (!m) throw inconsistent();
  const iso = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  const date = new Date(iso + "T12:00:00Z");
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== iso
  )
    throw inconsistent();
  return iso;
}
function cents(value: unknown) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1e11 ||
    Math.abs(value * 100 - Math.round(value * 100)) > 0.001
  )
    throw inconsistent();
  return Math.round(value * 100);
}
const text = (value: unknown, blank = false) => {
  if (
    typeof value !== "string" ||
    value.length > 200 ||
    (!blank && !value.trim())
  )
    throw inconsistent();
  return value.trim();
};
// Dependency injection is server-side only, used by contract tests. No request input can replace transport.
export async function fetchProtheusSource(
  credentials: ProtheusCredentials,
  input: ProtheusOptions,
  transport = protheusRequest,
  now = new Date(),
): Promise<ProtheusResult> {
  const options = protheusOptions.parse(input),
    c = protheusCredentials.parse(credentials);
  const { from, to, today } = protheusPeriod(options.periodDays, now);
  const signal = AbortSignal.timeout(55000);
  const headers = {
    tenantId: `${c.company},${c.branch}`,
    "x-erp-module": "FIN",
  };
  const tokenUrl = new URL(c.baseUrl + "/api/oauth2/v1/token");
  tokenUrl.searchParams.set("grant_type", "password");
  const token = z
    .object({
      access_token: z
        .string()
        .min(1)
        .max(16000)
        .regex(/^[A-Za-z0-9._~+\/-]+=*$/),
    })
    .safeParse(
      await transport(
        tokenUrl,
        { ...headers, username: c.username, password: c.password },
        signal,
        "POST",
      ),
    );
  if (!token.success)
    throw new ConnectorError(
      401,
      "O Protheus não forneceu um token válido. Confira a configuração de autenticação do usuário de integração.",
    );
  const rows: DataRow[] = [],
    keys = new Set<string>();
  const totals = {
    receivable: 0,
    payable: 0,
    overdueReceivable: 0,
    overduePayable: 0,
  };
  for (const side of [1, 2] as const) {
    const prefix = `e${side}_`,
      alias = `SE${side}`;
    const fields = [
      "filial",
      "prefixo",
      "num",
      "parcela",
      "tipo",
      side === 1 ? "cliente" : "fornece",
      "loja",
      "naturez",
      "emissao",
      "vencrea",
      "valor",
      "saldo",
      "moeda",
    ];
    let previousRemaining: number | undefined;
    for (let page = 1; ; page++) {
      if (page > 50 || signal.aborted)
        throw new ConnectorError(
          422,
          "A consulta Protheus ultrapassou o limite. Reduza o período; nenhum resultado parcial foi publicado.",
        );
      const url = new URL(c.baseUrl + "/api/framework/v1/genericQuery");
      const field = (s: string) =>
        `${alias}.${prefix.toUpperCase()}${s.toUpperCase()}`;
      // Fixed tables and projections, validated title types only. No user SQL or joins.
      const where = `${field("vencrea")} >= '${from.replaceAll("-", "")}' AND ${field("vencrea")} <= '${to.replaceAll("-", "")}' AND ${field("saldo")} > 0 AND ${field("moeda")} = 1 AND ${field("tipo")} IN (${options.titleTypes.map((t) => `'${t}'`).join(",")})`;
      for (const [key, value] of Object.entries({
        tables: alias,
        fields: fields.map((f) => prefix + f).join(","),
        where: where,
        filialFilter: "true",
        deletedFilter: "true",
        page: String(page),
        pageSize: "100",
        order: [
          "filial",
          "prefixo",
          "num",
          "parcela",
          "tipo",
          side === 1 ? "cliente" : "fornece",
          "loja",
        ]
          .map((f) => prefix + f)
          .join(","),
      }))
        url.searchParams.set(key, value);
      const response = z
        .object({
          items: z.array(z.record(z.unknown())).max(100),
          hasNext: z.boolean(),
          remainingRecords: z.number().int().nonnegative(),
          protectedDataFields: z.array(z.string()).optional(),
          nivelFields: z.array(z.string()).optional(),
        })
        .safeParse(
          await transport(
            url,
            { ...headers, Authorization: `Bearer ${token.data.access_token}` },
            signal,
          ),
        );
      if (!response.success) throw inconsistent();
      const data = response.data;
      if (data.protectedDataFields?.length || data.nivelFields?.length)
        throw new ConnectorError(
          403,
          "O usuário Protheus não pode ler todos os campos financeiros necessários. Solicite a revisão das permissões de SE1 e SE2.",
        );
      if (
        data.hasNext !== data.remainingRecords > 0 ||
        (data.hasNext && !data.items.length) ||
        (previousRemaining !== undefined &&
          previousRemaining !== data.items.length + data.remainingRecords)
      )
        throw inconsistent();
      previousRemaining = data.remainingRecords;
      if (rows.length + data.items.length + data.remainingRecords > 5000)
        throw new ConnectorError(
          422,
          "A seleção excede 5.000 títulos. Reduza o período; nenhum resultado parcial foi publicado.",
        );
      for (const raw of data.items) {
        const r = Object.fromEntries(
          Object.entries(raw).map(([k, v]) => [k.toLowerCase(), v]),
        );
        const get = (f: string) => r[prefix + f];
        const branch = text(get("filial"), true),
          type = text(get("tipo")),
          due = dateValue(get("vencrea"));
        const amount = cents(get("valor")),
          balance = cents(get("saldo"));
        if (
          (branch && branch !== c.branch) ||
          !options.titleTypes.includes(type) ||
          get("moeda") !== 1 ||
          balance <= 0 ||
          due < from ||
          due > to
        )
          throw inconsistent();
        const person = text(get(side === 1 ? "cliente" : "fornece")),
          shop = text(get("loja"), true);
        const parts = [
          c.company,
          branch,
          String(side),
          text(get("prefixo"), true),
          text(get("num")),
          text(get("parcela"), true),
          type,
          person,
          shop,
        ];
        const key = JSON.stringify(parts);
        if (keys.has(key)) throw inconsistent();
        keys.add(key);
        const overdue = due < today,
          receivable = side === 1;
        totals[receivable ? "receivable" : "payable"] += balance;
        if (overdue)
          totals[receivable ? "overdueReceivable" : "overduePayable"] +=
            balance;
        if (Object.values(totals).some(total => !Number.isSafeInteger(total))) throw inconsistent();
        rows.push({
          Título: parts.slice(3, 7).join(" / "),
          Empresa: c.company,
          Filial: branch || "Compartilhada",
          Tipo: receivable ? "Receber" : "Pagar",
          "Tipo de título": type,
          Pessoa: person,
          Loja: shop,
          Natureza: text(get("naturez"), true),
          Emissão: dateValue(get("emissao")),
          Vencimento: due,
          Situação: overdue ? "Vencido" : "A vencer",
          "Valor original": (amount / 100).toFixed(2),
          "Saldo em aberto": (balance / 100).toFixed(2),
          "A receber": receivable ? (balance / 100).toFixed(2) : "0",
          "A pagar": receivable ? "0" : (balance / 100).toFixed(2),
          "Recebimentos vencidos":
            receivable && overdue ? (balance / 100).toFixed(2) : "0",
          "Pagamentos vencidos":
            !receivable && overdue ? (balance / 100).toFixed(2) : "0",
        });
      }
      if (!data.hasNext) break;
    }
  }
  rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  for (const k of Object.keys(totals) as (keyof typeof totals)[])
    totals[k] /= 100;
  const fetchedAt = now.toISOString();
  const fingerprint = createHash("sha256")
    .update(JSON.stringify([rows, from, to, options.titleTypes.slice().sort()]))
    .digest("hex");
  return {
    from,
    to,
    fetchedAt,
    fingerprint,
    totals,
    source: {
      id: "protheus-preview",
      name: "Protheus · Títulos em aberto",
      columns,
      numeric,
      dates: ["Emissão", "Vencimento"],
      rows,
      demo: false,
      createdAt: fetchedAt,
      remoteInfo: {
        provider: "protheus",
        from,
        to,
        excluded: 0,
        fetchedAt,
        scope: `${c.company} / ${c.branch} · ${options.titleTypes.join(", ")} · BRL`,
      },
    },
  };
}
