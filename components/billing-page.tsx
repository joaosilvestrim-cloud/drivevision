import { t as translate, locale } from "@/lib/i18n";
/* This Vite application uses native navigation for query-based public routes. */
/* eslint-disable @next/next/no-html-link-for-pages */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  CreditCard,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { apiJson, type Account } from "@/lib/cloud-workspace";
import { PublicHeader, PublicFooter } from "./landing-page";
type Billing = {
  required: boolean;
  access: boolean;
  state: string;
  canceled?: boolean;
  hasSubscription?: boolean;
  paidUntil?: string;
  trialEligible?: boolean;
  trialEndsAt?: string;
  firstChargeDate?: string;
  error?: string;
  checkoutUrl?: string;
  payments?: {
    id: string;
    status: string;
    amountCents: number;
    dueDate: string;
    url: string | null;
  }[];
};
const date = (s: string) =>
  new Date(s.length === 10 ? s + "T12:00:00Z" : s).toLocaleDateString(locale());
const names: Record<string, string> = {
  CONFIRMED: "Confirmado",
  RECEIVED: "Recebido",
  RECEIVED_IN_CASH: "Recebido",
  PENDING: "Aguardando pagamento",
  OVERDUE: "Vencido",
  REFUNDED: "Estornado",
  DELETED: "Cancelado",
  CHARGEBACK_REQUESTED: "Em contestação",
  CHARGEBACK_DISPUTE: "Em contestação",
};
function paymentLink(url: string) {
  try {
    const u = new URL(url);
    if (
      u.protocol === "https:" &&
      ["asaas.com", "www.asaas.com", "sandbox.asaas.com"].includes(
        u.hostname,
      ) &&
      !u.username &&
      !u.password
    )
      return u.href;
  } catch {}
  throw new Error("O endereço de pagamento não pôde ser validado.");
}
export function BillingPage({
  account,
  onLogout,
}: {
  account: Account;
  onLogout: () => void;
}) {
  const [data, setData] = useState<Billing | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState(false),
    [acceptedTrial, setAcceptedTrial] = useState(false),
    [notice, setNotice] = useState("");
  const returned = useRef(false);
  const load = useCallback(async () => {
    setData(await apiJson<Billing>("billing"));
  }, []);
  useEffect(() => {
    let live = true;
    async function initial() {
      try {
        const d = await apiJson<Billing>("billing");
        if (live) setData(d);
      } catch (e) {
        if (live)
          setError(
            e instanceof Error
              ? e.message
              : "Não foi possível consultar sua assinatura.",
          );
      }
    }
    void initial();
    const timer = setInterval(() => {
      if (!document.hidden) void initial();
    }, 15000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível concluir.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (
      data?.required &&
      !returned.current &&
      new URLSearchParams(location.search).get("payment") === "return"
    ) {
      returned.current = true;
      apiJson<Billing>("billing/sync", {})
        .then(setData)
        .catch((e) =>
          setError(
            e instanceof Error
              ? e.message
              : "Não foi possível consultar o pagamento.",
          ),
        );
    }
  }, [data?.required]);
  return (
    <main className="sales-page billing-page">
      <PublicHeader />
      <div className="billing-heading">
        <h1>
          {translate(" OI, ")}
          {account.name.split(" ")[0]}.<br />
          <em>
            {data?.access
              ? data.state === "trialing"
                ? translate("SEU TESTE ESTÁ LIBERADO.")
                : translate("SUA ASSINATURA, EM DIA.")
              : translate("VAMOS ATIVAR SUA VISÃO?")}
          </em>
        </h1>
        <p>
          {account.email} ·{" "}
          <button
            onClick={() =>
              void run(async () => {
                await apiJson("logout", {});
                onLogout();
              })
            }
            disabled={busy}
          >
            {translate(" Sair da conta ")}
          </button>
        </p>
      </div>
      <div className="billing-layout">
        <section className="billing-main">
          <h2>
            {!data
              ? translate("CONSULTANDO…")
              : !data.required
                ? translate("ACESSO ADMINISTRADO PELA DRIVEDATA")
                : data.access
                  ? translate("SEU WORKSPACE ESTÁ LIBERADO.")
                  : data.trialEligible
                    ? translate("COMECE SEUS 7 DIAS GRÁTIS.")
                    : translate("FALTA SÓ O PAGAMENTO.")}
          </h2>
          {!data && !error && <Loader2 className="spin" />}
          {data && (
            <>
              <p>
                {!data.required
                  ? translate(
                      "Seu acesso foi concedido pela administração e não possui renovação automática neste plano.",
                    )
                  : data.access
                    ? translate("Acesso disponível até {v0}. {v1}", {
                        v0: date(
                          data.state === "trialing"
                            ? data.trialEndsAt!
                            : data.paidUntil!,
                        ),
                        v1: data.canceled
                          ? translate(
                              "A renovação está cancelada; não haverá nova cobrança.",
                            )
                          : data.state === "trialing"
                            ? translate(
                                "Após o teste, R$ 59,90/mês no cartão cadastrado. Cancele antes dessa data para não cobrar.",
                              )
                            : translate("Sua assinatura renova mensalmente."),
                      })
                    : data.trialEligible
                      ? translate(
                          "Cadastre seu cartão no ambiente seguro do Asaas. Primeira cobrança prevista para {v0}; depois, R$ 59,90/mês automaticamente. Confira a data no checkout. O acesso é liberado após a confirmação do cadastro do cartão.",
                          { v0: date(data.firstChargeDate!) },
                        )
                      : translate(
                          "O workspace é liberado após o Asaas confirmar o pagamento. Seus dados de cartão são preenchidos no ambiente do Asaas.",
                        )}
              </p>
              {data.error && (
                <p className="billing-notice" role="status">
                  {data.error}
                </p>
              )}
              {data.trialEligible && !data.access && (
                <label
                  className="help-consent"
                  style={{ display: "flex", gap: 10, margin: "18px 0" }}
                >
                  <input
                    type="checkbox"
                    checked={acceptedTrial}
                    onChange={(e) => setAcceptedTrial(e.target.checked)}
                  />
                  <span>
                    {translate(
                      " Autorizo a cobrança automática de R$ 59,90/mês após os 7 dias grátis, salvo cancelamento antes da primeira cobrança. ",
                    )}
                  </span>
                </label>
              )}
              {data.access ? (
                <a className="sales-button" href="/?view=studio">
                  {translate(" Acessar meu workspace ")}
                  <ArrowRight size={18} />
                </a>
              ) : (
                <button
                  className="sales-button"
                  disabled={busy || (!!data.trialEligible && !acceptedTrial)}
                  onClick={() =>
                    void run(async () => {
                      const result = await apiJson<{ url: string }>(
                        "billing/checkout",
                        { acceptedTrial },
                      );
                      location.assign(paymentLink(result.url));
                    })
                  }
                >
                  {busy ? (
                    <Loader2 size={18} className="spin" />
                  ) : (
                    <CreditCard size={19} />
                  )}{" "}
                  {data.hasSubscription && !data.canceled
                    ? translate("Regularizar pagamento")
                    : data.trialEligible
                      ? translate("Cadastrar cartão e testar grátis")
                      : translate("Assinar por R$ 59,90/mês")}
                </button>
              )}
              {data.required && (
                <div className="billing-controls">
                  <button
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        setData(await apiJson<Billing>("billing/sync", {}));
                        setNotice("Situação consultada no Asaas.");
                      })
                    }
                  >
                    <RefreshCw size={16} /> {translate(" Atualizar situação ")}
                  </button>
                  {((data.hasSubscription && !data.canceled) ||
                    data.checkoutUrl) && (
                    <button disabled={busy} onClick={() => setConfirm(true)}>
                      {translate(" Cancelar renovação ")}
                    </button>
                  )}
                </div>
              )}
              {confirm && (
                <div
                  className="billing-confirm"
                  role="group"
                  aria-label={translate("Confirmar cancelamento")}
                >
                  <strong>{translate("Cancelar a renovação?")}</strong>
                  <p>
                    {translate(
                      " Você mantém o acesso até o fim do teste ou do período pago. Novas cobranças da assinatura serão interrompidas. ",
                    )}
                  </p>
                  <div>
                    <button
                      className="sales-button"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await apiJson("billing/cancel", {});
                          await load();
                          setConfirm(false);
                          setNotice("Renovação cancelada.");
                        })
                      }
                    >
                      {translate(" Confirmar cancelamento ")}
                    </button>
                    <button
                      className="sales-link"
                      disabled={busy}
                      onClick={() => setConfirm(false)}
                    >
                      {translate(" Manter assinatura ")}
                    </button>
                  </div>
                </div>
              )}
              {!!data.payments?.length && (
                <div className="billing-payments">
                  <h3>{translate("Seus pagamentos")}</h3>
                  {data.payments.map((p) => (
                    <div key={p.id}>
                      <span>
                        {date(p.dueDate)}
                        <small>
                          {translate(names[p.status] || "Em processamento")}
                        </small>
                      </span>
                      <strong>
                        {(p.amountCents / 100).toLocaleString(locale(), {
                          style: "currency",
                          currency: "BRL",
                        })}
                      </strong>
                      {p.url && (
                        <a
                          href={paymentLink(p.url)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {translate(" Ver cobrança ↗ ")}
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          {error && (
            <p className="billing-error" role="alert">
              {translate(error)}
            </p>
          )}
          {!data && error && (
            <button
              className="sales-link"
              disabled={busy}
              onClick={() => void run(load)}
            >
              {translate(" Tentar novamente ")}
            </button>
          )}
          {notice && (
            <p role="status" className="billing-notice">
              {translate(notice)}
            </p>
          )}
        </section>
        <aside className="billing-plan">
          <div className="sales-price">
            <span>{translate("R$")}</span>
            <strong>59,90</strong>
            <span>{translate("/mês")}</span>
          </div>
          <ul>
            {[
              "Workspace privado",
              "Dashboards e gráficos personalizáveis",
              "Excel e CSV",
              "OneDrive e SharePoint",
              "Atualizações agendadas",
            ].map((s) => (
              <li key={s}>
                <Check size={16} />
                {translate(s)}
              </li>
            ))}
          </ul>
          <p>
            <ShieldCheck size={18} /> {translate(" Pagamento pelo Asaas ")}
          </p>
          <small>
            {translate(
              " Uma conta por assinatura. Renovação mensal no cartão, sem fidelidade.",
            )}{" "}
            <a href="/?view=terms" target="_blank" rel="noreferrer">
              {translate(" Consulte os termos e limites. ")}
            </a>
          </small>
        </aside>
      </div>
      <p className="billing-help">
        {translate(" Precisa de ajuda com acesso, cobrança ou reembolso?")}{" "}
        <a href="mailto:suporte@drivedata.com.br">
          {translate("suporte@drivedata.com.br")}
        </a>
      </p>
      <PublicFooter />
    </main>
  );
}

export function BillingAdmin() {
  const [data, setData] = useState<{
      configured: boolean;
      counts: {
        total: number;
        active: number;
        trialing: number;
        canceled: number;
      };
      pendingEvents: number;
      rows: {
        email: string;
        name: string;
        state: string;
        canceled: boolean;
        paidUntil: string | null;
        trialEndsAt: string | null;
        error: string | null;
      }[];
    } | null>(null),
    [error, setError] = useState("");
  const refresh = useCallback(() => {
    apiJson<NonNullable<typeof data>>("admin/billing")
      .then((value) => {
        setData(value);
        setError("");
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(refresh, [refresh]);
  return (
    <section className="billing-admin">
      <div>
        <div>
          <h2>{translate("VENDAS E LIBERAÇÕES")}</h2>
        </div>
        <button className="secondary-button" onClick={refresh}>
          <RefreshCw size={16} /> {translate(" Atualizar ")}
        </button>
      </div>
      {error && <p role="alert">{translate(error)}</p>}
      {data && (
        <>
          <p>
            {data.configured
              ? translate("Checkout configurado")
              : translate("Checkout aguardando configuração")}{" "}
            · {data.counts.active} {translate(" com período pago · ")}
            {data.counts.trialing} {translate(" em teste · ")}
            {data.counts.total} {translate(" cadastros online ·")}{" "}
            {data.counts.canceled} {translate(" renovações canceladas ")}
          </p>
          {data.pendingEvents > 0 && (
            <p role="alert">
              {data.pendingEvents}{" "}
              {translate(
                " confirmações exigem atenção. O processamento será tentado novamente. ",
              )}
            </p>
          )}
          <div className="billing-admin-table">
            {data.rows.length ? (
              data.rows.map((row) => (
                <article key={row.email}>
                  <span>
                    <strong>{row.name}</strong>
                    <small>{row.email}</small>
                  </span>
                  <span>
                    {row.paidUntil && new Date(row.paidUntil) > new Date()
                      ? translate("Pago até {v0}", { v0: date(row.paidUntil) })
                      : row.trialEndsAt &&
                          new Date(row.trialEndsAt) > new Date()
                        ? translate("Em teste até {v0}", {
                            v0: date(row.trialEndsAt),
                          })
                        : translate("Aguardando pagamento")}
                    <small>
                      {row.canceled
                        ? translate("Renovação cancelada")
                        : row.error || ""}
                    </small>
                  </span>
                </article>
              ))
            ) : (
              <p>
                {translate(
                  " Nenhuma assinatura online ainda. Contas criadas manualmente continuam sob sua gestão. ",
                )}
              </p>
            )}
          </div>
          <small>
            {translate(
              " Mostrando os 100 cadastros online mais recentes. Suspensão administrativa e situação de pagamento são controles independentes. ",
            )}
          </small>
        </>
      )}
    </section>
  );
}
