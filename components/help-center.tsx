"use client";
import { t as translate, locale } from "@/lib/i18n";
/* eslint-disable @next/next/no-html-link-for-pages */
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  MessageCircle,
  ArrowRight,
  BookOpen,
  Send,
  Headphones,
  CheckCircle2,
  Search,
  RefreshCw,
} from "lucide-react";
import { apiJson, type Account } from "@/lib/cloud-workspace";
import { helpTopics, findHelp } from "@/lib/help-content";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";

const categories: Record<string, string> = {
  comercial: "Conhecer ou contratar",
  acesso: "Conta e acesso",
  assinatura: "Assinatura e cobrança",
  dados: "Importação e dados",
  graficos: "Gráficos e dashboards",
  conexoes: "Conexões e atualização",
  sugestao: "Sugestão de melhoria",
  outro: "Outro assunto",
};
const statuses: Record<string, string> = {
  open: "Aberto",
  progress: "Em atendimento",
  waiting: "Aguardando cliente",
  resolved: "Resolvido",
};
type Ticket = {
  id: string;
  ownerId: string | null;
  name: string;
  email: string;
  company: string;
  phone: string;
  category: string;
  priority: string;
  subject: string;
  description: string;
  steps: string;
  expected: string;
  page: string;
  status: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
};
type Detail = {
  ticket: Ticket;
  messages: { id: string; staff: boolean; body: string; createdAt: string }[];
  notifications?: {
    state: string;
    count: number;
    recipient?: string;
    delivery?: string | null;
    error?: string | null;
  }[];
};
type Listing = {
  tickets: Ticket[];
  pages: number;
  page: number;
  counts: Record<string, number>;
};
const when = (s: string) =>
  new Date(s).toLocaleString(locale(), {
    dateStyle: "short",
    timeStyle: "short",
  });

