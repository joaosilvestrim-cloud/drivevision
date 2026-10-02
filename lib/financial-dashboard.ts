import { defaultConfig, type Source, type Config } from "./analytics.ts";
import { makeVisual } from "./visual-builder.ts";
export function financialDashboard(source: Source): Config {
  const config = {
    ...defaultConfig(source),
    title: "Conta Azul · Financeiro por vencimento",
    metric: "A receber",
    dimension: "Vencimento",
    period: "all" as const,
  };
  const kpis = [
    "A receber",
    "A pagar",
    "Recebimentos vencidos",
    "Pagamentos vencidos",
  ];
  return {
    ...config,
    visuals: [
      ...kpis.map((metric, i) => ({
        ...makeVisual("kpi", source, { ...config, metric }, "ca-kpi-" + i),
        title: metric,
        span: 6 as const,
        numberStyle: {
          kind: "currency" as const,
          decimals: 2,
          compact: false,
          prefix: "R$ ",
          suffix: "",
        },
      })),
      {
        ...makeVisual("bar", source, config, "ca-receber"),
        title: "A receber por vencimento",
        span: 6 as const,
      },
      {
        ...makeVisual(
          "bar",
          source,
          { ...config, metric: "A pagar" },
          "ca-pagar",
        ),
        title: "A pagar por vencimento",
        span: 6 as const,
      },
      {
        ...makeVisual(
          "table",
          source,
          { ...config, dimension: "Pessoa" },
          "ca-pessoas",
        ),
        title: "Contas a receber por pessoa",
        filters: {
          mode: "and",
          rules: [
            {
              id: "ca-receber-only",
              field: "Tipo",
              op: "eq",
              value: "Receber",
            },
          ],
        },
        span: 12 as const,
      },
      {
        ...makeVisual("text", source, config, "ca-notas"),
        title: "Como ler este painel",
        span: 12 as const,
        text: "Parcelas com vencimento no período escolhido e nos próximos 30 dias. Recebido e pago representam valores acumulados nas parcelas selecionadas, não o fluxo de caixa por data de pagamento. Canceladas, renegociadas e perdidas não entram nos indicadores. Os valores em aberto podem variar até a próxima atualização.",
      },
    ],
  };
}
