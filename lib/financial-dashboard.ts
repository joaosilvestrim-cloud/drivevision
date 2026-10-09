import { defaultConfig, type Source, type Config } from "./analytics.ts";
import { makeVisual } from "./visual-builder.ts";
export function financialDashboard(source: Source): Config {
  const config = {
    ...defaultConfig(source),
    title:
      source.remoteInfo?.provider === "protheus"
        ? "Protheus · Títulos em aberto"
        : "Conta Azul · Financeiro por vencimento",
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
          prefix: "",
          suffix: "",
        },
      })),
      {
        ...makeVisual("bar", source, config, "ca-receber"),
        numberStyle: {
          kind: "currency",
          decimals: 2,
          compact: false,
          prefix: "",
          suffix: "",
        },
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
        numberStyle: {
          kind: "currency",
          decimals: 2,
          compact: false,
          prefix: "",
          suffix: "",
        },
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
        numberStyle: {
          kind: "currency",
          decimals: 2,
          compact: false,
          prefix: "",
          suffix: "",
        },
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
        text:
          source.remoteInfo?.provider === "protheus"
            ? "Títulos em aberto em moeda 1 (confirme que corresponde a BRL no Protheus), nos tipos selecionados e com vencimento real dentro do período exibido na fonte. Valores vencidos consideram a data da extração, no horário de Brasília. Pessoas e naturezas aparecem por código. Não inclui títulos fora do período, adiantamentos RA/PA, créditos NCC/NDF ou outras moedas. Este painel não representa fluxo de caixa realizado, lucro ou DRE. Confira os totais com o relatório de títulos em aberto do ERP usando os mesmos filtros. Atualizações não alteram a personalização dos gráficos."
            : "Parcelas com vencimento no período escolhido e nos próximos 30 dias. Recebido e pago representam valores acumulados nas parcelas selecionadas, não o fluxo de caixa por data de pagamento. Canceladas, renegociadas e perdidas não entram nos indicadores. Os valores em aberto podem variar até a próxima atualização.",
      },
    ],
  };
}
