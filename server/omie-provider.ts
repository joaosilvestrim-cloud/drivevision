import { z } from "zod";
import { ConnectorError, boundedBody } from "./connector-security.ts";
import type { Source, DataRow } from "../lib/analytics.ts";
import type { OmieOptions } from "../lib/omie-types.ts";
import { validTimeZone } from "../lib/refresh-schedule.ts";

export const omieOptions = z
  .object({
    dataset: z.literal("omie-invoiced-orders"),
    periodDays: z.union([z.literal(30), z.literal(90), z.literal(365)]),
    daily: z
      .object({
        time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        timeZone: z.string().max(100).refine(validTimeZone),
      })
      .strict()
      .optional(),
  })
  .strict();
export const omieCredentials = z
  .object({
    appKey: z
      .string()
      .trim()
      .regex(/^\d{5,40}$/),
    appSecret: z
      .string()
      .trim()
      .min(10)
      .max(200)
      .regex(/^[A-Za-z0-9_-]+$/),
  })
  .strict();
export type OmieCredentials = z.infer<typeof omieCredentials>;
export type OmieResult = {
  source: Source;
  excluded: number;
  from: string;
  to: string;
  fetchedAt: string;
};
const columns = [
  "Pedido",
  "Número do pedido",
  "Data de faturamento",
  "Valor total",
  "Cliente (código)",
  "Vendedor (código)",
  "Canal",
];
const id = z
  .union([z.number().int().safe().positive(), z.string().regex(/^\d+$/)])
  .transform(String);
const orderSchema = z.object({
  cabecalho: z.object({
    codigo_pedido: id,
    numero_pedido: z.string().max(100).optional(),
    codigo_cliente: id,
    origem_pedido: z.string().max(100).optional(),
  }),
  total_pedido: z.object({ valor_total_pedido: z.number().finite() }),
  infoCadastro: z.object({
    dFat: z.string(),
    faturado: z.enum(["S", "N"]),
    cancelado: z.enum(["S", "N"]),
    denegado: z.enum(["S", "N"]).optional(),
    devolvido: z.enum(["S", "N"]).optional(),
    devolvido_parcial: z.enum(["S", "N"]).optional(),
  }),
  informacoes_adicionais: z
    .object({
      codVend: z.union([z.string(), z.number().int().safe()]).optional(),
    })
    .optional(),
});
const incomplete = () =>
  new ConnectorError(
    422,
    "O Omie retornou dados incompletos ou inconsistentes. A última versão foi preservada; tente novamente.",
  );
function isoDate(value: string) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) throw incomplete();
  const iso = `${match[3]}-${match[2]}-${match[1]}`;
  const date = new Date(iso + "T12:00:00Z");
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== iso
  )
    throw incomplete();
  return iso;
}
export function omiePeriod(days: number, now = new Date()) {
  const to = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const start = new Date(to + "T12:00:00Z");
  start.setUTCDate(start.getUTCDate() - days + 1);
  return { from: start.toISOString().slice(0, 10), to };
}
const brDate = (s: string) => s.split("-").reverse().join("/");

