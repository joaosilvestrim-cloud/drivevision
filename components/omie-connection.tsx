"use client";
import { useState } from "react";
import { ArrowRight, CheckCircle2, RefreshCw } from "lucide-react";
import { apiJson } from "@/lib/cloud-workspace";
import { t as translate, locale } from "@/lib/i18n";
import type { CloudConnection, CloudBinding } from "@/lib/connector-types";
import type { OmieOptions, OmiePreview } from "@/lib/omie-types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";

export function OmieConnection({
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
    binding && "dataset" in binding.options ? binding.options : undefined;
  const [connectionId, setConnectionId] = useState(connection?.id);
  const [label, setLabel] = useState(connection?.label || "");
  const [appKey, setAppKey] = useState(""),
    [appSecret, setAppSecret] = useState("");
  const [options, setOptions] = useState<OmieOptions>({
    dataset: "omie-invoiced-orders",
    periodDays: 90,
    ...initial,
    daily: initial?.daily || { time: "07:00", timeZone: "America/Sao_Paulo" },
  });
  const [name, setName] = useState(binding?.name || "Omie · Pedidos faturados");
  const [preview, setPreview] = useState<OmiePreview | null>(null);
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
          <DialogTitle>{translate("Conectar Omie")}</DialogTitle>
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
          {["Conectar empresa", "Conferir pedidos", "Criar painel"].map(
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
            <h3>{translate("Sua fonte Omie está pronta.")}</h3>
            <p>
              {translate(
                "Agora escolha seu segmento e confira o painel sugerido com esses dados.",
              )}
            </p>
            <button
              className="primary-button"
              onClick={() => {
                onClose();
                onAnalyze(saved);
              }}
            >
              {translate("Criar meu painel")}
              <ArrowRight size={16} />
            </button>
          </div>
        ) : (
          <>
            <div className="omie-scope">
              <strong>{translate("Pedidos de produtos faturados")}</strong>
              <p>
                {translate(
                  "Uma linha por pedido. Valor total do pedido e data de faturamento. Exclui cancelados, denegados e pedidos com devolução total ou parcial. Não representa recebimentos, lucro ou receita líquida de devoluções.",
                )}
              </p>
              <p>
                {translate(
                  "Clientes e vendedores aparecem por código Omie. Serviços, estoque e contas a pagar não fazem parte desta conexão inicial.",
                )}
              </p>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  const result = needsCredentials
                    ? await apiJson<OmiePreview>("connectors/omie/connect", {
                        id: connectionId,
                        label,
                        credentials: { appKey, appSecret },
                        options,
                      })
                    : await apiJson<OmiePreview>("connectors/omie/preview", {
                        connectionId,
                        options,
                      });
                  setConnectionId(result.connectionId);
                  setAppKey("");
                  setAppSecret("");
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
                  <label>
                    App Key
                    <input
                      required
                      value={appKey}
                      onChange={(e) => setAppKey(e.target.value.trim())}
                      autoComplete="off"
                      inputMode="numeric"
                      maxLength={40}
                    />
                  </label>
                  <label>
                    App Secret
                    <input
                      required
                      type="password"
                      value={appSecret}
                      onChange={(e) => setAppSecret(e.target.value.trim())}
                      autoComplete="new-password"
                      maxLength={200}
                    />
                  </label>
                  <p>
                    {translate(
                      "No Omie: Meus aplicativos → engrenagem → Resumo do App → Chave de Integração (API). Um administrador da sua empresa precisa obter as chaves.",
                    )}
                  </p>
                  <a
                    href="https://ajuda.omie.com.br/pt-BR/articles/499061-obtendo-a-chave-de-acesso-para-integracoes-de-api"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {translate("Ver instruções do Omie")}
                  </a>
                  <p>
                    {translate(
                      "O DriveVision faz apenas consultas. Suas chaves são criptografadas e não aparecem nos painéis.",
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
                        {translate("Últimos {v0} dias", { v0: d })}
                      </option>
                    ))}
                  </select>
                </label>
                <p>
                  {translate(
                    "O período avança a cada atualização, no horário de Brasília. Até 5.000 pedidos por fonte; seleções maiores são bloqueadas sem publicar resultados parciais.",
                  )}
                </p>
              </div>
              <button
                className="secondary-button"
                type="submit"
                disabled={busy}
              >
                {busy
                  ? translate("Consultando o Omie…")
                  : translate("Conectar e conferir dados")}
                <RefreshCw size={16} className={busy ? "spin" : ""} />
              </button>
            </form>
            {preview && (
              <section className="omie-review">
                <h3>{translate("Confira antes de importar")}</h3>
                <p>
                  {translate("{v0} pedidos · {v1} excluídos pelas regras", {
                    v0: preview.rowCount,
                    v1: preview.excluded,
                  })}
                </p>
                <p>
                  {preview.from} → {preview.to} ·{" "}
                  {translate("Total dos pedidos")}:{" "}
                  <strong>
                    {new Intl.NumberFormat(locale(), {
                      style: "currency",
                      currency: "BRL",
                    }).format(preview.total)}
                  </strong>
                </p>
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
                      "Nenhum pedido elegível neste período. Amplie o período ou confira os faturamentos no Omie.",
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
                  {translate("Conferi os dados e as regras desta fonte.")}
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
                      }>("connectors/omie/watch", {
                        id: binding?.id,
                        connectionId,
                        options,
                        name,
                        interval: 1440,
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