export function HelpWidget({ account }: { account: Account | null }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="help-launcher"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        <MessageCircle size={21} />
        <span>{translate("Ajuda e contato")}</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="help-dialog">
          <DialogHeader>
            <DialogTitle>{translate("Como podemos ajudar?")}</DialogTitle>
            <DialogDescription>
              {translate(
                " DriveVision · Guias práticos e contato com a DriveData ",
              )}
            </DialogDescription>
          </DialogHeader>
          {open && (
            <HelpCenter key={account?.id || "visitor"} account={account} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
function HelpCenter({ account }: { account: Account | null }) {
  const [tab, setTab] = useState("chat"),
    [query, setQuery] = useState(""),
    [text, setText] = useState("");
  const [chat, setChat] = useState<
    { id: number; question: string; answers: ReturnType<typeof findHelp> }[]
  >([]);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [chat]);
  const topics = query ? findHelp(query) : helpTopics;
  function ask(q: string) {
    if (!q.trim()) return;
    setChat((v) => [
      ...v.slice(-19),
      { id: Date.now(), question: q.trim(), answers: findHelp(q) },
    ]);
    setText("");
  }
  return (
    <div className="help-center">
      <nav className="help-tabs" aria-label={translate("Áreas de ajuda")}>
        {[
          ["chat", "Assistente"],
          ["guides", "Guias"],
          ["contact", "Falar conosco"],
          ...(account ? [["tickets", "Meus chamados"]] : []),
        ].map(([id, label]) => (
          <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>
            {translate(label)}
          </button>
        ))}
      </nav>
      {tab === "chat" && (
        <>
          <div className="help-chat" role="log" aria-live="polite">
            <div className="help-bubble">
              <p>
                {translate(" Olá")}
                {account ? `, ${account.name.split(" ")[0]}` : ""}
                {translate(
                  "! Posso orientar você sobre dados, gráficos, conexões e assinatura. ",
                )}
              </p>
              <small>
                {translate(
                  " Respostas automáticas baseadas nos nossos guias. Não acesso seus arquivos nem sua conta. ",
                )}
              </small>
            </div>
            {chat.map((item) => (
              <div key={item.id}>
                <p className="help-question">{item.question}</p>
                <div className="help-bubble">
                  {item.answers.length ? (
                    item.answers.map((t) => (
                      <section key={t.id}>
                        <strong>{translate(t.title)}</strong>
                        <p>{translate(t.text)}</p>
                        {t.href && (
                          <a href={t.href}>
                            {translate(t.action)} <ArrowRight size={14} />
                          </a>
                        )}
                      </section>
                    ))
                  ) : (
                    <p>
                      {translate(
                        " Não encontrei uma orientação segura para essa dúvida. Use Falar conosco para a equipe analisar seu caso. ",
                      )}
                    </p>
                  )}
                  <button
                    className="help-inline"
                    onClick={() => setTab("contact")}
                  >
                    {translate(" Preciso falar com a equipe ")}
                  </button>
                </div>
              </div>
            ))}
            <div ref={end} />
          </div>
          <div className="help-quick">
            {[
              "Importar Excel ou CSV",
              "Personalizar gráficos",
              "Conectar OneDrive",
              "Cancelar assinatura",
            ].map((q) => (
              <button key={q} onClick={() => ask(translate(q))}>
                {translate(q)}
              </button>
            ))}
          </div>
          <form
            className="help-ask"
            onSubmit={(e) => {
              e.preventDefault();
              ask(text);
            }}
          >
            <input
              aria-label={translate("Sua dúvida")}
              placeholder={translate("Digite sua dúvida…")}
              maxLength={400}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <button
              disabled={!text.trim()}
              aria-label={translate("Enviar dúvida")}
            >
              <Send size={18} />
            </button>
          </form>
          <small>
            {translate(
              " Não envie senhas, cartões ou dados de clientes neste chat. ",
            )}
          </small>
        </>
      )}
      {tab === "guides" && (
        <div className="help-guides">
          <label className="help-search">
            <Search size={17} />
            <input
              aria-label={translate("Buscar orientações")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={translate("Buscar: filtros, planilha, cobrança…")}
            />
          </label>
          {topics.map((t) => (
            <details key={t.id}>
              <summary>
                <BookOpen size={17} />
                <span>
                  <small>{translate(t.group)}</small>
                  {translate(t.title)}
                </span>
              </summary>
              <p>{translate(t.text)}</p>
              {t.href && <a href={t.href}>{translate(t.action)} →</a>}
            </details>
          ))}
          {!topics.length && (
            <p>
              {translate(
                " Nenhum guia encontrado. Nossa equipe pode ajudar pelo formulário. ",
              )}
            </p>
          )}
          <button className="help-primary" onClick={() => setTab("contact")}>
            <Headphones size={18} /> {translate(" Falar com a DriveData ")}
          </button>
        </div>
      )}
      {tab === "contact" && (
        <ContactForm account={account} onTickets={() => setTab("tickets")} />
      )}
      {tab === "tickets" && account && <SupportInbox />}
    </div>
  );
}
function ContactForm({
  account,
  onTickets,
}: {
  account: Account | null;
  onTickets: () => void;
}) {
  const [requestId, setRequestId] = useState(() => crypto.randomUUID()),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [receipt, setReceipt] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const data = Object.fromEntries(form.entries());
      const result = await apiJson<{ id: string }>("support", {
        ...data,
        requestId,
        name: account?.name || data.name,
        email: account?.email || data.email,
        consent: form.get("consent") === "on",
        page: (new URLSearchParams(location.search).get("view") || "inicio")
          .replace(/[^a-z-]/g, "")
          .slice(0, 40),
      });
      setReceipt(result.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (receipt)
    return (
      <div className="help-success" role="status">
        <CheckCircle2 size={36} />
        <h3>{translate("Recebemos seu chamado.")}</h3>
        <p>
          {translate(" Protocolo ")}
          <strong>{receipt}</strong>
        </p>
        <p>
          {account
            ? translate(
                "Acompanhe a resposta e envie informações adicionais em Meus chamados.",
              )
            : translate(
                "A equipe entrará em contato pelo e-mail informado. Guarde seu protocolo.",
              )}
        </p>
        {account && (
          <button className="help-primary" onClick={onTickets}>
            {translate(" Ver meus chamados ")}
          </button>
        )}
        <button
          className="help-inline"
          onClick={() => {
            setReceipt("");
            setRequestId(crypto.randomUUID());
          }}
        >
          {translate(" Abrir outro atendimento ")}
        </button>
      </div>
    );
  return (
    <form className="help-form" onSubmit={submit}>
      <div className="help-callout">
        <Headphones size={24} />
        <div>
          <strong>{translate("Conte com a DriveData.")}</strong>
          <p>
            {translate(
              " Descreva o que precisa. Sua solicitação será registrada para nossa equipe. Campos com * são obrigatórios. ",
            )}
          </p>
        </div>
      </div>
      <div className="help-form-grid">
        <label>
          {translate(" Nome * ")}
          <input
            name="name"
            required
            minLength={2}
            maxLength={120}
            defaultValue={account?.name}
            readOnly={!!account}
            autoComplete="name"
          />
        </label>
        <label>
          {translate(" E-mail de retorno * ")}
          <input
            name="email"
            type="email"
            required
            maxLength={254}
            defaultValue={account?.email}
            readOnly={!!account}
            autoComplete="email"
          />
        </label>
        <label>
          {translate(" Empresa ")}
          <input name="company" maxLength={160} autoComplete="organization" />
        </label>
        <label>
          {translate(" Telefone (opcional) ")}
          <input name="phone" type="tel" maxLength={32} autoComplete="tel" />
        </label>
        <label>
          {translate(" Assunto do atendimento * ")}
          <select name="category" required defaultValue="">
            <option value="" disabled>
              {translate(" Selecione ")}
            </option>
            {Object.entries(categories).map(([v, label]) => (
              <option key={v} value={v}>
                {translate(label)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {translate(" Impacto * ")}
          <select name="priority" defaultValue="normal">
            <option value="normal">{translate("Dúvida ou melhoria")}</option>
            <option value="alta">
              {translate("Não consigo continuar meu trabalho")}
            </option>
          </select>
        </label>
      </div>
      <label>
        {translate(" Título * ")}
        <input
          name="subject"
          placeholder={translate("Ex.: não consigo importar minha planilha")}
          required
          minLength={5}
          maxLength={160}
        />
      </label>
      <label>
        {translate(" Como podemos ajudar? * ")}
        <textarea
          name="description"
          rows={4}
          required
          minLength={20}
          maxLength={5000}
          placeholder={translate(
            "Conte o contexto e descreva sua dúvida ou dificuldade (mínimo de 20 caracteres).",
          )}
        />
      </label>
      <label>
        {translate(" O que você fez antes de acontecer? (opcional) ")}
        <textarea
          name="steps"
          rows={2}
          maxLength={2000}
          placeholder={translate(
            "Informe os passos e a mensagem de erro, se houver.",
          )}
        />
      </label>
      <label>
        {translate(" Qual resultado você esperava? (opcional) ")}
        <textarea name="expected" rows={2} maxLength={1000} />
      </label>
      <label className="help-honey" aria-hidden="true">
        {translate(" Website ")}
        <input name="website" tabIndex={-1} autoComplete="off" />
      </label>
      <p className="help-safety">
        {translate(
          " Não inclua senhas, códigos de acesso, dados de cartão ou dados pessoais dos seus clientes. O suporte não solicita essas informações. ",
        )}
      </p>
      <label className="help-consent">
        <input name="consent" type="checkbox" required />
        <span>
          {translate(
            " Autorizo o uso dos dados deste formulário para atender minha solicitação, conforme a",
          )}{" "}
          <a href="/?view=privacy" target="_blank" rel="noreferrer">
            {translate(" política de privacidade ")}
          </a>
          . *
        </span>
      </label>
      {error && (
        <p role="alert" className="help-error">
          {translate(error)}
        </p>
      )}
      <button className="help-primary" disabled={busy}>
        <Send size={17} />
        {busy
          ? translate("Registrando…")
          : translate("Enviar para a DriveData")}
      </button>
    </form>
  );
}
export function SupportInbox({ admin = false }: { admin?: boolean }) {
  const endpoint = admin ? "admin/support" : "support";
  const [listing, setListing] = useState<Listing | null>(null),
    [status, setStatus] = useState("all"),
    [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<string | null>(() =>
      admin ? new URLSearchParams(location.search).get("ticket") : null,
    ),
    [detail, setDetail] = useState<Detail | null>(null),
    [body, setBody] = useState(""),
    [nextStatus, setNextStatus] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    apiJson<Listing>(
      `${endpoint}?${new URLSearchParams({ status, q: search, page: String(page) })}`,
    )
      .then((d) => {
        if (live) setListing(d);
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [endpoint, status, search, page, revision]);
  useEffect(() => {
    let live = true;
    setDetail(null);
    setBody("");
    if (selected)
      apiJson<Detail>(`${endpoint}?id=${encodeURIComponent(selected)}`)
        .then((d) => {
          if (live) {
            setDetail(d);
            setNextStatus(d.ticket.status);
          }
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    return () => {
      live = false;
    };
  }, [endpoint, selected, revision]);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy || !detail) return;
    setBusy(true);
    setError("");
    try {
      await apiJson(admin ? "admin/support" : "support/reply", {
        id: detail.ticket.id,
        revision: detail.ticket.revision,
        body,
        ...(admin ? { status: nextStatus } : {}),
      });
      setRevision((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className={admin ? "support-admin help-center" : "support-inbox"}
      id={admin ? "support-desk" : undefined}
    >
      <div className="help-inbox-title">
        <div>
          <h2>
            {admin
              ? translate("Central de atendimento")
              : translate("Meus chamados")}
          </h2>
        </div>
        <button
          aria-label={translate("Atualizar chamados")}
          onClick={() => setRevision((v) => v + 1)}
          disabled={busy || loading}
        >
          <RefreshCw size={18} />
        </button>
      </div>
      {admin && (
        <p>
          {translate(
            " Novos chamados e mensagens dos clientes notificam Tamires e João. Respostas abaixo ficam disponíveis para clientes logados. Para visitantes, use o e-mail informado. ",
          )}
        </p>
      )}
      {error && (
        <p role="alert" className="help-error">
          {translate(error)}
        </p>
      )}
      {selected ? (
        <>
          <button className="help-inline" onClick={() => setSelected(null)}>
            {translate(" ← Voltar à lista ")}
          </button>
          {detail ? (
            <article className="support-detail">
              <span className={`support-status ${detail.ticket.status}`}>
                {translate(statuses[detail.ticket.status])}
              </span>
              <h3>{detail.ticket.subject}</h3>
              <small>
                {translate(" Protocolo ")}
                {detail.ticket.id} · {when(detail.ticket.createdAt)}
              </small>
              {admin && (
                <dl className="support-contact">
                  <dt>{translate("Contato")}</dt>
                  <dd>
                    {detail.ticket.name} ·{" "}
                    <a href={`mailto:${detail.ticket.email}`}>
                      {detail.ticket.email}
                    </a>
                  </dd>
                  <dt>{translate("Empresa / telefone")}</dt>
                  <dd>
                    {detail.ticket.company || translate("Não informado")} ·{" "}
                    {detail.ticket.phone || translate("Não informado")}
                  </dd>
                  <dt>{translate("Categoria / impacto")}</dt>
                  <dd>
                    {translate(categories[detail.ticket.category])} ·{" "}
                    {detail.ticket.priority === "alta"
                      ? translate("Trabalho interrompido")
                      : translate("Normal")}
                  </dd>
                  <dt>{translate("Origem")}</dt>
                  <dd>
                    {detail.ticket.ownerId
                      ? translate("Cliente conectado")
                      : translate("Visitante")}{" "}
                    · {detail.ticket.page}
                  </dd>
                  <dt>{translate("Notificações")}</dt>
                  <dd>
                    {detail.notifications
                      ?.map(
                        (n) =>
                          `${n.recipient || "Notificação"}: ${n.delivery === "delivered" || n.delivery === "opened" || n.delivery === "clicked" ? "Entrega confirmada" : n.delivery === "bounced" ? "Devolvida — confira o endereço" : n.delivery === "delivery_delayed" ? "Entrega atrasada" : ({ sent: "Enviada ao provedor", pending: "Na fila", sending: "Em envio", failed: "Falhou — confira o endereço" } as Record<string, string>)[n.state]}`,
                      )
                      .join(" · ") || translate("Nenhuma")}
                  </dd>
                </dl>
              )}
              <p className="support-message">{detail.ticket.description}</p>
              {detail.ticket.steps && (
                <>
                  <strong>{translate("Passos realizados")}</strong>
                  <p className="support-message">{detail.ticket.steps}</p>
                </>
              )}
              {detail.ticket.expected && (
                <>
                  <strong>{translate("Resultado esperado")}</strong>
                  <p className="support-message">{detail.ticket.expected}</p>
                </>
              )}
              {detail.messages.map((m) => (
                <div
                  key={m.id}
                  className={`support-message ${m.staff ? "staff" : ""}`}
                >
                  <small>
                    {m.staff
                      ? translate("Equipe DriveData")
                      : translate("Cliente")}{" "}
                    · {when(m.createdAt)}
                  </small>
                  <p>{m.body}</p>
                </div>
              ))}
              <form className="help-form" onSubmit={save}>
                {admin && !detail.ticket.ownerId ? (
                  <p>
                    {translate(
                      " Este visitante não tem acesso a Meus chamados. Contate-o por e-mail; registre abaixo o retorno para o histórico interno. ",
                    )}
                  </p>
                ) : null}
                <label>
                  {admin
                    ? translate("Resposta / registro do atendimento")
                    : translate("Enviar mais informações")}
                  <textarea
                    rows={3}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    maxLength={5000}
                    required={!admin}
                  />
                </label>
                {admin && (
                  <label>
                    {translate(" Situação ")}
                    <select
                      value={nextStatus}
                      onChange={(e) => setNextStatus(e.target.value)}
                    >
                      {Object.entries(statuses).map(([v, label]) => (
                        <option key={v} value={v}>
                          {translate(label)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <button
                  className="help-primary"
                  disabled={busy || (!admin && !body.trim())}
                >
                  {busy
                    ? translate("Salvando…")
                    : admin
                      ? translate("Salvar atendimento")
                      : translate("Enviar mensagem")}
                </button>
              </form>
            </article>
          ) : (
            <p role="status">{translate("Carregando atendimento…")}</p>
          )}
        </>
      ) : (
        <>
          <form
            className="help-inbox-filters"
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(query);
              setPage(1);
            }}
          >
            <input
              aria-label={translate("Buscar chamados")}
              placeholder={translate("Buscar assunto ou protocolo")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button aria-label={translate("Buscar")}>
              <Search size={18} />
            </button>
            <select
              aria-label={translate("Situação do chamado")}
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">{translate("Todas as situações")}</option>
              {Object.entries(statuses).map(([v, label]) => (
                <option key={v} value={v}>
                  {translate(label)}
                </option>
              ))}
            </select>
          </form>
          {loading ? (
            <p role="status">{translate("Carregando chamados…")}</p>
          ) : listing?.tickets.length ? (
            <>
              <p>
                {listing.counts.total}{" "}
                {translate(" atendimento(s) encontrado(s)")}
              </p>
              <div className="support-list">
                {listing.tickets.map((t) => (
                  <button key={t.id} onClick={() => setSelected(t.id)}>
                    <div>
                      <span className={`support-status ${t.status}`}>
                        {translate(statuses[t.status])}
                      </span>
                      <strong>{t.subject}</strong>
                      <small>
                        {admin ? `${t.name} · ` : ""}
                        {translate(categories[t.category])} ·{" "}
                        {when(t.createdAt)}
                      </small>
                    </div>
                    <ArrowRight size={18} />
                  </button>
                ))}
              </div>
              <div className="help-pagination">
                <button
                  disabled={listing.page <= 1}
                  onClick={() => setPage(listing.page - 1)}
                >
                  {translate(" Anterior ")}
                </button>
                <span>
                  {listing.page} {translate(" de ")}
                  {listing.pages}
                </span>
                <button
                  disabled={listing.page >= listing.pages}
                  onClick={() => setPage(listing.page + 1)}
                >
                  {translate(" Próxima ")}
                </button>
              </div>
            </>
          ) : (
            <p>
              {translate(
                " Nenhum chamado encontrado. Use Falar conosco para abrir um atendimento. ",
              )}
            </p>
          )}
        </>
      )}
    </section>
  );
}
