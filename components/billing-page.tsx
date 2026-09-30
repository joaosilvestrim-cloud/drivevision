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
  new Date(s.length === 10 ? s + "T12:00:00Z" : s).toLocaleDateString("pt-BR");
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
        <span className="sales-eyebrow">SEU ESPAÇO COMEÇA AQUI</span>
        <h1>
          OI, {account.name.split(" ")[0]}.<br />
          <em>
            {data?.access
              ? "SUA ASSINATURA, EM DIA."
              : "VAMOS ATIVAR SUA VISÃO?"}
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
            Sair da conta
          </button>
        </p>
      </div>
      <div className="billing-layout">
        <section className="billing-main">
          <span className="sales-eyebrow">MINHA ASSINATURA</span>
          <h2>
            {!data
              ? "CONSULTANDO…"
              : !data.required
                ? "ACESSO ADMINISTRADO PELA DRIVEDATA"
                : data.access
                  ? "SEU WORKSPACE ESTÁ LIBERADO."
                  : "FALTA SÓ O PAGAMENTO."}
          </h2>
          {!data && !error && <Loader2 className="spin" />}
          {data && (
            <>
              <p>
                {!data.required
                  ? "Seu acesso foi concedido pela administração e não possui renovação automática neste plano."
                  : data.access
                    ? `Acesso disponível até ${date(data.paidUntil!)}. ${data.canceled ? "A renovação está cancelada." : "Sua assinatura renova mensalmente."}`
                    : "O workspace é liberado após o Asaas confirmar o pagamento. Seus dados de cartão são preenchidos no ambiente do Asaas."}
              </p>
              {data.error && (
                <p className="billing-notice" role="status">
                  {data.error}
                </p>
              )}
              {data.access ? (
                <a className="sales-button" href="/?view=studio">
                  Acessar meu workspace <ArrowRight size={18} />
                </a>
              ) : (
                <button
                  className="sales-button"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const result = await apiJson<{ url: string }>(
                        "billing/checkout",
                        {},
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
                    ? "Regularizar pagamento"
                    : "Assinar por R$ 59,90/mês"}
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
                    <RefreshCw size={16} /> Já paguei / atualizar situação
                  </button>
                  {((data.hasSubscription && !data.canceled) ||
                    data.checkoutUrl) && (
                    <button disabled={busy} onClick={() => setConfirm(true)}>
                      Cancelar renovação
                    </button>
                  )}
                </div>
              )}
              {confirm && (
                <div
                  className="billing-confirm"
                  role="group"
                  aria-label="Confirmar cancelamento"
                >
                  <strong>Cancelar a renovação?</strong>
                  <p>
                    Você mantém o acesso até o fim do período pago. Novas
                    cobranças da assinatura serão interrompidas.
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
                      Confirmar cancelamento
                    </button>
                    <button
                      className="sales-link"
                      disabled={busy}
                      onClick={() => setConfirm(false)}
                    >
                      Manter assinatura
                    </button>
                  </div>
                </div>
              )}
              {!!data.payments?.length && (
                <div className="billing-payments">
                  <h3>Seus pagamentos</h3>
                  {data.payments.map((p) => (
                    <div key={p.id}>
                      <span>
                        {date(p.dueDate)}
                        <small>{names[p.status] || "Em processamento"}</small>
                      </span>
                      <strong>
                        {(p.amountCents / 100).toLocaleString("pt-BR", {
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
                          Ver cobrança ↗
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
              {error}
            </p>
          )}
          {!data && error && (
            <button
              className="sales-link"
              disabled={busy}
              onClick={() => void run(load)}
            >
              Tentar novamente
            </button>
          )}
          {notice && (
            <p role="status" className="billing-notice">
              {notice}
            </p>
          )}
        </section>
        <aside className="billing-plan">
          <span className="sales-eyebrow">DRIVEVISION MENSAL</span>
          <div className="sales-price">
            <span>R$</span>
            <strong>59,90</strong>
            <span>/mês</span>
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
                {s}
              </li>
            ))}
          </ul>
          <p>
            <ShieldCheck size={18} /> Pagamento pelo Asaas
          </p>
          <small>
            Uma conta por assinatura. Renovação mensal no cartão, sem
            fidelidade.{" "}
            <a href="/?view=terms" target="_blank" rel="noreferrer">
              Consulte os termos e limites.
            </a>
          </small>
        </aside>
      </div>
      <p className="billing-help">
        Precisa de ajuda com acesso, cobrança ou reembolso?{" "}
        <a href="mailto:suporte@drivedata.com.br">suporte@drivedata.com.br</a>
      </p>
      <PublicFooter />
    </main>
  );
}

export function BillingAdmin() {
  const [data, setData] = useState<{
      configured: boolean;
      counts: { total: number; active: number; canceled: number };
      pendingEvents: number;
      rows: {
        email: string;
        name: string;
        state: string;
        canceled: boolean;
        paidUntil: string | null;
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
          <span className="sales-eyebrow">ASSINATURAS ONLINE · ASAAS</span>
          <h2>VENDAS E LIBERAÇÕES</h2>
        </div>
        <button className="secondary-button" onClick={refresh}>
          <RefreshCw size={16} /> Atualizar
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {data && (
        <>
          <p>
            {data.configured
              ? "Checkout configurado"
              : "Checkout aguardando configuração"}{" "}
            · {data.counts.active} com período pago · {data.counts.total}{" "}
            cadastros online · {data.counts.canceled} renovações canceladas
          </p>
          {data.pendingEvents > 0 && (
            <p role="alert">
              {data.pendingEvents} confirmações exigem atenção. O processamento
              será tentado novamente.
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
                      ? `Pago até ${date(row.paidUntil)}`
                      : "Aguardando pagamento"}
                    <small>
                      {row.canceled ? "Renovação cancelada" : row.error || ""}
                    </small>
                  </span>
                </article>
              ))
            ) : (
              <p>
                Nenhuma assinatura online ainda. Contas criadas manualmente
                continuam sob sua gestão.
              </p>
            )}
          </div>
          <small>
            Mostrando os 100 cadastros online mais recentes. Suspensão
            administrativa e situação de pagamento são controles independentes.
          </small>
        </>
      )}
    </section>
  );
}
