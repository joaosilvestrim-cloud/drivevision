"use client";
import { useCallback, useEffect, useState } from "react";
import {
  Cloud,
  Folder,
  FileSpreadsheet,
  ArrowLeft,
  ArrowRight,
  RefreshCw,
  Pause,
  Play,
  History,
  Unplug,
  Settings2,
  CheckCircle2,
  Clock3,
  AlertCircle,
  Plus,
} from "lucide-react";
import { apiJson } from "@/lib/cloud-workspace";
import { validTimeZone } from "@/lib/refresh-schedule";
import type {
  Provider,
  RemoteItem,
  RemoteOptions,
  ConnectorState,
  CloudConnection,
  CloudBinding,
  CloudRun,
} from "@/lib/connector-types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";

const labels: Record<Provider, string> = {
  sharepoint: "SharePoint",
  onedrive: "OneDrive",
  google: "Google Drive",
};
const intervals = [
  { value: 15, label: "A cada 15 minutos" },
  { value: 60, label: "A cada hora" },
  { value: 360, label: "A cada 6 horas" },
  { value: 1440, label: "Diariamente" },
];
type Preview = {
  item: RemoteItem;
  sample: string;
  options: RemoteOptions;
  sheets: string[];
  columns: string[];
  rows: Record<string, string>[];
  rowCount: number;
};
const when = (value: string | null) =>
  value ? new Date(value).toLocaleString("pt-BR") : "Ainda não atualizado";
const overdue = (b: CloudBinding) =>
  !b.paused &&
  !!b.next_due_at &&
  Date.parse(b.next_due_at) < Date.now() - 5 * 60000;
