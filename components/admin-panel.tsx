"use client";
import { t as translate, locale } from "@/lib/i18n";
import { SupportInbox } from "./help-center";
import { EmailAdmin } from "./email-access";
("use client");
import { BillingAdmin } from "./billing-page";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  Building2,
  Check,
  Copy,
  History,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import { apiJson } from "@/lib/cloud-workspace";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Client = {
  id: string;
  name: string;
  contact: string;
  email: string;
  plan: string;
  revision: number;
  status: "active" | "suspended";
  pending: boolean;
  access: boolean;
  confirmed: boolean;
  createdAt: string;
};
type Listing = {
  clients: Client[];
  counts: { total: number; active: number; suspended: number; pending: number };
  page: number;
  pages: number;
};
type Invitation = { invitationUrl: string; expiresAt: string };
type Audit = {
  id: string;
  action: string;
  actor: string | null;
  createdAt: string;
  details: {
    before?: { name: string; plan: string; status: string };
    after?: { name: string; plan: string; status: string };
  };
};
const date = (value: string) =>
  new Date(value).toLocaleString(locale(), {
    dateStyle: "short",
    timeStyle: "short",
  });
const statusName = (value: string) =>
  value === "suspended" ? "Suspensa" : "Ativa";
const emptyForm = {
  name: "",
  contact: "",
  email: "",
  plan: "Manual",
  status: "active" as "active" | "suspended",
};

