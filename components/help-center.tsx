"use client";
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
  new Date(s).toLocaleString("pt-BR", {
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
        <span>Ajuda e contato</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="help-dialog">
          <DialogHeader>
            <DialogTitle>Como podemos ajudar?</DialogTitle>
            <DialogDescription>
              DriveVision · Guias práticos e contato com a DriveData
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
      <nav className="help-tabs" aria-label="Áreas de ajuda">
        {[
          ["chat", "Assistente"],
          ["guides", "Guias"],
          ["contact", "Falar conosco"],
          ...(account ? [["tickets", "Meus chamados"]] : []),
        ].map(([id, label]) => (
          <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>
      {tab === "chat" && (
        <>
          <div className="help-chat" role="log" aria-live="polite">
            <div className="help-bubble">
              <span className="help-kicker">ASSISTENTE DRIVEVISION</span>
              <p>
                Olá{account ? `, ${account.name.split(" ")[0]}` : ""}! Posso
                orientar você sobre dados, gráficos, conexões e assinatura.
              </p>
              <small>
                Respostas automáticas baseadas nos nossos guias. Não acesso seus
                arquivos nem sua conta.
              </small>
            </div>
            {chat.map((item) => (
              <div key={item.id}>
                <p className="help-question">{item.question}</p>
                <div className="help-bubble">
                  {item.answers.length ? (
                    item.answers.map((t) => (
                      <section key={t.id}>
                        <strong>{t.title}</strong>
                        <p>{t.text}</p>
                        {t.href && (
                          <a href={t.href}>
                            {t.action} <ArrowRight size={14} />
                          </a>
                        )}
                      </section>
                    ))
                  ) : (
                    <p>
                      Não encontrei uma orientação segura para essa dúvida. Use
                      Falar conosco para a equipe analisar seu caso.
                    </p>
                  )}
                  <button
                    className="help-inline"
                    onClick={() => setTab("contact")}
                  >
                    Preciso falar com a equipe
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
              <button key={q} onClick={() => ask(q)}>
                {q}
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
              aria-label="Sua dúvida"
              placeholder="Digite sua dúvida…"
              maxLength={400}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <button disabled={!text.trim()} aria-label="Enviar dúvida">
              <Send size={18} />
            </button>
          </form>
          <small>
            Não envie senhas, cartões ou dados de clientes neste chat.
          </small>
        </>
      )}
      {tab === "guides" && (
        <div className="help-guides">
          <label className="help-search">
            <Search size={17} />
            <input
              aria-label="Buscar orientações"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar: filtros, planilha, cobrança…"
            />
          </label>
          {topics.map((t) => (
            <details key={t.id}>
              <summary>
                <BookOpen size={17} />
                <span>
                  <small>{t.group}</small>
                  {t.title}
                </span>
              </summary>
              <p>{t.text}</p>
              {t.href && <a href={t.href}>{t.action} →</a>}
            </details>
          ))}
          {!topics.length && (
            <p>
              Nenhum guia encontrado. Nossa equipe pode ajudar pelo formulário.
            </p>
          )}
          <button className="help-primary" onClick={() => setTab("contact")}>
            <Headphones size={18} /> Falar com a DriveData
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
        <h3>Recebemos seu chamado.</h3>
        <p>
          Protocolo <strong>{receipt}</strong>
        </p>
        <p>
          {account
            ? "Acompanhe a resposta e envie informações adicionais em Meus chamados."
            : "A equipe entrará em contato pelo e-mail informado. Guarde seu protocolo."}
        </p>
        {account && (
          <button className="help-primary" onClick={onTickets}>
            Ver meus chamados
          </button>
        )}
        <button
          className="help-inline"
          onClick={() => {
            setReceipt("");
            setRequestId(crypto.randomUUID());
          }}
        >
          Abrir outro atendimento
        </button>
      </div>
    );
  return (
    <form className="help-form" onSubmit={submit}>
      <div className="help-callout">
        <Headphones size={24} />
        <div>
          <strong>Conte com a DriveData.</strong>
          <p>
            Descreva o que precisa. Sua solicitação será registrada para nossa
            equipe. Campos com * são obrigatórios.
          </p>
        </div>
      </div>
      <div className="help-form-grid">
        <label>
          Nome *
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
          E-mail de retorno *
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
          Empresa
          <input name="company" maxLength={160} autoComplete="organization" />
        </label>
        <label>
          Telefone (opcional)
          <input name="phone" type="tel" maxLength={32} autoComplete="tel" />
        </label>
        <label>
          Assunto do atendimento *
          <select name="category" required defaultValue="">
            <option value="" disabled>
              Selecione
            </option>
            {Object.entries(categories).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Impacto *
          <select name="priority" defaultValue="normal">
            <option value="normal">Dúvida ou melhoria</option>
            <option value="alta">Não consigo continuar meu trabalho</option>
          </select>
        </label>
      </div>
      <label>
        Título *
        <input
          name="subject"
          placeholder="Ex.: não consigo importar minha planilha"
          required
          minLength={5}
          maxLength={160}
        />
      </label>
      <label>
        Como podemos ajudar? *
        <textarea
          name="description"
          rows={4}
          required
          minLength={20}
          maxLength={5000}
          placeholder="Conte o contexto e descreva sua dúvida ou dificuldade (mínimo de 20 caracteres)."
        />
      </label>
      <label>
        O que você fez antes de acontecer? (opcional)
        <textarea
          name="steps"
          rows={2}
          maxLength={2000}
          placeholder="Informe os passos e a mensagem de erro, se houver."
        />
      </label>
      <label>
        Qual resultado você esperava? (opcional)
        <textarea name="expected" rows={2} maxLength={1000} />
      </label>
      <label className="help-honey" aria-hidden="true">
        Website
        <input name="website" tabIndex={-1} autoComplete="off" />
      </label>
      <p className="help-safety">
        Não inclua senhas, códigos de acesso, dados de cartão ou dados pessoais
        dos seus clientes. O suporte não solicita essas informações.
      </p>
      <label className="help-consent">
        <input name="consent" type="checkbox" required />
        <span>
          Autorizo o uso dos dados deste formulário para atender minha
          solicitação, conforme a{" "}
          <a href="/?view=privacy" target="_blank" rel="noreferrer">
            política de privacidade
          </a>
          . *
        </span>
      </label>
      {error && (
        <p role="alert" className="help-error">
          {error}
        </p>
      )}
      <button className="help-primary" disabled={busy}>
        <Send size={17} />
        {busy ? "Registrando…" : "Enviar para a DriveData"}
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
          <span className="help-kicker">
            {admin ? "RELACIONAMENTO COM CLIENTES" : "SEU ATENDIMENTO"}
          </span>
          <h2>{admin ? "Central de atendimento" : "Meus chamados"}</h2>
        </div>
        <button
          aria-label="Atualizar chamados"
          onClick={() => setRevision((v) => v + 1)}
          disabled={busy || loading}
        >
          <RefreshCw size={18} />
        </button>
      </div>
      {admin && (
        <p>
          Novos chamados e mensagens dos clientes notificam Tamires e João.
          Respostas abaixo ficam disponíveis para clientes logados. Para
          visitantes, use o e-mail informado.
        </p>
      )}
      {error && (
        <p role="alert" className="help-error">
          {error}
        </p>
      )}
      {selected ? (
        <>
          <button className="help-inline" onClick={() => setSelected(null)}>
            ← Voltar à lista
          </button>
          {detail ? (
            <article className="support-detail">
              <span className={`support-status ${detail.ticket.status}`}>
                {statuses[detail.ticket.status]}
              </span>
              <h3>{detail.ticket.subject}</h3>
              <small>
                Protocolo {detail.ticket.id} · {when(detail.ticket.createdAt)}
              </small>
              {admin && (
                <dl className="support-contact">
                  <dt>Contato</dt>
                  <dd>
                    {detail.ticket.name} ·{" "}
                    <a href={`mailto:${detail.ticket.email}`}>
                      {detail.ticket.email}
                    </a>
                  </dd>
                  <dt>Empresa / telefone</dt>
                  <dd>
                    {detail.ticket.company || "Não informado"} ·{" "}
                    {detail.ticket.phone || "Não informado"}
                  </dd>
                  <dt>Categoria / impacto</dt>
                  <dd>
                    {categories[detail.ticket.category]} ·{" "}
                    {detail.ticket.priority === "alta"
                      ? "Trabalho interrompido"
                      : "Normal"}
                  </dd>
                  <dt>Origem</dt>
                  <dd>
                    {detail.ticket.ownerId ? "Cliente conectado" : "Visitante"}{" "}
                    · {detail.ticket.page}
                  </dd>
                  <dt>Notificações</dt>
                  <dd>
                    {detail.notifications
                      ?.map(
                        (n) =>
                          `${n.recipient || "Notificação"}: ${n.delivery === "delivered" || n.delivery === "opened" || n.delivery === "clicked" ? "Entrega confirmada" : n.delivery === "bounced" ? "Devolvida — confira o endereço" : n.delivery === "delivery_delayed" ? "Entrega atrasada" : ({ sent: "Enviada ao provedor", pending: "Na fila", sending: "Em envio", failed: "Falhou — confira o endereço" } as Record<string, string>)[n.state]}`,
                      )
                      .join(" · ") || "Nenhuma"}
                  </dd>
                </dl>
              )}
              <p className="support-message">{detail.ticket.description}</p>
              {detail.ticket.steps && (
                <>
                  <strong>Passos realizados</strong>
                  <p className="support-message">{detail.ticket.steps}</p>
                </>
              )}
              {detail.ticket.expected && (
                <>
                  <strong>Resultado esperado</strong>
                  <p className="support-message">{detail.ticket.expected}</p>
                </>
              )}
              {detail.messages.map((m) => (
                <div
                  key={m.id}
                  className={`support-message ${m.staff ? "staff" : ""}`}
                >
                  <small>
                    {m.staff ? "Equipe DriveData" : "Cliente"} ·{" "}
                    {when(m.createdAt)}
                  </small>
                  <p>{m.body}</p>
                </div>
              ))}
              <form className="help-form" onSubmit={save}>
                {admin && !detail.ticket.ownerId ? (
                  <p>
                    Este visitante não tem acesso a Meus chamados. Contate-o por
                    e-mail; registre abaixo o retorno para o histórico interno.
                  </p>
                ) : null}
                <label>
                  {admin
                    ? "Resposta / registro do atendimento"
                    : "Enviar mais informações"}
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
                    Situação
                    <select
                      value={nextStatus}
                      onChange={(e) => setNextStatus(e.target.value)}
                    >
                      {Object.entries(statuses).map(([v, label]) => (
                        <option key={v} value={v}>
                          {label}
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
                    ? "Salvando…"
                    : admin
                      ? "Salvar atendimento"
                      : "Enviar mensagem"}
                </button>
              </form>
            </article>
          ) : (
            <p role="status">Carregando atendimento…</p>
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
              aria-label="Buscar chamados"
              placeholder="Buscar assunto ou protocolo"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button aria-label="Buscar">
              <Search size={18} />
            </button>
            <select
              aria-label="Situação do chamado"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">Todas as situações</option>
              {Object.entries(statuses).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </form>
          {loading ? (
            <p role="status">Carregando chamados…</p>
          ) : listing?.tickets.length ? (
            <>
              <p>{listing.counts.total} atendimento(s) encontrado(s)</p>
              <div className="support-list">
                {listing.tickets.map((t) => (
                  <button key={t.id} onClick={() => setSelected(t.id)}>
                    <div>
                      <span className={`support-status ${t.status}`}>
                        {statuses[t.status]}
                      </span>
                      <strong>{t.subject}</strong>
                      <small>
                        {admin ? `${t.name} · ` : ""}
                        {categories[t.category]} · {when(t.createdAt)}
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
                  Anterior
                </button>
                <span>
                  {listing.page} de {listing.pages}
                </span>
                <button
                  disabled={listing.page >= listing.pages}
                  onClick={() => setPage(listing.page + 1)}
                >
                  Próxima
                </button>
              </div>
            </>
          ) : (
            <p>
              Nenhum chamado encontrado. Use Falar conosco para abrir um
              atendimento.
            </p>
          )}
        </>
      )}
    </section>
  );
}
