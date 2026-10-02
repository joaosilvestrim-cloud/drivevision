import {
  defaultConfig,
  normalize,
  parseDate,
  parseNumber,
  type Config,
  type Source,
} from "./analytics.ts";
import { makeVisual, type Visual } from "./visual-builder.ts";

export const SEGMENTS = [
  {
    value: "commerce",
    label: "Comércio",
    detail: "Loja, e-commerce, atacado e distribuição",
  },
  {
    value: "services",
    label: "Serviços",
    detail: "Consultoria, agência, manutenção e atendimentos",
  },
  {
    value: "industry",
    label: "Indústria e fabricação",
    detail: "Produção própria e venda de produtos",
  },
  {
    value: "food",
    label: "Alimentação",
    detail: "Restaurante, padaria, delivery e lanchonete",
  },
  {
    value: "mixed",
    label: "Operação mista",
    detail: "Produtos e serviços na mesma empresa",
  },
] as const;
export const OBJECTIVES = [
  { value: "sales", label: "Acompanhar minhas vendas" },
  { value: "products", label: "Entender o que mais vende" },
  { value: "customers", label: "Conhecer meus clientes" },
] as const;
export const ROLES = [
  { value: "value", label: "Valor de cada linha" },
  { value: "date", label: "Data da operação" },
  { value: "order", label: "Identificador do pedido ou atendimento" },
  { value: "customer", label: "Cliente" },
  { value: "product", label: "Produto ou serviço" },
  { value: "seller", label: "Vendedor ou responsável" },
  { value: "channel", label: "Canal de venda" },
] as const;
export type Role = (typeof ROLES)[number]["value"];
export type BusinessProfile = {
  segment: string;
  operation: string;
  objective: string;
};
export type BusinessContext = {
  version: 1;
  profile: BusinessProfile;
  mapping: Partial<Record<Role, string>>;
  confirmedAt: string;
};
export const EMPTY_PROFILE: BusinessProfile = {
  segment: "",
  operation: "",
  objective: "sales",
};
const aliases: Record<Role, string[]> = {
  value: [
    "valor",
    "valor total",
    "total",
    "receita",
    "faturamento",
    "valor venda",
    "total item",
    "total nf",
    "revenue",
    "amount",
    "sales",
    "importe",
  ],
  date: [
    "data",
    "data venda",
    "data da venda",
    "data emissao",
    "data de faturamento",
    "date",
    "fecha",
  ],
  order: [
    "pedido",
    "id pedido",
    "id venda",
    "numero pedido",
    "nota fiscal",
    "order id",
    "sale id",
    "id atendimento",
  ],
  customer: [
    "cliente",
    "nome cliente",
    "razao social",
    "customer",
    "customer name",
    "cliente (codigo)",
  ],
  product: [
    "produto",
    "servico",
    "descricao produto",
    "item",
    "product",
    "service",
  ],
  seller: [
    "vendedor",
    "vendedor (codigo)",
    "representante",
    "responsavel",
    "seller",
    "salesperson",
  ],
  channel: ["canal", "canal venda", "origem", "channel"],
};
const normalized = (s: string) =>
  normalize(s)
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
export function suggestMapping(
  source: Source,
  previous?: BusinessContext,
): Partial<Record<Role, string>> {
  const mapping: Partial<Record<Role, string>> = {};
  for (const { value: role } of ROLES) {
    const saved = previous?.mapping[role];
    if (saved && source.columns.includes(saved)) {
      mapping[role] = saved;
      continue;
    }
    const candidates = source.columns.filter((c) =>
      aliases[role].includes(normalized(c)),
    );
    // Ambiguous aliases are left for the customer, never silently pick the first numeric column.
    if (
      candidates.length === 1 &&
      (["value", "date", "order"].includes(role) ||
        source.rows.some((row) => row[candidates[0]]?.trim()))
    )
      mapping[role] = candidates[0];
  }
  return mapping;
}
export function inspectBusinessSource(
  source: Source,
  mapping: Partial<Record<Role, string>>,
) {
  const errors: string[] = [];
  const fields = Object.values(mapping).filter(Boolean);
  if (fields.some((f) => !source.columns.includes(f!)))
    errors.push(
      "Uma coluna escolhida não existe mais. Revise as correspondências.",
    );
  if (new Set(fields).size !== fields.length)
    errors.push("Escolha colunas diferentes para cada significado.");
  const amount = mapping.value;
  const invalidAmounts = amount
    ? source.rows.filter((r) => parseNumber(r[amount] || "") === null).length
    : 0;
  if (invalidAmounts)
    errors.push(
      "O valor escolhido contém células vazias ou inválidas. Corrija a estrutura ou deixe esse campo sem associação.",
    );
  const invalidDates = mapping.date
    ? source.rows.filter((r) => parseDate(r[mapping.date!] || "") === null)
        .length
    : 0;
  if (invalidDates || (mapping.date && !source.dates.includes(mapping.date)))
    errors.push(
      "A data escolhida contém células vazias ou inválidas. Corrija a estrutura ou deixe esse campo sem associação.",
    );
  const values = amount
    ? source.rows.map((r) => parseNumber(r[amount] || ""))
    : [];
  const dates = mapping.date
    ? source.rows
        .map((r) => parseDate(r[mapping.date!] || ""))
        .filter((v): v is number => v !== null)
    : [];
  return {
    errors,
    lines: source.rows.length,
    total:
      amount && !invalidAmounts
        ? values.reduce<number>((s, v) => s + (v ?? 0), 0)
        : null,
    negative: values.filter((v) => v !== null && v < 0).length,
    orders: mapping.order
      ? new Set(
          source.rows
            .map((r) => r[mapping.order!] || "")
            .filter((v) => v.trim()),
        ).size
      : null,
    missingOrders: mapping.order
      ? source.rows.filter((r) => !(r[mapping.order!] || "").trim()).length
      : 0,
    from: dates.length
      ? new Date(Math.min(...dates)).toISOString().slice(0, 10)
      : null,
    to: dates.length
      ? new Date(Math.max(...dates)).toISOString().slice(0, 10)
      : null,
  };
}
export function buildBusinessDashboard(
  source: Source,
  profile: BusinessProfile,
  mapping: Partial<Record<Role, string>>,
  confirmed: boolean,
): Config {
  if (
    !SEGMENTS.some((s) => s.value === profile.segment) ||
    !OBJECTIVES.some((o) => o.value === profile.objective)
  )
    throw new Error("Escolha seu segmento e seu objetivo.");
  const check = inspectBusinessSource(source, mapping);
  if (check.errors.length) throw new Error(check.errors[0]);
  if (!confirmed)
    throw new Error(
      "Confirme as correspondências e a regra de valor antes de criar o painel.",
    );
  const context: BusinessContext = {
    version: 1,
    profile: { ...profile, operation: profile.operation.trim().slice(0, 120) },
    mapping: { ...mapping },
    confirmedAt: new Date().toISOString(),
  };
  const metric = mapping.value || source.columns[0];
  const dimension =
    mapping.product || mapping.customer || mapping.channel || source.columns[0];
  const config: Config = {
    ...defaultConfig(source),
    title:
      `${SEGMENTS.find((s) => s.value === profile.segment)!.label} · ${source.name}`.slice(
        0,
        300,
      ),
    metric,
    dimension,
    aggregation: mapping.value ? "sum" : "count",
    period: "all",
    businessContext: context,
  };
  const visuals: Visual[] = [];
  const add = (
    type: Visual["type"],
    title: string,
    field = metric,
    category = dimension,
    distinct = false,
  ) => {
    const visual = makeVisual(
      type,
      source,
      { ...config, metric: field, dimension: category },
      `business-${visuals.length}`,
    );
    visuals.push({
      ...visual,
      title,
      dimension: category,
      span: type === "kpi" ? 4 : 6,
      limit: type === "line" ? 0 : 10,
      grain:
        type === "line" && check.from?.slice(0, 7) === check.to?.slice(0, 7)
          ? "day"
          : visual.grain,
      legend: false,
      numberStyle: {
        kind:
          mapping.value && field === mapping.value && !distinct
            ? "currency"
            : "number",
        decimals: mapping.value && field === mapping.value && !distinct ? 2 : 0,
        compact: false,
        prefix: "",
        suffix: "",
      },
      measures: [
        {
          id: "primary",
          field,
          aggregation: distinct ? "distinct" : mapping.value ? "sum" : "count",
          label: title,
          color: "#0b9b72",
        },
      ],
      subtitle: `${source.name} · ${field}`,
    });
  };
  add("kpi", mapping.value ? "Vendas informadas" : "Registros recebidos");
  if (mapping.order)
    add(
      "kpi",
      "Pedidos ou atendimentos identificados",
      mapping.order,
      dimension,
      true,
    );
  if (mapping.customer)
    add("kpi", "Clientes identificados", mapping.customer, dimension, true);
  const rankings: Role[] =
    profile.objective === "customers"
      ? ["customer", "product", "seller", "channel"]
      : ["product", "customer", "seller", "channel"];
  const trend = () => {
    if (mapping.date && check.from !== check.to)
      add(
        "line",
        mapping.value
          ? "Vendas ao longo do tempo"
          : "Registros ao longo do tempo",
        metric,
        mapping.date,
      );
  };
  if (profile.objective === "sales") trend();
  for (const role of rankings) {
    const field = mapping[role];
    if (field)
      add(
        "horizontal",
        `${mapping.value ? "Vendas" : "Registros"} por ${field}`,
        metric,
        field,
      );
  }
  if (profile.objective !== "sales") trend();
  if (visuals.length === 1)
    add("table", "Conferência dos dados", metric, dimension);
  return { ...config, visuals };
}
export function salesTemplate(profile: BusinessProfile, example: boolean) {
  const item = profile.segment === "services" ? "Serviço" : "Produto";
  const header = `ID Venda;ID Item;Data;Cliente;${item};Vendedor;Canal;Quantidade;Valor;Custo`;
  return (
    "\uFEFF" +
    header +
    "\r\n" +
    (example
      ? `P001;I001;01/09/2026;Cliente exemplo;${item} A;Equipe A;Venda direta;2;200,00;100,00\r\nP001;I002;01/09/2026;Cliente exemplo;${item} B;Equipe A;Venda direta;1;150,00;80,00\r\nP002;I003;02/09/2026;Outro cliente;${item} A;Equipe B;Online;1;100,00;50,00\r\n`
      : "")
  );
}