export function AdminPanel() {
  const [listing, setListing] = useState<Listing | null>(null);
  const [query, setQuery] = useState(""),
    [search, setSearch] = useState("");
  const [status, setStatus] = useState("all"),
    [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [editor, setEditor] = useState<Client | "new" | null>(null);
  const [form, setForm] = useState(emptyForm),
    [formError, setFormError] = useState("");
  const [invitation, setInvitation] = useState<Invitation | null>(null),
    [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<{
    client: Client;
    events: Audit[];
  } | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const sequence = useRef(0),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      sequence.current++;
    };
  }, []);
  const load = useCallback(async () => {
    const request = ++sequence.current;
    setLoading(true);
    setError("");
    try {
      const result = await apiJson<Listing>(
        `admin/clients?${new URLSearchParams({ q: search, status, page: String(page) })}`,
      );
      if (request === sequence.current && mounted.current) setListing(result);
    } catch (e) {
      if (request === sequence.current && mounted.current)
        setError((e as Error).message);
    } finally {
      if (request === sequence.current && mounted.current) setLoading(false);
    }
  }, [search, status, page]);
  useEffect(() => {
    void load();
  }, [load]);
  function edit(client: Client | "new") {
    setEditor(client);
    setForm(
      client === "new"
        ? emptyForm
        : {
            name: client.name,
            contact: client.contact,
            email: client.email,
            plan: client.plan,
            status: client.status,
          },
    );
    setFormError("");
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editor || busy) return;
    setBusy(true);
    setFormError("");
    setNotice("");
    try {
      if (editor === "new") {
        const value = await apiJson<Invitation>("admin/clients", {
          name: form.name,
          contact: form.contact,
          email: form.email,
          plan: form.plan,
        });
        setInvitation(value);
        setCopied(false);
        setNotice("Cliente criado. Compartilhe o convite com o responsável.");
      } else {
        await apiJson("admin/clients/update", {
          id: editor.id,
          revision: editor.revision,
          name: form.name,
          plan: form.plan,
          status: form.status,
        });
        setNotice("Cadastro e acesso atualizados.");
      }
      setEditor(null);
      await load();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function invite(client: Client) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      setInvitation(
        await apiJson<Invitation>("admin/clients/invite", {
          id: client.id,
          revision: client.revision,
        }),
      );
      setCopied(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function showHistory(client: Client) {
    setHistory({ client, events: [] });
    setHistoryLoading(true);
    setError("");
    try {
      const result = await apiJson<{ events: Audit[] }>(
        `admin/audit?id=${client.id}`,
      );
      setHistory((current) =>
        current?.client.id === client.id
          ? { client, events: result.events }
          : current,
      );
    } catch (e) {
      setError((e as Error).message);
      setHistory(null);
    } finally {
      setHistoryLoading(false);
    }
  }
  return (
    <section
      className="client-admin"
      aria-label={translate("Administração de clientes")}
    >
      <div className="admin-banner">
        <div>
          <h2>
            {translate(" Cada cliente. ")}
            <br />
            {translate(" Seu próprio espaço. ")}
          </h2>
          <p>
            {translate(
              " Ambientes separados, gestão centralizada. Você controla quem entra e quando. ",
            )}
          </p>
        </div>
        <button className="primary-button" onClick={() => edit("new")}>
          <Plus size={18} /> {translate(" Novo cliente ")}
        </button>
      </div>
      <SupportInbox admin />
      <BillingAdmin />
      <EmailAdmin />
      <div
        className="admin-metrics"
        aria-label={translate("Resumo dos resultados filtrados")}
      >
        {[
          ["Clientes", listing?.counts.total, Users],
          ["Contas ativas", listing?.counts.active, Check],
          ["Suspensos", listing?.counts.suspended, ShieldCheck],
          ["Aguardando ativação", listing?.counts.pending, Building2],
        ].map(([label, value, Icon]) => {
          const Symbol = Icon as typeof Users;
          return (
            <article key={String(label)}>
              <Symbol size={19} />
              <strong>
                {loading ? "…" : value === undefined ? "—" : String(value)}
              </strong>
              <span>{String(label)}</span>
            </article>
          );
        })}
      </div>
      <div className="admin-clients">
        <div className="admin-toolbar">
          <div>
            <h2>{translate("Seus clientes")}</h2>
            <p>
              {translate(
                "Cadastre novos ambientes conforme seu negócio cresce.",
              )}
            </p>
          </div>
          <button
            className="secondary-button"
            disabled={loading || busy}
            onClick={() => void load()}
          >
            <RefreshCw size={15} /> {translate(" Atualizar lista ")}
          </button>
        </div>
        <form
          className="admin-filters"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setSearch(query);
          }}
        >
          <label className="admin-search">
            <Search size={18} />
            <input
              aria-label={translate("Buscar clientes")}
              placeholder={translate("Empresa, responsável ou e-mail")}
              value={query}
              maxLength={120}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <button className="secondary-button" type="submit" disabled={loading}>
            {translate(" Buscar ")}
          </button>
          <label className="admin-filter-status">
            <span>{translate("Situação da conta")}</span>
            <select
              aria-label={translate("Filtrar por situação da conta")}
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">{translate("Todos")}</option>
              <option value="active">{translate("Contas ativas")}</option>
              <option value="suspended">{translate("Suspensos")}</option>
              <option value="pending">
                {translate("Aguardando ativação")}
              </option>
            </select>
          </label>
        </form>
        {error && (
          <div className="inline-error" role="alert">
            {translate(error)}
          </div>
        )}
        {notice && (
          <p className="admin-notice" role="status">
            {translate(notice)}
          </p>
        )}
        {loading ? (
          <div className="admin-empty" role="status">
            <Loader2 className="animate-spin" size={22} />{" "}
            {translate(" Carregando clientes… ")}
          </div>
        ) : !listing?.clients.length ? (
          <div className="admin-empty">
            <Building2 size={30} />
            <h3>
              {error
                ? translate("Lista indisponível")
                : translate("Nenhum cliente encontrado")}
            </h3>
            <p>
              {error
                ? translate("Tente atualizar a lista novamente.")
                : translate(
                    "Ajuste os filtros ou cadastre o primeiro cliente.",
                  )}
            </p>
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table>
              <caption className="sr-only">
                {translate(" Clientes cadastrados e controle de acesso ")}
              </caption>
              <thead>
                <tr>
                  <th>{translate("Cliente / responsável")}</th>
                  <th>{translate("Plano")}</th>
                  <th>{translate("Acesso")}</th>
                  <th>{translate("Cadastro")}</th>
                  <th>{translate("Ações")}</th>
                </tr>
              </thead>
              <tbody>
                {listing.clients.map((client) => (
                  <tr key={client.id}>
                    <td>
                      <strong>{client.name}</strong>
                      <span>{client.contact}</span>
                      <span>{client.email}</span>
                    </td>
                    <td>
                      <span className="admin-plan">{client.plan}</span>
                    </td>
                    <td>
                      <span className={`admin-status ${client.status}`}>
                        {client.status === "suspended"
                          ? translate("Suspenso")
                          : client.pending
                            ? translate("Aguardando ativação")
                            : !client.confirmed
                              ? translate("Confirmar e-mail")
                              : client.access
                                ? translate("Liberado")
                                : translate("Pagamento pendente")}
                      </span>
                    </td>
                    <td>{date(client.createdAt)}</td>
                    <td>
                      <div className="admin-row-actions">
                        <button
                          className="secondary-button"
                          disabled={busy}
                          onClick={() => edit(client)}
                          aria-label={translate("Gerenciar {v0}", {
                            v0: client.name,
                          })}
                        >
                          {translate(" Gerenciar ")}
                        </button>
                        <button
                          className="admin-icon"
                          aria-label={translate("Histórico de {v0}", {
                            v0: client.name,
                          })}
                          onClick={() => void showHistory(client)}
                        >
                          <History size={18} />
                        </button>
                        {client.pending && client.status === "active" && (
                          <button
                            className="admin-link"
                            disabled={busy}
                            onClick={() => void invite(client)}
                          >
                            {translate(" Gerar novo convite ")}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {listing && !loading && (
          <div className="admin-pagination">
            <span>
              {listing.counts.total} {translate(" cliente(s) · Página ")}
              {listing.page} {translate(" de")} {listing.pages}
            </span>
            <div>
              <button
                className="secondary-button"
                disabled={listing.page <= 1}
                onClick={() => setPage(listing.page - 1)}
              >
                {translate(" Anterior ")}
              </button>
              <button
                className="secondary-button"
                disabled={listing.page >= listing.pages}
                onClick={() => setPage(listing.page + 1)}
              >
                {translate(" Próxima ")}
              </button>
            </div>
          </div>
        )}
      </div>
      <p className="admin-footnote">
        {translate(
          " Contas criadas aqui têm acesso manual. Compras pela página pública são liberadas automaticamente pelo Asaas após o pagamento. ",
        )}
      </p>
      <Dialog
        open={editor !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setEditor(null);
        }}
      >
        <DialogContent className="admin-dialog">
          <DialogHeader>
            <DialogTitle>
              {editor === "new"
                ? translate("Novo cliente")
                : translate("Gerenciar cliente")}
            </DialogTitle>
            <DialogDescription>
              {editor === "new"
                ? translate(
                    "Crie um ambiente exclusivo. O responsável recebe um link para definir a própria senha.",
                  )
                : translate(
                    "Atualize o cadastro ou controle o acesso. Os dados são preservados ao suspender.",
                  )}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="admin-form">
            <label>
              {translate(" Nome da empresa ")}
              <input
                required
                minLength={2}
                maxLength={120}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label>
              {translate(" Responsável ")}
              <input
                required
                disabled={editor !== "new"}
                minLength={2}
                maxLength={100}
                value={form.contact}
                onChange={(e) => setForm({ ...form, contact: e.target.value })}
              />
            </label>
            <label>
              {translate(" E-mail de acesso ")}
              <input
                required
                type="email"
                disabled={editor !== "new"}
                maxLength={254}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </label>
            <label>
              {translate(" Plano / identificação comercial ")}
              <input
                required
                maxLength={80}
                value={form.plan}
                onChange={(e) => setForm({ ...form, plan: e.target.value })}
              />
            </label>
            {editor !== "new" && (
              <label>
                {translate(" Acesso ao ambiente ")}
                <select
                  value={form.status}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      status: e.target.value as "active" | "suspended",
                    })
                  }
                >
                  <option value="active">{translate("Conta ativa")}</option>
                  <option value="suspended">{translate("Suspenso")}</option>
                </select>
              </label>
            )}
            {form.status === "suspended" && (
              <p className="admin-warning">
                {translate(
                  " Ao salvar, as sessões serão encerradas e as atualizações automáticas ficarão bloqueadas. As bases e dashboards continuam armazenados. ",
                )}
              </p>
            )}
            {formError && (
              <p className="inline-error" role="alert">
                {translate(formError)}
              </p>
            )}
            <div className="admin-dialog-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={() => setEditor(null)}
              >
                {translate(" Cancelar ")}
              </button>
              <button type="submit" className="primary-button" disabled={busy}>
                {busy ? (
                  <Loader2 size={17} className="animate-spin" />
                ) : (
                  <Check size={17} />
                )}
                {editor === "new"
                  ? translate("Criar cliente e convite")
                  : translate("Salvar alterações")}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!invitation}
        onOpenChange={(open) => {
          if (!open) setInvitation(null);
        }}
      >
        <DialogContent className="admin-dialog">
          <DialogHeader>
            <DialogTitle>{translate("Convite de acesso pronto")}</DialogTitle>
            <DialogDescription>
              {translate(
                " Compartilhe este link somente com o responsável. Ele poderá definir sua senha e acessar o ambiente. ",
              )}
            </DialogDescription>
          </DialogHeader>
          {invitation && (
            <>
              <label className="admin-invitation">
                {translate(" Link de ativação ")}
                <input
                  readOnly
                  value={invitation.invitationUrl}
                  onFocus={(e) => e.target.select()}
                />
              </label>
              <p>
                {translate(" Válido até ")}
                {date(invitation.expiresAt)}
                {translate(
                  ". Uso único. Um novo convite invalida o anterior. ",
                )}
              </p>
              <button
                className="primary-button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      invitation.invitationUrl,
                    );
                    setCopied(true);
                  } catch {
                    setCopied(false);
                    setNotice("Selecione o link e copie manualmente.");
                  }
                }}
              >
                {copied ? <Check size={17} /> : <Copy size={17} />}
                {copied
                  ? translate("Link copiado")
                  : translate("Copiar convite")}
              </button>
              <p className="admin-footnote">
                {translate(
                  " O link é exibido apenas agora. Nenhum e-mail é enviado automaticamente. ",
                )}
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!history}
        onOpenChange={(open) => {
          if (!open) setHistory(null);
        }}
      >
        <DialogContent className="admin-dialog">
          <DialogHeader>
            <DialogTitle>{translate("Histórico administrativo")}</DialogTitle>
            <DialogDescription>
              {history?.client.name} {translate(" · Últimas 50 ações ")}
            </DialogDescription>
          </DialogHeader>
          {historyLoading ? (
            <p role="status">{translate("Carregando histórico…")}</p>
          ) : !history?.events.length ? (
            <p>
              {translate(
                " Nenhuma ação registrada. Cadastros anteriores à administração podem não ter histórico. ",
              )}
            </p>
          ) : (
            <ol className="admin-history">
              {history.events.map((e) => (
                <li key={e.id}>
                  <strong>
                    {(
                      {
                        created: "Cliente cadastrado",
                        updated: "Cadastro atualizado",
                        invited: "Novo convite gerado",
                      } as Record<string, string>
                    )[e.action] || e.action}
                  </strong>
                  <span>
                    {e.actor || translate("Administrador")} ·{" "}
                    {date(e.createdAt)}
                  </span>
                  {e.details.after && (
                    <p>
                      {e.details.after.name} {translate(" · Plano: ")}
                      {e.details.after.plan} ·{" "}
                      {statusName(e.details.after.status)}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
