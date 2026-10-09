"use client";
import { useState } from "react";
import { ArrowRight, CheckCircle2, RefreshCw } from "lucide-react";
import { apiJson } from "@/lib/cloud-workspace";
import { t as translate, locale } from "@/lib/i18n";
import type { CloudConnection, CloudBinding } from "@/lib/connector-types";
import type { ProtheusOptions, ProtheusPreview } from "@/lib/protheus-types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";

export function ProtheusConnection({
  connection,
  binding,
  credentialsOnly = false,
  onClose,
  onRefresh,
  onSaved,
  onAnalyze,
}: {
  connection?: CloudConnection;
  binding?: CloudBinding;
  credentialsOnly?: boolean;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onSaved: () => Promise<void>;
  onAnalyze: (id: string) => void;
}) {
  const initial =
    binding &&
    "dataset" in binding.options &&
    binding.options.dataset === "protheus-financial"
      ? binding.options
      : undefined;
  const [connectionId, setConnectionId] = useState(connection?.id);
  const [label, setLabel] = useState(connection?.label || "");
  const [credentials, setCredentials] = useState({
    baseUrl: "",
    company: "",
    branch: "",
    username: "",
    password: "",
  });
  const [options, setOptions] = useState<ProtheusOptions>({
    dataset: "protheus-financial",
    periodDays: 90,
    titleTypes: ["NF", "DP"],
    ...initial,
    daily: initial?.daily || { time: "07:00", timeZone: "America/Sao_Paulo" },
  });
  const [name, setName] = useState(
    binding?.name || "Protheus · Títulos em aberto",
  );
  const [preview, setPreview] = useState<ProtheusPreview | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(credentialsOnly);
  const needsCredentials = !connectionId || replacing;
  const [confirmed, setConfirmed] = useState(false);
  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : translate("Não foi possível concluir."),
      );
    } finally {
      setBusy(false);
    }
  }
  function resetPreview() {
    setPreview(null);
    setConfirmed(false);
  }
  return (
    <Dialog
      open
      onOpenChange={() => {
        if (!busy) onClose();
      }}
    >
      <DialogContent
        className="connection-dialog omie-dialog"
        onInteractOutside={(e) => {
          if (busy) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{translate("Conectar Protheus")}</DialogTitle>
          <DialogDescription>
            {translate(
              "Da sua empresa ao primeiro painel, sem exportar planilhas.",
            )}
          </DialogDescription>
        </DialogHeader>
        <ol
          className="omie-progress"
          aria-label={translate("Etapas da conexão")}
        >
          {["Conectar empresa", "Conferir títulos", "Criar painel"].map(
            (s, i) => (
              <li
                key={s}
                aria-current={
                  (saved ? i === 2 : preview ? i === 1 : i === 0)
                    ? "step"
                    : undefined
                }
              >
                <b>{i + 1}</b>
                {translate(s)}
              </li>
            ),
          )}
        </ol>
        {saved ? (
          <div className="connections-empty compact">
            <CheckCircle2 size={32} />
            <h3>{translate("Sua fonte Protheus está pronta.")}</h3>
            <p>
              {translate(
                "Seu painel financeiro foi criado. Confira os indicadores e personalize os gráficos.",
              )}
            </p>
            <button
              className="primary-button"
              onClick={() => {
                onClose();
                onAnalyze(saved);
              }}
            >
              {translate("Abrir meu painel")}
              <ArrowRight size={16} />
            </button>
          </div>
        ) : (
          <>
            <div className="omie-scope">
              <strong>{translate("Contas a pagar e receber em aberto")}</strong>
              <p>
                {translate(
                  "Uma linha por título ou parcela em aberto. Considera vencimento real, saldo atual, empresa e filial informadas. Somente moeda 1: confirme com seu administrador que ela representa reais (BRL).",
                )}
              </p>
              <p>
                {translate(
                  "Pessoas e naturezas aparecem por código. Exclui adiantamentos RA/PA, créditos NCC/NDF, títulos quitados e outras moedas. Não representa caixa realizado, lucro ou DRE. Homologação no ERP do cliente necessária antes do uso gerencial.",
                )}
              </p>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  const result = needsCredentials
                    ? await apiJson<ProtheusPreview>(
                        "connectors/protheus/connect",
                        {
                          id: connectionId,
                          label,
                          credentials,
                          options,
                        },
                      )
                    : await apiJson<ProtheusPreview>(
                        "connectors/protheus/preview",
                        {
                          connectionId,
                          options,
                        },
                      );
                  setConnectionId(result.connectionId);
                  setCredentials({
                    baseUrl: "",
                    company: "",
                    branch: "",
                    username: "",
                    password: "",
                  });
                  setReplacing(false);
                  setPreview(result);
                  setConfirmed(false);
                  await onRefresh();
                });
              }}
            >
              {needsCredentials && (
                <fieldset disabled={busy} className="omie-fields">
                  <legend>{translate("Credenciais da sua empresa")}</legend>
                  <label>
                    {translate("Nome da empresa nesta conexão")}
                    <input
                      required
                      maxLength={120}
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      autoComplete="organization"
                    />
                  </label>
                  {(
                    [
                      [
                        "baseUrl",
                        "URL HTTPS do REST",
                        "https://erp.suaempresa.com.br/rest",
                      ],
                      ["company", "Grupo de empresas", "Ex.: 01"],
                      ["branch", "Filial", "Ex.: 0101"],
                      ["username", "Usuário de integração", ""],
                      ["password", "Senha do usuário de integração", ""],
                    ] as const
                  ).map(([key, title, placeholder]) => (
                    <label key={key}>
                      {translate(title)}
                      <input
                        required
                        type={
                          key === "password"
                            ? "password"
                            : key === "baseUrl"
                              ? "url"
                              : "text"
                        }
                        autoComplete={
                          key === "password" ? "new-password" : "off"
                        }
                        maxLength={key === "baseUrl" ? 300 : 120}
                        placeholder={placeholder}
                        value={credentials[key]}
                        onChange={(e) => {
                          setCredentials({
                            ...credentials,
                            [key]: e.target.value,
                          });
                          resetPreview();
                        }}
                      />
                    </label>
                  ))}
                  <details>
                    <summary>
                      {translate("O que pedir ao administrador Protheus")}
                    </summary>
                    <p>
                      {translate(
                        "REST acessível por HTTPS com certificado válido e DNS IPv4 público; APIs Token e GenericQuery habilitadas; SECURITY=1; usuário de consulta com acesso a SE1 e SE2 e à empresa/filial escolhida. Confirme moeda, tipos de título e licenciamento TOTVS. Não é necessário liberar acesso ao banco de dados.",
                      )}
                    </p>
                    <a
                      href="https://tdn.totvs.com/display/framework/GenericQuery"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {translate("Documentação da TOTVS")}
                    </a>
                  </details>
                  <p>
                    {translate(
                      "O DriveVision faz apenas consultas. As credenciais ficam criptografadas no seu ambiente. Redes privadas precisam de integração assistida.",
                    )}
                  </p>
                </fieldset>
              )}
              <div className="omie-fields">
                <label>
                  {translate("Período acompanhado")}
                  <select
                    disabled={busy}
                    value={options.periodDays}
                    onChange={(e) => {
                      setOptions({
                        ...options,
                        periodDays: Number(e.target.value) as 30 | 90 | 365,
                      });
                      resetPreview();
                    }}
                  >
                    {[30, 90, 365].map((d) => (
                      <option key={d} value={d}>
                        {translate("Últimos {v0} dias e próximos 30 dias", {
                          v0: d,
                        })}
                      </option>
                    ))}
                  </select>
                </label>
                <p>
                  {translate(
                    "O período considera o vencimento real e avança diariamente. Até 5.000 títulos por fonte, somando pagar e receber. Resultados incompletos não são publicados.",
                  )}
                </p>
              </div>
              <div className="omie-fields">
                <label>
                  {translate("Tipos de título incluídos")}
                  <input
                    disabled={busy}
                    value={options.titleTypes.join(",")}
                    onChange={(e) => {
                      setOptions({
                        ...options,
                        titleTypes: e.target.value
                          .toUpperCase()
                          .split(",")
                          .map((v) => v.trim()),
                      });
                      resetPreview();
                    }}
                    placeholder="NF,DP"
                  />
                  <small>
                    {translate(
                      "Separe os códigos por vírgula. Confirme os tipos usados no seu ERP; apenas os informados entram no painel.",
                    )}
                  </small>
                </label>
              </div>
              <button
                className="secondary-button"
                type="submit"
                disabled={busy}
              >
                {busy
                  ? translate("Consultando o Protheus…")
                  : translate("Conectar e conferir dados")}
                <RefreshCw size={16} className={busy ? "spin" : ""} />
              </button>
            </form>
            {preview && (
              <section className="omie-review">
                <h3>{translate("Confira antes de importar")}</h3>
                <p>
                  {preview.rowCount} {translate("títulos em aberto")} ·{" "}
                  {preview.from} → {preview.to}
                </p>
                <p>
                  {translate("Extraído em")}:{" "}
                  {new Date(preview.fetchedAt).toLocaleString(locale())}
                </p>
                <dl className="protheus-totals">
                  {(
                    [
                      ["receivable", "A receber"],
                      ["payable", "A pagar"],
                      ["overdueReceivable", "Recebimentos vencidos"],
                      ["overduePayable", "Pagamentos vencidos"],
                    ] as const
                  ).map(([key, title]) => (
                    <div key={key}>
                      <dt>{translate(title)}</dt>
                      <dd>
                        {new Intl.NumberFormat(locale(), {
                          style: "currency",
                          currency: "BRL",
                        }).format(preview.totals[key])}
                      </dd>
                    </div>
                  ))}
                </dl>
                <div className="remote-preview">
                  <table>
                    <thead>
                      <tr>
                        {preview.columns.map((c) => (
                          <th key={c}>{translate(c)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((r, i) => (
                        <tr key={i}>
                          {preview.columns.map((c) => (
                            <td key={c}>{r[c]}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!preview.rowCount && (
                  <p role="status">
                    {translate(
                      "Nenhum título em aberto nos filtros escolhidos. Confira período, filial e tipos de título no Protheus.",
                    )}
                  </p>
                )}
                <div className="omie-fields">
                  <label>
                    {translate("Nome da fonte")}
                    <input
                      value={name}
                      maxLength={120}
                      disabled={busy}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>
                  <label>
                    {translate("Atualização diária")}
                    <input
                      type="time"
                      value={options.daily?.time || "07:00"}
                      disabled={busy}
                      onChange={(e) =>
                        setOptions({
                          ...options,
                          daily: {
                            time: e.target.value,
                            timeZone: "America/Sao_Paulo",
                          },
                        })
                      }
                    />
                    <small>
                      {translate(
                        "Horário de Brasília. A execução pode variar conforme a fila.",
                      )}
                    </small>
                  </label>
                </div>
                <label className="remote-checkbox">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    disabled={busy}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  {translate(
                    "Conferi os totais com o Protheus usando os mesmos filtros e confirmei a moeda BRL.",
                  )}
                </label>
                <button
                  className="primary-button"
                  disabled={
                    busy ||
                    !confirmed ||
                    !name.trim() ||
                    (!preview.rowCount && !binding) ||
                    !/^([01]\d|2[0-3]):[0-5]\d$/.test(options.daily?.time || "")
                  }
                  onClick={() =>
                    void run(async () => {
                      const watched = await apiJson<{
                        id: string;
                        sourceId: string;
                      }>("connectors/protheus/watch", {
                        id: binding?.id,
                        connectionId,
                        options,
                        name,
                        interval: 1440,
                        fingerprint: preview.fingerprint,
                      });
                      await apiJson("connectors/sync", { id: watched.id });
                      await onSaved();
                      setSaved(watched.sourceId);
                    })
                  }
                >
                  {busy
                    ? translate("Importando…")
                    : translate("Importar e preparar painel")}
                  <ArrowRight size={16} />
                </button>
              </section>
            )}
            {error && (
              <p className="connection-alert" role="alert">
                {translate(error)}
              </p>
            )}
            {busy && (
              <p role="status">
                {translate(
                  "A consulta pode levar até um minuto. Aguarde sem fechar esta janela.",
                )}
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