function callbackMessage() {
  if (typeof location === "undefined") return "";
  const value = new URLSearchParams(location.search).get("connection");
  if (value === "error")
    return "Não foi possível concluir a autorização. Tente conectar novamente e confira as permissões.";
  if (value === "cancelled")
    return "Conexão cancelada. Nenhum arquivo foi importado.";
  return "";
}
export function CloudConnections({
  cloud,
  onLogin,
  onReload,
  onAnalyze,
  locked,
}: {
  cloud: boolean;
  onLogin: () => void;
  onReload: () => Promise<void>;
  onAnalyze: (id: string) => void;
  locked: boolean;
}) {
  const [state, setState] = useState<ConnectorState | null>(null),
    [error, setError] = useState(callbackMessage),
    [busy, setBusy] = useState("");
  const [browser, setBrowser] = useState<CloudConnection | null>(null),
    [editing, setEditing] = useState<CloudBinding | null>(null),
    [history, setHistory] = useState<{
      binding: CloudBinding;
      runs: CloudRun[];
    } | null>(null);
  const [confirm, setConfirm] = useState<{
    kind: "disconnect" | "remove";
    id: string;
    name: string;
  } | null>(null);
  const load = useCallback(async () => {
    const result = await apiJson<ConnectorState>("connectors");
    setState(result);
  }, []);
  useEffect(() => {
    let live = true;
    if (cloud)
      apiJson<ConnectorState>("connectors")
        .then((data) => {
          if (live) setState(data);
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    return () => {
      live = false;
    };
  }, [cloud]);
  useEffect(() => {
    const value = new URLSearchParams(location.search).get("connection");
    if (value) historyReplace();
  }, []);
  async function action(key: string, fn: () => Promise<void>) {
    if (busy) return;
    setBusy(key);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível concluir.");
    } finally {
      setBusy("");
    }
  }
  async function sync(id: string) {
    await action(id, async () => {
      try {
        await apiJson("connectors/sync", { id });
        await onReload();
      } finally {
        await load();
      }
    });
  }
  if (!cloud)
    return (
      <section className="connections-empty">
        <Cloud size={36} />
        <h2>Seus dados continuam conectados.</h2>
        <p>
          Entre na sua conta para conectar SharePoint ou OneDrive e atualizar
          suas análises.
        </p>
        <button className="primary-button" onClick={onLogin}>
          Entrar para conectar <ArrowRight size={16} />
        </button>
      </section>
    );
  return (
    <div className="connections-page">
      <section className="connection-intro">
        <div>
          <span className="eyebrow">DA ORIGEM AO DASHBOARD</span>
          <h2>
            Escolha uma vez.
            <br />
            Acompanhe sempre.
          </h2>
          <p>
            Conecte uma conta, selecione o conteúdo e mantenha suas análises
            atualizadas. Você decide o que acompanhar.
          </p>
        </div>
        <div className="connection-steps">
          <span>
            <b>01</b> Autorize a leitura
          </span>
          <span>
            <b>02</b> Escolha arquivo ou pasta
          </span>
          <span>
            <b>03</b> Defina sua atualização
          </span>
        </div>
      </section>
      {error && (
        <div className="connection-alert" role="alert">
          <AlertCircle size={18} />
          <span>{error}</span>
          <button
            className="text-button"
            onClick={() => action("reload", load)}
          >
            Tentar novamente
          </button>
        </div>
      )}
      <div className="provider-grid">
        {(["sharepoint", "onedrive", "google"] as Provider[]).map((p) => {
          const comingSoon = p === "google";
          const ready =
            !comingSoon && state?.providers.find((v) => v.id === p)?.configured;
          return (
            <article className="provider-card" key={p}>
              <span className={`provider-symbol ${p}`} aria-hidden="true">
                {p === "sharepoint" ? "S" : p === "onedrive" ? <Cloud /> : "G"}
              </span>
              <h3>{labels[p]}</h3>
              <p>
                {p === "sharepoint"
                  ? "Sites, bibliotecas e pastas da sua organização."
                  : p === "onedrive"
                    ? "Planilhas e arquivos da sua conta Microsoft."
                    : "Arquivos, drives compartilhados e Google Sheets."}
              </p>
              <span className="connection-tag">
                {comingSoon ? "Em breve" : "Somente leitura"}
              </span>
              <button
                className="secondary-button"
                disabled={!!busy || !state || !ready}
                onClick={() =>
                  action(p, async () => {
                    const result = await apiJson<{ url: string }>(
                      "connectors/start",
                      { provider: p },
                    );
                    location.assign(result.url);
                  })
                }
              >
                {comingSoon
                  ? "Em breve"
                  : busy === p
                    ? "Abrindo autorização…"
                    : ready
                      ? "Conectar conta"
                      : "Aguardando configuração"}
                <Plus size={15} />
              </button>
              {state && !ready && !comingSoon && (
                <small>
                  A integração precisa ser habilitada pelo administrador.
                </small>
              )}
            </article>
          );
        })}
        <article className="provider-card">
          <span className="provider-symbol" aria-hidden="true">
            ↔
          </span>
          <h3>APIs externas</h3>
          <p>Integrações diretas com outros sistemas e serviços.</p>
          <span className="connection-tag">Em breve</span>
          <button className="secondary-button" disabled>
            Em breve <Plus size={15} />
          </button>
        </article>
      </div>
      <section className="connected-accounts">
        <div className="connections-section-title">
          <h2>Contas conectadas</h2>
          <button
            className="text-button"
            disabled={!!busy}
            onClick={() => action("reload", load)}
          >
            <RefreshCw size={15} /> Atualizar lista
          </button>
        </div>
        {!state ? (
          <p role="status">Carregando conexões…</p>
        ) : !state.connections.length ? (
          <p className="connection-muted">
            Nenhuma conta conectada. Seus arquivos só serão lidos após a
            autorização e a seleção do conteúdo.
          </p>
        ) : (
          state.connections.map((c) => (
            <article key={c.id} className="connection-account">
              <span
                className={`provider-symbol ${c.provider}`}
                aria-hidden="true"
              >
                {c.provider === "google" ? (
                  "G"
                ) : c.provider === "sharepoint" ? (
                  "S"
                ) : (
                  <Cloud />
                )}
              </span>
              <div>
                <h3>{labels[c.provider]}</h3>
                <p>{c.label}</p>
              </div>
              <button
                className="primary-button"
                disabled={!!busy || locked}
                onClick={() => setBrowser(c)}
              >
                <Folder size={16} /> Escolher conteúdo
              </button>
              <button
                className="text-button"
                aria-label={`Desconectar ${c.label}`}
                disabled={!!busy}
                onClick={() =>
                  setConfirm({ kind: "disconnect", id: c.id, name: c.label })
                }
              >
                <Unplug size={17} />
              </button>
            </article>
          ))
        )}
      </section>
      <section>
        <div className="connections-section-title">
          <h2>Conteúdo acompanhado</h2>
          <span className="connection-tag">
            <Clock3 size={13} />{" "}
            {state?.scheduled
              ? "Atualização em segundo plano"
              : "Atualização manual disponível"}
          </span>
        </div>
        {locked && (
          <p className="connection-alert">
            Salve seu rascunho antes de atualizar as fontes nesta tela.
          </p>
        )}
        {state && !state.scheduled && (
          <p className="connection-muted">
            O agendamento será ativado quando o administrador concluir a
            configuração. Até lá, use “Atualizar agora”.
          </p>
        )}
        {!state?.bindings.length ? (
          <div className="connections-empty compact">
            <FileSpreadsheet size={28} />
            <h3>Uma origem. Análises sempre à mão.</h3>
            <p>
              Escolha um arquivo ou uma pasta em uma conta conectada para
              começar.
            </p>
          </div>
        ) : (
          <div className="watched-grid">
            {state.bindings.map((b) => (
              <article className="watched-card" key={b.id}>
                <div className="watched-heading">
                  <span className="connection-tag">
                    {b.target.kind === "folder" ? (
                      <Folder size={13} />
                    ) : (
                      <FileSpreadsheet size={13} />
                    )}{" "}
                    {b.target.kind === "folder" ? "Pasta" : "Arquivo"}
                  </span>
                  <span
                    className={`connection-state ${b.last_error ? "error" : ""}`}
                  >
                    {b.paused
                      ? "Pausado"
                      : b.last_error
                        ? "Precisa de atenção"
                        : state.scheduled && overdue(b)
                          ? "Atualização atrasada"
                          : b.last_success_at
                            ? "Atualizado"
                            : "Primeira atualização pendente"}
                  </span>
                </div>
                <h3>{b.name}</h3>
                <p className="connection-path">
                  {b.target.name} · Aba {b.options.sheet}
                </p>
                <dl>
                  <div>
                    <dt>Seleção</dt>
                    <dd>
                      Linha {b.options.header} · colunas {b.options.left}–
                      {b.options.right}
                      {b.options.end
                        ? ` · até a linha ${b.options.end}`
                        : " · novas linhas incluídas"}
                    </dd>
                  </div>
                  <div>
                    <dt>Frequência</dt>
                    <dd>
                      {b.interval_minutes === 1440 && b.options.daily
                        ? `Todos os dias às ${b.options.daily.time} · ${b.options.daily.timeZone}`
                        : b.interval_minutes === 1440
                          ? "A cada 24 horas"
                          : intervals.find(
                              (i) => i.value === b.interval_minutes,
                            )?.label}
                    </dd>
                  </div>
                  <div>
                    <dt>Última atualização</dt>
                    <dd>{when(b.last_success_at)}</dd>
                  </div>
                  <div>
                    <dt>Última verificação</dt>
                    <dd>{when(b.last_checked_at)}</dd>
                  </div>
                  <div>
                    <dt>
                      {b.last_error ? "Próxima tentativa" : "Próxima execução"}
                    </dt>
                    <dd>
                      {b.paused
                        ? "Pausada"
                        : !state.scheduled
                          ? "Agendamento não ativado"
                          : b.next_due_at
                            ? `${when(b.next_due_at)} (horário deste dispositivo)`
                            : "Aguardando programação"}
                    </dd>
                  </div>
                </dl>
                {state.scheduled && overdue(b) && (
                  <p className="connection-alert" role="status">
                    A execução prevista está atrasada. Os gráficos mantêm os
                    dados da última carga concluída. Você pode usar Atualizar
                    agora.
                  </p>
                )}
                {b.last_error && (
                  <p className="connection-alert" role="status">
                    {b.last_error}
                  </p>
                )}
                <div className="watched-actions">
                  <button
                    className="primary-button"
                    disabled={!!busy || locked}
                    onClick={() => sync(b.id)}
                  >
                    <RefreshCw
                      size={15}
                      className={busy === b.id ? "spin" : ""}
                    />
                    {busy === b.id ? "Atualizando…" : "Atualizar agora"}
                  </button>
                  {b.last_success_at && (
                    <button
                      className="secondary-button"
                      onClick={() => onAnalyze(b.source_id)}
                    >
                      Analisar <ArrowRight size={15} />
                    </button>
                  )}
                  <button
                    className="text-button"
                    disabled={!!busy}
                    onClick={() =>
                      action("pause", async () => {
                        await apiJson("connectors/update", {
                          id: b.id,
                          paused: !b.paused,
                          interval: b.interval_minutes,
                        });
                        await load();
                      })
                    }
                  >
                    {b.paused ? <Play size={15} /> : <Pause size={15} />}{" "}
                    {b.paused ? "Retomar" : "Pausar"}
                  </button>
                  <button
                    className="text-button"
                    disabled={!!busy || locked}
                    onClick={() => setEditing(b)}
                  >
                    <Settings2 size={15} /> Seleção
                  </button>
                  <button
                    className="text-button"
                    disabled={!!busy}
                    onClick={() =>
                      action("history", async () => {
                        const result = await apiJson<{ runs: CloudRun[] }>(
                          "connectors/history",
                          { id: b.id },
                        );
                        setHistory({ binding: b, runs: result.runs });
                      })
                    }
                  >
                    <History size={15} /> Histórico
                  </button>
                  <button
                    className="text-button"
                    disabled={!!busy}
                    onClick={() =>
                      setConfirm({ kind: "remove", id: b.id, name: b.name })
                    }
                  >
                    Parar acompanhamento
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      {(browser || editing) && (
        <RemoteBrowser
          connection={
            browser ||
            state!.connections.find((c) => c.id === editing!.connection_id)!
          }
          binding={editing || undefined}
          onClose={() => {
            setBrowser(null);
            setEditing(null);
          }}
          onCreated={async (id) => {
            setBrowser(null);
            setEditing(null);
            await load();
            await sync(id);
          }}
        />
      )}
      {history && (
        <Dialog open onOpenChange={() => setHistory(null)}>
          <DialogContent className="connection-dialog">
            <DialogHeader>
              <DialogTitle>Histórico · {history.binding.name}</DialogTitle>
              <DialogDescription>
                Últimas 30 verificações desta fonte.
              </DialogDescription>
            </DialogHeader>
            <div className="connection-history">
              {!history.runs.length ? (
                <p>Nenhuma verificação realizada.</p>
              ) : (
                history.runs.map((r) => (
                  <article key={r.id}>
                    {r.status === "error" ? (
                      <AlertCircle size={18} />
                    ) : (
                      <CheckCircle2 size={18} />
                    )}
                    <div>
                      <strong>{r.message}</strong>
                      <p>
                        {when(r.created_at)}
                        {r.rows_count !== null
                          ? ` · ${r.rows_count.toLocaleString("pt-BR")} linhas`
                          : ""}
                      </p>
                    </div>
                  </article>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
      {confirm && (
        <Dialog open onOpenChange={() => setConfirm(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {confirm.kind === "disconnect"
                  ? "Desconectar conta?"
                  : "Parar acompanhamento?"}
              </DialogTitle>
              <DialogDescription>
                {confirm.name}. As atualizações serão interrompidas. Os dados e
                dashboards já importados serão mantidos no workspace.
              </DialogDescription>
            </DialogHeader>
            <div className="watched-actions">
              <button
                className="secondary-button"
                onClick={() => setConfirm(null)}
              >
                Cancelar
              </button>
              <button
                className="primary-button"
                disabled={!!busy}
                onClick={() =>
                  action("remove", async () => {
                    await apiJson(`connectors/${confirm.kind}`, {
                      id: confirm.id,
                    });
                    setConfirm(null);
                    await load();
                  })
                }
              >
                Confirmar
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
function historyReplace() {
  const url = new URL(location.href);
  url.searchParams.delete("connection");
  window.history.replaceState(null, "", url.pathname + url.search);
}
function RemoteBrowser({
  connection,
  binding,
  onClose,
  onCreated,
}: {
  connection: CloudConnection;
  binding?: CloudBinding;
  onClose: () => void;
  onCreated: (id: string) => Promise<void>;
}) {
  const [path, setPath] = useState<RemoteItem[]>([]),
    [items, setItems] = useState<RemoteItem[]>([]),
    [next, setNext] = useState<string | undefined>(),
    [search, setSearch] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null),
    [selection, setSelection] = useState<RemoteItem | null>(
      binding?.target || null,
    ),
    [options, setOptions] = useState<RemoteOptions | null>(
      binding?.options || null,
    ),
    [name, setName] = useState(binding?.name || ""),
    [interval, setInterval] = useState(binding?.interval_minutes || 1440);
  const [dailyTime, setDailyTime] = useState(
    binding?.options.daily?.time || "07:00",
  );
  const [timeZone, setTimeZone] = useState(
    binding?.options.daily?.timeZone || "America/Sao_Paulo",
  );
  const [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [reviewed, setReviewed] = useState(false);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível ler o conteúdo.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function list(target?: RemoteItem, page?: string) {
    const r = await apiJson<{ items: RemoteItem[]; next?: string }>(
      "connectors/browse",
      { connectionId: connection.id, target, page, search },
    );
    setItems((old) => (page ? [...old, ...r.items] : r.items));
    setNext(r.next);
  }
  async function inspect(target: RemoteItem, custom?: RemoteOptions) {
    const p = await apiJson<Preview>("connectors/preview", {
      connectionId: connection.id,
      target,
      options: custom,
    });
    setPreview(p);
    setOptions(p.options);
    setSelection(p.item);
    if (!name) setName(p.item.name.replace(/\.[^.]+$/, ""));
    setReviewed(true);
  }
  useEffect(() => {
    let live = true;
    const request = binding
      ? apiJson<Preview>("connectors/preview", {
          connectionId: connection.id,
          target: binding.target,
          options: binding.options,
        }).then((p) => {
          if (!live) return;
          setPreview(p);
          setOptions(p.options);
          setSelection(p.item);
          setReviewed(true);
        })
      : apiJson<{ items: RemoteItem[]; next?: string }>("connectors/browse", {
          connectionId: connection.id,
        }).then((r) => {
          if (!live) return;
          setItems(r.items);
          setNext(r.next);
        });
    request
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [binding, connection.id]);
  const current = path[path.length - 1];
  function change(p: Partial<RemoteOptions>) {
    if (options) {
      setOptions({ ...options, ...p });
      setReviewed(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={() => {
        if (!busy) onClose();
      }}
    >
      <DialogContent className="connection-browser">
        <DialogHeader>
          <DialogTitle>
            {selection
              ? "Defina o que acompanhar"
              : `Escolher conteúdo · ${labels[connection.provider]}`}
          </DialogTitle>
          <DialogDescription>
            {selection
              ? "Revise a prévia. Esta seleção será repetida a cada atualização."
              : `${connection.label} · Somente os arquivos selecionados serão importados.`}
          </DialogDescription>
        </DialogHeader>
        {error && (
          <div className="connection-alert" role="alert">
            {error}
          </div>
        )}
        {!selection ? (
          <>
            <div className="remote-toolbar">
              <button
                className="secondary-button"
                disabled={busy || !path.length}
                onClick={() =>
                  run(async () => {
                    const p = path.slice(0, -1);
                    await list(p[p.length - 1]);
                    setPath(p);
                  })
                }
              >
                <ArrowLeft size={15} /> Voltar
              </button>
              <strong>{current?.name || "Escolha uma biblioteca"}</strong>
              {current?.kind === "folder" && (
                <button
                  className="primary-button"
                  disabled={busy}
                  onClick={() => run(() => inspect(current))}
                >
                  Acompanhar esta pasta
                </button>
              )}
            </div>
            {connection.provider === "sharepoint" && !path.length && (
              <form
                className="remote-search"
                onSubmit={(e) => {
                  e.preventDefault();
                  run(() => list());
                }}
              >
                <label htmlFor="site-search">Buscar site SharePoint</label>
                <input
                  id="site-search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Nome do site"
                />
                <button className="secondary-button" disabled={busy}>
                  Buscar
                </button>
              </form>
            )}
            <div className="remote-list" aria-busy={busy}>
              {!items.length && !busy ? (
                <p>Nenhum arquivo compatível ou pasta nesta seleção.</p>
              ) : (
                items.map((i) => (
                  <button
                    key={i.id}
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        if (i.kind === "file") await inspect(i);
                        else {
                          await list(i);
                          setPath((p) => [...p, i]);
                        }
                      })
                    }
                  >
                    {i.kind === "file" ? (
                      <FileSpreadsheet size={20} />
                    ) : (
                      <Folder size={20} />
                    )}
                    <span>
                      {i.name}
                      <small>
                        {i.kind === "file"
                          ? "Planilha"
                          : i.kind === "site"
                            ? "Site"
                            : i.kind === "drive"
                              ? "Biblioteca"
                              : "Pasta"}
                      </small>
                    </span>
                    <ArrowRight size={16} />
                  </button>
                ))
              )}
            </div>
            {next && (
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => run(() => list(current, next))}
              >
                Carregar mais
              </button>
            )}
          </>
        ) : (
          options && (
            <>
              <div className="remote-selection">
                <span className="connection-tag">
                  {selection.kind === "folder"
                    ? "Pasta · arquivos diretamente dentro dela"
                    : "Arquivo selecionado"}
                </span>
                <strong>{selection.name}</strong>
                {!binding && (
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => {
                      setSelection(null);
                      setPreview(null);
                      setOptions(null);
                    }}
                  >
                    Trocar seleção
                  </button>
                )}
              </div>
              <div className="remote-fields">
                <label>
                  Nome da fonte
                  <input
                    value={name}
                    maxLength={300}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <label>
                  Aba
                  <select
                    value={options.sheet}
                    onChange={(e) => change({ sheet: e.target.value })}
                  >
                    {preview?.sheets.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Linha do cabeçalho
                  <input
                    type="number"
                    min={1}
                    max={20000}
                    value={options.header}
                    onChange={(e) => change({ header: Number(e.target.value) })}
                  />
                </label>
                <label>
                  Primeira coluna (número)
                  <input
                    type="number"
                    min={1}
                    max={160}
                    value={options.left}
                    onChange={(e) => change({ left: Number(e.target.value) })}
                  />
                </label>
                <label>
                  Última coluna (número)
                  <input
                    type="number"
                    min={options.left}
                    max={160}
                    value={options.right}
                    onChange={(e) => change({ right: Number(e.target.value) })}
                  />
                </label>
                <label>
                  Última linha (vazio = automática)
                  <input
                    type="number"
                    min={options.header + 1}
                    max={20050}
                    value={options.end ?? ""}
                    onChange={(e) =>
                      change({
                        end: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  />
                </label>
                <label>
                  Atualizar
                  <select
                    value={interval}
                    onChange={(e) => setInterval(Number(e.target.value))}
                  >
                    {intervals.map((i) => (
                      <option key={i.value} value={i.value}>
                        {i.label}
                      </option>
                    ))}
                  </select>
                </label>
                {interval === 1440 && (
                  <>
                    <label>
                      Horário diário
                      <input
                        aria-label="Horário diário"
                        type="time"
                        value={dailyTime}
                        onChange={(e) => setDailyTime(e.target.value)}
                      />
                    </label>
                    <label>
                      Fuso horário
                      <select
                        aria-label="Fuso horário"
                        value={timeZone}
                        onChange={(e) => setTimeZone(e.target.value)}
                      >
                        {[
                          ...new Set([
                            timeZone,
                            "America/Sao_Paulo",
                            "America/Manaus",
                            "America/Rio_Branco",
                            "America/Noronha",
                            "Europe/Lisbon",
                            "UTC",
                          ]),
                        ].map((zone) => (
                          <option key={zone} value={zone}>
                            {zone === "America/Sao_Paulo"
                              ? "Brasília · São Paulo"
                              : zone}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
                {selection.kind === "folder" && (
                  <label>
                    Nome dos arquivos contém
                    <input
                      value={options.nameContains}
                      maxLength={100}
                      onChange={(e) => change({ nameContains: e.target.value })}
                      placeholder="Ex.: vendas"
                    />
                  </label>
                )}
              </div>
              <label className="remote-checkbox">
                <input
                  type="checkbox"
                  checked={options.skipTotals}
                  onChange={(e) => change({ skipTotals: e.target.checked })}
                />{" "}
                Ignorar totais e subtotais da planilha
              </label>
              <p className="connection-muted">
                Até 10 arquivos por pasta, 10 MB por arquivo e 20 mil linhas
                combinadas. Subpastas não são incluídas. Os arquivos da pasta
                precisam ter a mesma aba e colunas.
              </p>
              <div className="remote-toolbar">
                <strong>
                  Prévia{" "}
                  {preview
                    ? `· ${preview.rowCount.toLocaleString("pt-BR")} linhas no arquivo ${preview.sample}`
                    : ""}
                </strong>
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => run(() => inspect(selection, options))}
                >
                  <RefreshCw size={15} /> Revisar prévia
                </button>
              </div>
              {!reviewed && (
                <p className="connection-alert">
                  Revise a prévia após alterar a seleção.
                </p>
              )}
              {preview && (
                <div className="remote-preview">
                  <table>
                    <thead>
                      <tr>
                        {preview.columns.map((c) => (
                          <th key={c}>{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((row, i) => (
                        <tr key={i}>
                          {preview.columns.map((c) => (
                            <td key={c}>{row[c]}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="remote-footer">
                <span>
                  {interval === 1440
                    ? `Atualização diária às ${dailyTime} (${timeZone}). A primeira carga é imediata; as seguintes dependem da ativação do agendamento. O horário é previsto e pode variar conforme a fila.`
                    : "Os dashboards usarão esta fonte a cada atualização."}
                </span>
                <button
                  className="primary-button"
                  disabled={
                    busy ||
                    !reviewed ||
                    !name.trim() ||
                    (interval === 1440 &&
                      (!/^([01]\d|2[0-3]):[0-5]\d$/.test(dailyTime) ||
                        !validTimeZone(timeZone)))
                  }
                  onClick={() =>
                    run(async () => {
                      const scheduledOptions = {
                        ...options,
                        daily:
                          interval === 1440
                            ? { time: dailyTime, timeZone }
                            : undefined,
                      };
                      const r = await apiJson<{ id: string }>(
                        binding ? "connectors/selection" : "connectors/watch",
                        binding
                          ? {
                              id: binding.id,
                              name,
                              options: scheduledOptions,
                              interval,
                            }
                          : {
                              connectionId: connection.id,
                              target: selection,
                              name,
                              options: scheduledOptions,
                              interval,
                            },
                      );
                      await onCreated(r.id);
                    })
                  }
                >
                  {busy
                    ? "Processando…"
                    : binding
                      ? "Salvar seleção"
                      : "Criar acompanhamento"}
                  <ArrowRight size={16} />
                </button>
              </div>
            </>
          )
        )}
        {busy && (
          <p role="status" className="connection-muted">
            Consultando o conteúdo…
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