// Fixed host, fixed read operation, no arbitrary URLs or write methods accepted.
export async function fetchOmieSource(
  credentials: OmieCredentials,
  options: OmieOptions,
): Promise<OmieResult> {
  const { from, to } = omiePeriod(options.periodDays);
  const signal = AbortSignal.timeout(55000);
  const rows: DataRow[] = [],
    ids = new Set<string>();
  let pages = 1,
    total = -1,
    received = 0,
    excluded = 0;
  try {
    for (let page = 1; page <= pages; page++) {
      const response = await fetch(
        "https://app.omie.com.br/api/v1/produtos/pedido/",
        {
          method: "POST",
          redirect: "error",
          signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            call: "ListarPedidos",
            app_key: credentials.appKey,
            app_secret: credentials.appSecret,
            param: [
              {
                pagina: page,
                registros_por_pagina: 100,
                apenas_resumo: "N",
                status_pedido: "FATURADO",
                data_faturamento_de: brDate(from),
                data_faturamento_ate: brDate(to),
              },
            ],
          }),
        },
      );
      if (response.status === 429 || response.status === 425)
        throw new ConnectorError(
          429,
          "O Omie limitou as consultas. Aguarde alguns minutos antes de atualizar novamente.",
        );
      if (response.status === 401 || response.status === 403)
        throw new ConnectorError(
          401,
          "O Omie recusou as credenciais. Confira App Key, App Secret e as permissões do aplicativo.",
        );
      const body = JSON.parse((await boundedBody(response)).toString());
      if (body.faultcode || body.faultstring) {
        // Never echo provider messages: they can include credentials or customer data.
        const fault = String(body.faultstring || "");
        if (/too many|redundante|consumo|aguarde|60 segundos/i.test(fault))
          throw new ConnectorError(
            429,
            "O Omie limitou as consultas. Aguarde alguns minutos antes de atualizar novamente.",
          );
        if (
          /app.?key|app.?secret|autentic|credencia|não autorizad|nao autorizad/i.test(
            fault,
          )
        )
          throw new ConnectorError(
            401,
            "O Omie recusou as credenciais. Confira App Key, App Secret e as permissões do aplicativo.",
          );
        // Recognized empty-list response only on the first page, never partial success.
        if (
          page === 1 &&
          String(body.faultcode).endsWith(":Client-5113") &&
          /não existem registros|nao existem registros/i.test(fault)
        ) {
          total = 0;
          break;
        }
        throw new ConnectorError(
          502,
          "O Omie não concluiu a consulta. Confira o acesso à API e tente novamente; os dados anteriores foram preservados.",
        );
      }
      if (!response.ok)
        throw new ConnectorError(
          502,
          "O Omie está indisponível no momento. Tente novamente mais tarde.",
        );
      const parsed = z
        .object({
          pagina: z.number().int(),
          total_de_paginas: z.number().int().nonnegative(),
          registros: z.number().int().nonnegative(),
          total_de_registros: z.number().int().nonnegative(),
          pedido_venda_produto: z.array(z.unknown()).optional(),
        })
        .safeParse(body);
      if (!parsed.success) throw incomplete();
      const data = parsed.data,
        items = data.pedido_venda_produto || [];
      if (
        data.pagina !== page ||
        items.length !== data.registros ||
        data.registros > 100
      )
        throw incomplete();
      if (data.total_de_paginas > 50 || data.total_de_registros > 5000)
        throw new ConnectorError(
          422,
          "Esta seleção supera 5.000 pedidos. Escolha um período menor; nenhum dado parcial foi publicado.",
        );
      if (page === 1) {
        pages = data.total_de_paginas;
        total = data.total_de_registros;
      } else if (
        pages !== data.total_de_paginas ||
        total !== data.total_de_registros
      )
        throw incomplete();
      if (total > 0 && (!pages || !items.length)) throw incomplete();
      for (const raw of items) {
        const result = orderSchema.safeParse(raw);
        if (!result.success) throw incomplete();
        const order = result.data,
          header = order.cabecalho,
          info = order.infoCadastro;
        if (ids.has(header.codigo_pedido)) throw incomplete();
        ids.add(header.codigo_pedido);
        received++;
        if (
          info.cancelado === "S" ||
          info.denegado === "S" ||
          info.devolvido === "S" ||
          info.devolvido_parcial === "S" ||
          info.faturado !== "S"
        ) {
          excluded++;
          continue;
        }
        const date = isoDate(info.dFat);
        if (date < from || date > to) throw incomplete();
        rows.push({
          Pedido: header.codigo_pedido,
          "Número do pedido": header.numero_pedido || header.codigo_pedido,
          "Data de faturamento": date,
          "Valor total": String(order.total_pedido.valor_total_pedido),
          "Cliente (código)": header.codigo_cliente,
          "Vendedor (código)": String(
            order.informacoes_adicionais?.codVend || "",
          ),
          Canal: header.origem_pedido || "",
        });
      }
    }
    if (received !== total) throw incomplete();
    rows.sort((a, b) => a.Pedido.localeCompare(b.Pedido));
    const fetchedAt = new Date().toISOString();
    return {
      from,
      to,
      excluded,
      fetchedAt,
      source: {
        id: "omie-preview",
        name: "Omie · Pedidos faturados",
        columns,
        numeric: ["Valor total"],
        dates: ["Data de faturamento"],
        rows,
        demo: false,
        createdAt: fetchedAt,
        remoteInfo: { provider: "omie", from, to, excluded, fetchedAt },
      },
    };
  } catch (error) {
    if (error instanceof ConnectorError) throw error;
    throw new ConnectorError(
      502,
      "Não foi possível consultar o Omie. A conexão pode ter expirado ou a resposta estar incompleta; tente novamente.",
    );
  }
}
