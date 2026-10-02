"use client";
import { t as translate, locale } from "@/lib/i18n";
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
import { CONNECTION_ERRORS } from "@/lib/connection-errors";
import { validTimeZone } from "@/lib/refresh-schedule";
import { OmieConnection } from "./omie-connection";
import { ContaAzulConnection } from "./contaazul-connection";
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

const labels: Record<Provider | "omie" | "contaazul", string> = {
  contaazul: "Conta Azul",
  omie: "Omie",
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
  value ? new Date(value).toLocaleString(locale()) : "Ainda não atualizado";
const overdue = (b: CloudBinding) =>
  !b.paused &&
  !!b.next_due_at &&
  Date.parse(b.next_due_at) < Date.now() - 5 * 60000;
function callbackMessage() {
  if (typeof location === "undefined") return "";
  const params = new URLSearchParams(location.search);
  const value = params.get("connection");
  const reason = params.get("reason") || "";
  if (value === "error" && Object.hasOwn(CONNECTION_ERRORS, reason))
    return CONNECTION_ERRORS[reason];
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
  unavailable,
  unsaved,
  onSaveDraft,
  onConfigure,
}: {
  cloud: boolean;
  onLogin: () => void;
  onReload: () => Promise<void>;
  onAnalyze: (id: string) => void;
  locked: boolean;
  unavailable: boolean;
  unsaved: boolean;
  onSaveDraft: () => void;
  onConfigure: (action: () => void) => void;
}) {
  const [state, setState] = useState<ConnectorState | null>(null),
    [error, setError] = useState(callbackMessage),
    [busy, setBusy] = useState("");
  const [retryContaAzul, setRetryContaAzul] = useState(() => {
    const p = new URLSearchParams(location.search);
    return p.get("connection") === "error" && p.get("provider") === "contaazul";
  });
  const [omie, setOmie] = useState<{
    connection?: CloudConnection;
    binding?: CloudBinding;
    credentialsOnly?: boolean;
  } | null>(null);
  const [contaAzul, setContaAzul] = useState<{
    connection?: CloudConnection;
    binding?: CloudBinding;
    progressOnly?: boolean;
  } | null>(null);
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
          if (live) {
            setState(data);
            const params = new URLSearchParams(location.search);
            if (params.get("connection") === "contaazul") {
              const c = data.connections.find(
                (c) =>
                  c.id === params.get("account") && c.provider === "contaazul",
              );
              if (c) setContaAzul({ connection: c });
              historyReplace();
            }
          }
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
    if (value && value !== "contaazul") historyReplace();
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
        const result = await apiJson<{ pending?: boolean }>("connectors/sync", {
          id,
        });
        if (result.pending) {
          const b = state?.bindings.find((b) => b.id === id);
          if (b)
            setContaAzul({
              connection: state?.connections.find(
                (c) => c.id === b.connection_id,
              ),
              binding: b,
              progressOnly: true,
            });
        }
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
        <h2>{translate("Seus dados continuam conectados.")}</h2>
        <p>
          {translate(
            " Entre na sua conta para conectar SharePoint ou OneDrive e atualizar suas análises. ",
          )}
        </p>
        <button className="primary-button" onClick={onLogin}>
          {translate(" Entrar para conectar ")}
          <ArrowRight size={16} />
        </button>
      </section>
    );
  return (
    <div className="connections-page">
      <section className="connection-intro">
        <div>
          <h2>
            {translate(" Escolha uma vez. ")}
            <br />
            {translate(" Acompanhe sempre. ")}
          </h2>
          <p>
            {translate(
              " Conecte uma conta, selecione o conteúdo e mantenha suas análises atualizadas. Você decide o que acompanhar. ",
            )}
          </p>
        </div>
        <div className="connection-steps">
          <span>
            <b>01</b> {translate(" Autorize a leitura ")}
          </span>
          <span>
            <b>02</b> {translate(" Escolha os dados ")}
          </span>
          <span>
            <b>03</b> {translate(" Defina sua atualização ")}
          </span>
        </div>
      </section>
      {error && (
        <div className="connection-alert" role="alert">
          <AlertCircle size={18} />
          <span>{translate(error)}</span>
          <button
            className="text-button"
            disabled={!!busy || (retryContaAzul && unavailable)}
            onClick={() => retryContaAzul
              ? onConfigure(() => { setRetryContaAzul(false); setError(""); setContaAzul({}); })
              : action("reload", load)}
          >
            {translate(" Tentar novamente ")}
          </button>
        </div>
      )}
      {unsaved && (
        <div className="connection-alert" role="status">
          <AlertCircle size={18} />
          <span>{translate("Você tem alterações não salvas. Ao conectar, vamos salvar seu painel antes de continuar.")}</span>
          <button className="secondary-button" disabled={unavailable} onClick={onSaveDraft}>
            {translate("Salvar dashboard")}
          </button>
        </div>
      )}
      {unavailable && (
        <p className="connection-alert" role="status">{translate("Aguarde o workspace carregar. Se houver um erro, recarregue os dados para liberar as conexões.")}</p>
      )}
      {!state && !error && <p role="status">{translate("Verificando integrações disponíveis…")}</p>}
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
              <h3>{translate(labels[p])}</h3>
              <p>
                {p === "sharepoint"
                  ? translate("Sites, bibliotecas e pastas da sua organização.")
                  : p === "onedrive"
                    ? translate("Planilhas e arquivos da sua conta Microsoft.")
                    : translate(
                        "Arquivos, drives compartilhados e Google Sheets.",
                      )}
              </p>
              <span className="connection-tag">
                {comingSoon
                  ? translate("Em breve")
                  : translate("Somente leitura")}
              </span>
              <button
                className="secondary-button"
                disabled={!!busy || unavailable || !state || !ready}
                onClick={() =>
                  onConfigure(() => { void action(p, async () => {
                    const result = await apiJson<{ url: string }>(
                      "connectors/start",
                      { provider: p },
                    );
                    location.assign(result.url);
                  }); })
                }
              >
                {comingSoon
                  ? translate("Em breve")
                  : !state
                    ? translate("Verificando integrações disponíveis…")
                  : busy === p
                    ? translate("Abrindo autorização…")
                    : ready
                      ? translate("Conectar conta")
                      : translate("Aguardando configuração")}
                <Plus size={15} />
              </button>
              {state && !ready && !comingSoon && (
                <small>
                  {translate(
                    " A integração precisa ser habilitada pelo administrador. ",
                  )}
                </small>
              )}
            </article>
          );
        })}
        <article className="provider-card">
          <span className="provider-symbol omie" aria-hidden="true">
            O
          </span>
          <h3>Omie</h3>
          <p>
            {translate(
              "Pedidos faturados da sua empresa, com atualização diária e painel guiado.",
            )}
          </p>
          <span className="connection-tag">{translate("Somente leitura")}</span>
          <button
            className="secondary-button"
            disabled={!!busy || unavailable || !state?.omieConfigured}
            onClick={() => onConfigure(() => setOmie({}))}
          >
            {state ? translate("Conectar Omie") : translate("Verificando integrações disponíveis…")}
            <Plus size={15} />
          </button>
          {state && !state.omieConfigured && (
            <small>
              {translate(
                "A integração precisa ser habilitada pelo administrador.",
              )}
            </small>
          )}
        </article>
        <article className="provider-card">
          <span className="provider-symbol" aria-hidden="true">
            ↔
          </span>
          <h3>Conta Azul</h3>
          <p>
            {translate(
              "Contas a pagar e a receber, com painel financeiro e atualização diária.",
            )}
          </p>
          <span className="connection-tag">{translate("Somente leitura")}</span>
          <button
            className="secondary-button"
            disabled={!!busy || unavailable || !state?.contaAzulConfigured}
            onClick={() => onConfigure(() => setContaAzul({}))}
          >
            {state ? translate("Conectar Conta Azul") : translate("Verificando integrações disponíveis…")}
            <Plus size={15} />
          </button>
          {state && !state.contaAzulConfigured && (
            <small>
              {translate(
                "A integração precisa ser habilitada pelo administrador.",
              )}
            </small>
          )}
        </article>
        <article className="provider-card">
          <span className="provider-symbol" aria-hidden="true">
            ↔
          </span>
          <h3>{translate("Outros sistemas")}</h3>
          <p>
            {translate(
              "Bling e outras integrações serão liberados após a configuração e validação de cada fornecedor.",
            )}
          </p>
          <span className="connection-tag">{translate("Em breve")}</span>
          <button className="secondary-button" disabled>
            {translate(" Em breve ")}
            <Plus size={15} />
          </button>
        </article>
      </div>
      <section className="connected-accounts">
        <div className="connections-section-title">
          <h2>{translate("Contas conectadas")}</h2>
          <button
            className="text-button"
            disabled={!!busy}
            onClick={() => action("reload", load)}
          >
            <RefreshCw size={15} /> {translate(" Atualizar lista ")}
          </button>
        </div>
        {!state ? (
          <p role="status">{translate("Carregando conexões…")}</p>
        ) : !state.connections.length ? (
          <p className="connection-muted">
            {translate(
              " Nenhuma conta conectada. Seus arquivos só serão lidos após a autorização e a seleção do conteúdo. ",
            )}
          </p>
        ) : (
          state.connections.map((c) => (
            <article key={c.id} className="connection-account">
              <span
                className={`provider-symbol ${c.provider}`}
                aria-hidden="true"
              >
                {c.provider === "omie" ? (
                  "O"
                ) : c.provider === "google" ? (
                  "G"
                ) : c.provider === "sharepoint" ? (
                  "S"
                ) : (
                  <Cloud />
                )}
              </span>
              <div>
                <h3>{translate(labels[c.provider])}</h3>
                <p>{c.label}</p>
              </div>
              <button
                className="primary-button"
                disabled={!!busy || locked}
                onClick={() =>
                  c.provider === "omie"
                    ? setOmie({ connection: c })
                    : c.provider === "contaazul"
                      ? setContaAzul({
                          connection: c,
                          binding: state.bindings.find(
                            (b) => b.connection_id === c.id,
                          ),
                        })
                      : setBrowser(c)
                }
              >
                <Folder size={16} /> {translate(" Escolher conteúdo ")}
              </button>
              {c.provider === "omie" && (
                <button
                  className="text-button"
                  disabled={!!busy || locked}
                  onClick={() =>
                    setOmie({ connection: c, credentialsOnly: true })
                  }
                >
                  {translate("Atualizar credenciais")}
                </button>
              )}
              {c.provider === "contaazul" && (
                <button
                  className="text-button"
                  disabled={!!busy || locked}
                  onClick={() => setContaAzul({})}
                >
                  {translate("Reconectar empresa")}
                </button>
              )}
              <button
                className="text-button"
                aria-label={translate("Desconectar {v0}", { v0: c.label })}
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
          <h2>{translate("Conteúdo acompanhado")}</h2>
          <span className="connection-tag">
            <Clock3 size={13} />{" "}
            {state?.scheduled
              ? translate("Atualização em segundo plano")
              : translate("Atualização manual disponível")}
          </span>
        </div>
        {unsaved && (
          <p className="connection-alert">
            {translate(
              " Salve seu rascunho antes de atualizar as fontes nesta tela. ",
            )}
          </p>
        )}
        {state && !state.scheduled && (
          <p className="connection-muted">
            {translate(
              " O agendamento será ativado quando o administrador concluir a configuração. Até lá, use “Atualizar agora”. ",
            )}
          </p>
        )}
        {!state?.bindings.length ? (
          <div className="connections-empty compact">
            <FileSpreadsheet size={28} />
            <h3>{translate("Uma origem. Análises sempre à mão.")}</h3>
            <p>
              {translate(
                " Escolha um arquivo ou uma pasta em uma conta conectada para começar. ",
              )}
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
                    {"dataset" in b.options
                      ? b.options.dataset === "contaazul-financial"
                        ? "Conta Azul"
                        : "Omie"
                      : b.target.kind === "folder"
                        ? translate("Pasta")
                        : translate("Arquivo")}
                  </span>
                  <span
                    className={`connection-state ${b.last_error ? "error" : ""}`}
                  >
                    {b.paused
                      ? translate("Pausado")
                      : b.last_error
                        ? translate("Precisa de atenção")
                        : state.scheduled && overdue(b)
                          ? translate("Atualização atrasada")
                          : b.last_success_at
                            ? translate("Atualizado")
                            : translate("Primeira atualização pendente")}
                  </span>
                </div>
                <h3>{b.name}</h3>
                <p className="connection-path">
                  {b.target.name}{" "}
                  {"sheet" in b.options && (
                    <>
                      {translate(" · Aba ")}
                      {b.options.sheet}
                    </>
                  )}
                </p>
                <dl>
                  <div>
                    <dt>{translate("Seleção")}</dt>
                    <dd>
                      {"dataset" in b.options ? (
                        translate(
                          b.options.dataset === "contaazul-financial"
                            ? "Últimos {v0} dias e próximos 30 dias"
                            : "Últimos {v0} dias",
                          {
                            v0: b.options.periodDays,
                          },
                        )
                      ) : (
                        <>
                          {translate(" Linha ")}
                          {b.options.header} {translate(" · colunas ")}
                          {b.options.left}–{b.options.right}
                          {b.options.end
                            ? translate(" · até a linha {v0}", {
                                v0: b.options.end,
                              })
                            : translate(" · novas linhas incluídas")}
                        </>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>{translate("Frequência")}</dt>
                    <dd>
                      {b.interval_minutes === 1440 && b.options.daily
                        ? translate("Todos os dias às {v0} · {v1}", {
                            v0: b.options.daily.time,
                            v1: b.options.daily.timeZone,
                          })
                        : b.interval_minutes === 1440
                          ? translate("A cada 24 horas")
                          : translate(
                              intervals.find(
                                (i) => i.value === b.interval_minutes,
                              )?.label,
                            )}
                    </dd>
                  </div>
                  <div>
                    <dt>{translate("Última atualização")}</dt>
                    <dd>{when(b.last_success_at)}</dd>
                  </div>
                  <div>
                    <dt>{translate("Última verificação")}</dt>
                    <dd>{when(b.last_checked_at)}</dd>
                  </div>
                  <div>
                    <dt>
                      {b.last_error
                        ? translate("Próxima tentativa")
                        : translate("Próxima execução")}
                    </dt>
                    <dd>
                      {b.paused
                        ? translate("Pausada")
                        : !state.scheduled
                          ? translate("Agendamento não ativado")
                          : b.next_due_at
                            ? translate("{v0} (horário deste dispositivo)", {
                                v0: when(b.next_due_at),
                              })
                            : translate("Aguardando programação")}
                    </dd>
                  </div>
                </dl>
                {state.scheduled && overdue(b) && (
                  <p className="connection-alert" role="status">
                    {translate(
                      " A execução prevista está atrasada. Os gráficos mantêm os dados da última carga concluída. Você pode usar Atualizar agora. ",
                    )}
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
                    {busy === b.id
                      ? translate("Atualizando…")
                      : translate("Atualizar agora")}
                  </button>
                  {b.last_success_at && (
                    <button
                      className="secondary-button"
                      onClick={() => onAnalyze(b.source_id)}
                    >
                      {translate(" Analisar ")}
                      <ArrowRight size={15} />
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
                    {b.paused ? translate("Retomar") : translate("Pausar")}
                  </button>
                  <button
                    className="text-button"
                    disabled={!!busy || locked}
                    onClick={() =>
                      "dataset" in b.options
                        ? b.options.dataset === "contaazul-financial"
                          ? setContaAzul({
                              connection: state.connections.find(
                                (c) => c.id === b.connection_id,
                              ),
                              binding: b,
                            })
                          : setOmie({
                              connection: state.connections.find(
                                (c) => c.id === b.connection_id,
                              ),
                              binding: b,
                            })
                        : setEditing(b)
                    }
                  >
                    <Settings2 size={15} /> {translate(" Seleção ")}
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
                    <History size={15} /> {translate(" Histórico ")}
                  </button>
                  <button
                    className="text-button"
                    disabled={!!busy}
                    onClick={() =>
                      setConfirm({ kind: "remove", id: b.id, name: b.name })
                    }
                  >
                    {translate(" Parar acompanhamento ")}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      {contaAzul && (
        <ContaAzulConnection
          {...contaAzul}
          onClose={() => {
            setContaAzul(null);
            void load();
          }}
          onSaved={async () => {
            await onReload();
            await load();
          }}
          onAnalyze={onAnalyze}
        />
      )}
      {omie && (
        <OmieConnection
          {...omie}
          onClose={() => setOmie(null)}
          onRefresh={load}
          onSaved={async () => {
            await onReload();
            await load();
          }}
          onAnalyze={onAnalyze}
        />
      )}
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
              <DialogTitle>
                {translate("Histórico · ")}
                {history.binding.name}
              </DialogTitle>
              <DialogDescription>
                {translate(" Últimas 30 verificações desta fonte. ")}
              </DialogDescription>
            </DialogHeader>
            <div className="connection-history">
              {!history.runs.length ? (
                <p>{translate("Nenhuma verificação realizada.")}</p>
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
                          ? translate(" · {v0} linhas", {
                              v0: r.rows_count.toLocaleString("pt-BR"),
                            })
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
                  ? translate("Desconectar conta?")
                  : translate("Parar acompanhamento?")}
              </DialogTitle>
              <DialogDescription>
                {confirm.name}
                {translate(
                  ". As atualizações serão interrompidas. Os dados e dashboards já importados serão mantidos no workspace. ",
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="watched-actions">
              <button
                className="secondary-button"
                onClick={() => setConfirm(null)}
              >
                {translate(" Cancelar ")}
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
                {translate(" Confirmar ")}
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
  url.searchParams.delete("reason");
  url.searchParams.delete("provider");
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
      binding && "sheet" in binding.options ? binding.options : null,
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
              ? translate("Defina o que acompanhar")
              : translate("Escolher conteúdo · {v0}", {
                  v0: labels[connection.provider],
                })}
          </DialogTitle>
          <DialogDescription>
            {selection
              ? translate(
                  "Revise a prévia. Esta seleção será repetida a cada atualização.",
                )
              : translate(
                  "{v0} · Somente os arquivos selecionados serão importados.",
                  { v0: connection.label },
                )}
          </DialogDescription>
        </DialogHeader>
        {error && (
          <div className="connection-alert" role="alert">
            {translate(error)}
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
                <ArrowLeft size={15} /> {translate(" Voltar ")}
              </button>
              <strong>
                {current?.name || translate("Escolha uma biblioteca")}
              </strong>
              {current?.kind === "folder" && (
                <button
                  className="primary-button"
                  disabled={busy}
                  onClick={() => run(() => inspect(current))}
                >
                  {translate(" Acompanhar esta pasta ")}
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
                <label htmlFor="site-search">
                  {translate("Buscar site SharePoint")}
                </label>
                <input
                  id="site-search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={translate("Nome do site")}
                />
                <button className="secondary-button" disabled={busy}>
                  {translate(" Buscar ")}
                </button>
              </form>
            )}
            <div className="remote-list" aria-busy={busy}>
              {!items.length && !busy ? (
                <p>
                  {translate(
                    "Nenhum arquivo compatível ou pasta nesta seleção.",
                  )}
                </p>
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
                          ? translate("Planilha")
                          : i.kind === "site"
                            ? translate("Site")
                            : i.kind === "drive"
                              ? translate("Biblioteca")
                              : translate("Pasta")}
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
                {translate(" Carregar mais ")}
              </button>
            )}
          </>
        ) : (
          options && (
            <>
              <div className="remote-selection">
                <span className="connection-tag">
                  {selection.kind === "folder"
                    ? translate("Pasta · arquivos diretamente dentro dela")
                    : translate("Arquivo selecionado")}
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
                    {translate(" Trocar seleção ")}
                  </button>
                )}
              </div>
              <div className="remote-fields">
                <label>
                  {translate(" Nome da fonte ")}
                  <input
                    value={name}
                    maxLength={300}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <label>
                  {translate(" Aba ")}
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
                  {translate(" Linha do cabeçalho ")}
                  <input
                    type="number"
                    min={1}
                    max={20000}
                    value={options.header}
                    onChange={(e) => change({ header: Number(e.target.value) })}
                  />
                </label>
                <label>
                  {translate(" Primeira coluna (número) ")}
                  <input
                    type="number"
                    min={1}
                    max={160}
                    value={options.left}
                    onChange={(e) => change({ left: Number(e.target.value) })}
                  />
                </label>
                <label>
                  {translate(" Última coluna (número) ")}
                  <input
                    type="number"
                    min={options.left}
                    max={160}
                    value={options.right}
                    onChange={(e) => change({ right: Number(e.target.value) })}
                  />
                </label>
                <label>
                  {translate(" Última linha (vazio = automática) ")}
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
                  {translate(" Atualizar ")}
                  <select
                    value={interval}
                    onChange={(e) => setInterval(Number(e.target.value))}
                  >
                    {intervals.map((i) => (
                      <option key={i.value} value={i.value}>
                        {translate(i.label)}
                      </option>
                    ))}
                  </select>
                </label>
                {interval === 1440 && (
                  <>
                    <label>
                      {translate(" Horário diário ")}
                      <input
                        aria-label={translate("Horário diário")}
                        type="time"
                        value={dailyTime}
                        onChange={(e) => setDailyTime(e.target.value)}
                      />
                    </label>
                    <label>
                      {translate(" Fuso horário ")}
                      <select
                        aria-label={translate("Fuso horário")}
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
                              ? translate("Brasília · São Paulo")
                              : zone}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
                {selection.kind === "folder" && (
                  <label>
                    {translate(" Nome dos arquivos contém ")}
                    <input
                      value={options.nameContains}
                      maxLength={100}
                      onChange={(e) => change({ nameContains: e.target.value })}
                      placeholder={translate("Ex.: vendas")}
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
                {translate(" Ignorar totais e subtotais da planilha ")}
              </label>
              <p className="connection-muted">
                {translate(
                  " Até 10 arquivos por pasta, 10 MB por arquivo e 20 mil linhas combinadas. Subpastas não são incluídas. Os arquivos da pasta precisam ter a mesma aba e colunas. ",
                )}
              </p>
              <div className="remote-toolbar">
                <strong>
                  {translate(" Prévia")}{" "}
                  {preview
                    ? translate("· {v0} linhas no arquivo {v1}", {
                        v0: preview.rowCount.toLocaleString("pt-BR"),
                        v1: preview.sample,
                      })
                    : ""}
                </strong>
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => run(() => inspect(selection, options))}
                >
                  <RefreshCw size={15} /> {translate(" Revisar prévia ")}
                </button>
              </div>
              {!reviewed && (
                <p className="connection-alert">
                  {translate(" Revise a prévia após alterar a seleção. ")}
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
                    ? translate(
                        "Atualização diária às {v0} ({v1}). A primeira carga é imediata; as seguintes dependem da ativação do agendamento. O horário é previsto e pode variar conforme a fila.",
                        { v0: dailyTime, v1: timeZone },
                      )
                    : translate(
                        "Os dashboards usarão esta fonte a cada atualização.",
                      )}
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
                    ? translate("Processando…")
                    : binding
                      ? translate("Salvar seleção")
                      : translate("Criar acompanhamento")}
                  <ArrowRight size={16} />
                </button>
              </div>
            </>
          )
        )}
        {busy && (
          <p role="status" className="connection-muted">
            {translate(" Consultando o conteúdo… ")}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
