"use client";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  Download,
  Search,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import { t as translate, locale } from "@/lib/i18n";
import { apiJson } from "@/lib/cloud-workspace";
import { toCSV, type Source } from "@/lib/analytics";
import type { ConnectorState } from "@/lib/connector-types";
import {
  financialCents,
  financialHealth,
  financialMetrics,
  reviewFinancialSource,
  selectFinancialTitles,
  type FinancialMetric,
  type FinancialSelection,
  type FinancialReview as Review,
} from "@/lib/financial-review";
import { downloadFile } from "./analytics-studio";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";

const labels: Record<FinancialSelection, string> = {
  all: "Todos os títulos",
  receivable: "A receber",
  payable: "A pagar",
  overdueReceivable: "Recebimentos vencidos",
  overduePayable: "Pagamentos vencidos",
  weekReceivable: "A receber nos próximos 7 dias",
  weekPayable: "A pagar nos próximos 7 dias",
  age1: "Atraso de 1 a 7 dias",
  age8: "Atraso de 8 a 30 dias",
  age31: "Atraso de 31 a 60 dias",
  age61: "Atraso acima de 60 dias",
};
const healthMessages = {
  unknown: "Não foi possível confirmar a situação da conexão.",
  disconnected:
    "Esta fonte está sem atualização automática. Os dados importados continuam disponíveis.",
  paused:
    "Atualização pausada. Retome em Conexões para acompanhar novos dados.",
  error:
    "A última tentativa de atualização falhou. Você está vendo a última carga válida.",
  unscheduled:
    "O agendamento está indisponível. Atualize os dados em Conexões.",
  late: "A atualização está atrasada. Confira a conexão antes de tomar decisões.",
  stale:
    "Esta carga tem mais de 26 horas. Confira a atualização antes de tomar decisões.",
  current: "Carga recente. Os valores representam a data da extração.",
};
const money = (cents: number) =>
  new Intl.NumberFormat(locale(), {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
const date = (iso: string) =>
  new Intl.DateTimeFormat(locale(), { timeZone: "UTC" }).format(
    new Date(iso + "T12:00:00Z"),
  );
const time = (iso: string) => new Date(iso).toLocaleString(locale());

export function FinancialReview({
  source,
  cloud,
  onConnections,
}: {
  source: Source;
  cloud: boolean;
  onConnections: () => void;
}) {
  const review = useMemo(() => reviewFinancialSource(source), [source]);
  const [state, setState] = useState<ConnectorState | null>(null);
  const [checked, setChecked] = useState(false);
  const [retry, setRetry] = useState(0);
  const [clock, setClock] = useState(Date.now);
  const [selection, setSelection] = useState<FinancialSelection | null>(null);
  const [reconcile, setReconcile] = useState(false);
  useEffect(() => {
    let active = true,
      pending = false;
    async function load() {
      if (pending || document.hidden) return;
      setClock(Date.now());
      if (!cloud) {
        setChecked(true);
        return;
      }
      pending = true;
      try {
        const next = await apiJson<ConnectorState>("connectors");
        if (active) setState(next);
      } catch {
        if (active) setState(null);
      } finally {
        pending = false;
        if (active) setChecked(true);
      }
    }
    void load();
    const interval = window.setInterval(load, 60000);
    document.addEventListener("visibilitychange", load);
    return () => {
      active = false;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", load);
    };
  }, [cloud, source.id, retry]);
  const health = financialHealth(source, state, clock);
  if (!review)
    return (
      <p className="connection-alert" role="status">
        {translate(
          "A leitura financeira está indisponível para esta fonte. Confira os dados importados.",
        )}
      </p>
    );
  const info = source.remoteInfo!;
  return (
    <section
      className="financial-review"
      aria-label={translate("Leitura financeira")}
    >
      <div className="financial-heading">
        <div>
          <h2>{translate("Sua situação financeira, explicada")}</h2>
          <p>
            {translate("Clique em um valor para ver os títulos que o compõem.")}
          </p>
        </div>
        <button className="secondary-button" onClick={() => setReconcile(true)}>
          <ShieldCheck size={16} />
          {translate("Conferir com o ERP")}
        </button>
      </div>
      <p className="financial-scope">
        {translate(
          "Base completa importada; filtros e transformações dos gráficos abaixo não alteram esta visão.",
        )}
      </p>
      <div className="financial-kpis">
        {financialMetrics.map((key) => (
          <button
            key={key}
            className={`financial-kpi ${key.includes("overdue") ? "warning" : ""}`}
            onClick={() => setSelection(key)}
          >
            <span>
              {translate(labels[key])}
              {key === "receivable" ? (
                <ArrowDownLeft size={18} />
              ) : key === "payable" ? (
                <ArrowUpRight size={18} />
              ) : null}
            </span>
            <strong>{money(review.totals[key])}</strong>
            <small>{translate("Ver títulos")} →</small>
          </button>
        ))}
      </div>
      <div className="financial-week">
        <CalendarDays size={20} />
        <div>
          <strong>{translate("Agenda de vencimentos")}</strong>
          <p>
            {date(review.reference)} → {date(review.weekEnd)} ·{" "}
            {translate("Inclui a data da extração")}
          </p>
        </div>
        {(["weekReceivable", "weekPayable"] as const).map((key) => (
          <button key={key} onClick={() => setSelection(key)}>
            <span>{translate(labels[key])}</span>
            <strong>{money(review.totals[key])}</strong>
          </button>
        ))}
      </div>
      <details className="financial-aging">
        <summary>{translate("Entender os atrasos")}</summary>
        <p>
          {translate(
            "Saldos vencidos a receber e a pagar, calculados na data da extração.",
          )}
        </p>
        <div className="financial-kpis">
          {(["age1", "age8", "age31", "age61"] as const).map((key) => {
            const titles = selectFinancialTitles(review, key);
            return (
              <button
                key={key}
                className="financial-kpi aging-card"
                onClick={() => setSelection(key)}
              >
                <span>{translate(labels[key])}</span>
                <strong>
                  {translate("A receber")}:{" "}
                  {money(
                    titles
                      .filter((t) => t.side === "Receber")
                      .reduce((s, t) => s + t.balance, 0),
                  )}
                </strong>
                <strong>
                  {translate("A pagar")}:{" "}
                  {money(
                    titles
                      .filter((t) => t.side === "Pagar")
                      .reduce((s, t) => s + t.balance, 0),
                  )}
                </strong>
                <small>
                  {translate("{v0} títulos", { v0: titles.length })}
                </small>
              </button>
            );
          })}
        </div>
      </details>
      <div
        className={`financial-health ${health.status !== "current" ? "attention" : ""}`}
        role="status"
      >
        <div>
          <strong>
            {checked
              ? translate(healthMessages[health.status])
              : translate("Verificando atualização…")}
          </strong>
          <p>
            {translate("Extraído em")}: {time(info.fetchedAt)} ·{" "}
            {translate("Vencimento")}: {info.from} → {info.to}
          </p>
          <p>
            {translate("Empresa / filial · tipos · moeda")}: {info.scope || "—"}
          </p>
          {health.binding?.next_due_at &&
            !health.binding.paused &&
            state?.scheduled && (
              <p>
                {translate("Próxima execução")}:{" "}
                {time(health.binding.next_due_at)}
              </p>
            )}
        </div>
        <div className="financial-actions">
          {checked && !state && cloud && (
            <button
              className="secondary-button"
              onClick={() => setRetry((n) => n + 1)}
            >
              <RefreshCw size={14} />
              {translate("Tentar novamente")}
            </button>
          )}
          <button className="secondary-button" onClick={onConnections}>
            {translate("Gerenciar atualização")}
          </button>
          <button
            className="secondary-button"
            onClick={() => setSelection("all")}
          >
            {translate("Todos os títulos")}
          </button>
        </div>
      </div>
      <p className="financial-scope">
        {translate(
          "Saldos em aberto no recorte importado. Não representa saldo bancário, lucro ou fluxo de caixa realizado. Pessoas são identificadas pelo código do ERP.",
        )}
      </p>
      {selection && (
        <TitleDetails
          key={selection}
          source={source}
          review={review}
          selection={selection}
          onClose={() => setSelection(null)}
        />
      )}
      {reconcile && (
        <Reconciliation
          source={source}
          review={review}
          onClose={() => setReconcile(false)}
        />
      )}
    </section>
  );
}

function TitleDetails({
  source,
  review,
  selection,
  onClose,
}: {
  source: Source;
  review: Review;
  selection: FinancialSelection;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [side, setSide] = useState("all");
  const [page, setPage] = useState(0);
  const rows = useMemo(
    () => selectFinancialTitles(review, selection, query, side),
    [review, selection, query, side],
  );
  const receivable = rows
    .filter((t) => t.side === "Receber")
    .reduce((sum, t) => sum + t.balance, 0);
  const payable = rows
    .filter((t) => t.side === "Pagar")
    .reduce((sum, t) => sum + t.balance, 0);
  const pages = Math.max(1, Math.ceil(rows.length / 25));
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="financial-dialog">
        <DialogHeader>
          <DialogTitle>{translate(labels[selection])}</DialogTitle>
          <DialogDescription>
            {translate(
              "Valores da fonte importada, ordenados pelo vencimento. A exportação inclui todos os resultados filtrados.",
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="financial-filters">
          <label>
            <span>{translate("Buscar título, pessoa ou natureza")}</span>
            <div>
              <Search size={16} />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
                placeholder={translate("Digite um código ou título")}
              />
            </div>
          </label>
          <label>
            <span>{translate("Tipo")}</span>
            <select
              value={side}
              onChange={(e) => {
                setSide(e.target.value);
                setPage(0);
              }}
            >
              <option value="all">{translate("Todos")}</option>
              <option value="Receber">{translate("A receber")}</option>
              <option value="Pagar">{translate("A pagar")}</option>
            </select>
          </label>
          <button
            className="secondary-button"
            disabled={!rows.length}
            onClick={() =>
              downloadFile(
                "protheus-titulos.csv",
                toCSV(
                  source,
                  rows.map((t) => t.row),
                ),
                "text/csv;charset=utf-8",
              )
            }
          >
            <Download size={16} />
            {translate("Exportar títulos")}
          </button>
        </div>
        <p className="financial-result" role="status">
          {translate("{v0} títulos", { v0: rows.length })} ·{" "}
          {translate("A receber")}: <strong>{money(receivable)}</strong> ·{" "}
          {translate("A pagar")}: <strong>{money(payable)}</strong>
        </p>
        <div
          className="financial-table"
          tabIndex={0}
          role="region"
          aria-label={translate("Detalhamento dos títulos")}
        >
          <table>
            <thead>
              <tr>
                {[
                  "Título",
                  "Empresa / filial",
                  "Tipo",
                  "Pessoa / loja",
                  "Natureza",
                  "Vencimento",
                  "Dias de atraso",
                  "Saldo em aberto",
                ].map((label) => (
                  <th key={label}>{translate(label)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(page * 25, (page + 1) * 25).map((t, i) => (
                <tr key={page * 25 + i}>
                  <td>{t.row.Título}</td>
                  <td>
                    {t.row.Empresa} / {t.row.Filial}
                  </td>
                  <td>{translate(t.side)}</td>
                  <td>
                    {t.row.Pessoa} / {t.row.Loja || "—"}
                  </td>
                  <td>{t.row.Natureza || "—"}</td>
                  <td>{date(t.due)}</td>
                  <td>{t.overdueDays || "—"}</td>
                  <td>{money(t.balance)}</td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={8}>
                    {translate("Nenhum título corresponde aos filtros.")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="financial-pagination">
          <button
            className="secondary-button"
            disabled={page === 0}
            onClick={() => setPage((n) => n - 1)}
          >
            {translate("Anterior")}
          </button>
          <span>
            {translate("Página {v0} de {v1}", { v0: page + 1, v1: pages })}
          </span>
          <button
            className="secondary-button"
            disabled={page + 1 >= pages}
            onClick={() => setPage((n) => n + 1)}
          >
            {translate("Próxima")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Reconciliation({
  source,
  review,
  onClose,
}: {
  source: Source;
  review: Review;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Record<FinancialMetric, string>>({
    receivable: "",
    payable: "",
    overdueReceivable: "",
    overduePayable: "",
  });
  const amounts = financialMetrics.map((key) => financialCents(values[key]));
  const complete = amounts.every((n) => n !== null);
  const matched =
    complete &&
    financialMetrics.every((key, i) => review.totals[key] === amounts[i]);
  function exportReport() {
    const content = [
      translate("Conferência de totais Protheus"),
      source.name,
      source.remoteInfo!.scope,
      `${source.remoteInfo!.from} → ${source.remoteInfo!.to}`,
      `${translate("Extraído em")}: ${source.remoteInfo!.fetchedAt}`,
      `${translate("Conferido em")}: ${new Date().toISOString()}`,
      translate(
        "Totais do ERP informados pelo usuário; não é uma auditoria automática do ERP.",
      ),
      "",
      ...financialMetrics.map(
        (key, i) =>
          `${translate(labels[key])}: DriveVision ${money(review.totals[key])} | ERP ${money(amounts[i]!)} | ${translate("Diferença")} ${money(review.totals[key] - amounts[i]!)}`,
      ),
      "",
      translate(matched ? "Totais conferem" : "Há diferenças para investigar"),
    ].join("\n");
    downloadFile(
      "protheus-conferencia.txt",
      content,
      "text/plain;charset=utf-8",
    );
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="financial-dialog reconciliation-dialog">
        <DialogHeader>
          <DialogTitle>{translate("Conferir com o ERP")}</DialogTitle>
          <DialogDescription>
            {translate(
              "Use o relatório de títulos em aberto com a mesma empresa, filial, moeda, tipos e período. Informe os totais correspondentes à data da extração.",
            )}
          </DialogDescription>
        </DialogHeader>
        <p>
          {source.remoteInfo!.scope} · {source.remoteInfo!.from} →{" "}
          {source.remoteInfo!.to}
          <br />
          {translate("Extraído em")}: {time(source.remoteInfo!.fetchedAt)}
        </p>
        <p>
          {translate(
            "Use ponto para os centavos, sem separador de milhares. Exemplo: 1234.56. Os valores digitados ficam apenas nesta conferência.",
          )}
        </p>
        <div className="financial-reconciliation">
          {financialMetrics.map((key, i) => (
            <label key={key}>
              <strong>{translate(labels[key])}</strong>
              <span>DriveVision: {money(review.totals[key])}</span>
              <input
                aria-label={translate("Total no ERP: {v0}", {
                  v0: translate(labels[key]),
                })}
                type="text"
                inputMode="decimal"
                value={values[key]}
                placeholder="0.00"
                onChange={(e) =>
                  setValues((v) => ({ ...v, [key]: e.target.value }))
                }
              />
              <small>
                {amounts[i] === null
                  ? translate(
                      values[key]
                        ? "Informe um valor válido com até duas casas decimais."
                        : "Aguardando total do ERP",
                    )
                  : `${translate("Diferença")}: ${money(review.totals[key] - amounts[i]!)}`}
              </small>
            </label>
          ))}
        </div>
        <p role="status" className="financial-result">
          {translate(
            !complete
              ? "Preencha os quatro totais para concluir a conferência."
              : matched
                ? "Totais conferem"
                : "Há diferenças para investigar",
          )}
        </p>
        <p className="financial-scope">
          {translate(
            "Totais do ERP informados pelo usuário; não é uma auditoria automática do ERP.",
          )}
        </p>
        <button
          className="primary-button"
          disabled={!complete}
          onClick={exportReport}
        >
          <Download size={16} />
          {translate("Baixar conferência")}
        </button>
      </DialogContent>
    </Dialog>
  );
}
