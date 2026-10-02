"use client";
import { useEffect, useRef, useState } from "react";
import { apiJson } from "@/lib/cloud-workspace";
import { t as translate } from "@/lib/i18n";
import type { CloudBinding, CloudConnection } from "@/lib/connector-types";
import type {
  ContaAzulOptions,
  ContaAzulProgress,
} from "@/lib/contaazul-types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";

export function ContaAzulConnection({
  connection,
  binding,
  progressOnly = false,
  onClose,
  onSaved,
  onAnalyze,
}: {
  connection?: CloudConnection;
  binding?: CloudBinding;
  progressOnly?: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onAnalyze: (id: string) => void;
}) {
  const initial =
    binding &&
    "dataset" in binding.options &&
    binding.options.dataset === "contaazul-financial"
      ? binding.options
      : undefined;
  const [label, setLabel] = useState(connection?.label || "");
  const [name, setName] = useState(binding?.name || "Conta Azul · Financeiro");
  const [options, setOptions] = useState<ContaAzulOptions>(
    initial || {
      dataset: "contaazul-financial",
      periodDays: 90,
      daily: { time: "07:00", timeZone: "America/Sao_Paulo" },
    },
  );
  const [id, setId] = useState(progressOnly ? binding?.id : undefined);
  const [progress, setProgress] = useState<ContaAzulProgress | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  const saved = useRef(onSaved);
  saved.current = onSaved;
  useEffect(() => {
    if (!id) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    async function advance() {
      try {
        let p = await apiJson<ContaAzulProgress>(
          "connectors/contaazul/progress",
          { id },
        );
        if (!live) return;
        if (p.status === "ready") {
          await saved.current();
          if (live) {
            setProgress(p);
            setBusy(false);
          }
          return;
        }
        setProgress(p);
        setBusy(true);
        await apiJson("connectors/sync", { id });
        p = await apiJson<ContaAzulProgress>("connectors/contaazul/progress", {
          id,
        });
        if (!live) return;
        if (p.status === "ready") await saved.current();
        if (!live) return;
        setProgress(p);
        setBusy(false);
        if (p.status !== "ready") timer = setTimeout(advance, 5000);
      } catch (e) {
        if (live) {
          setBusy(false);
          setError(
            e instanceof Error
              ? e.message
              : translate("Não foi possível concluir."),
          );
        }
      }
    }
    void advance();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [id, retry]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (!connection) {
        const r = await apiJson<{ url: string }>("connectors/contaazul/start", {
          label,
        });
        location.assign(r.url);
        return;
      }
      const r = await apiJson<{ id: string }>("connectors/contaazul/watch", {
        connectionId: connection.id,
        name,
        options,
      });
      setId(r.id);
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
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="connection-dialog omie-dialog contaazul-dialog">
        <DialogHeader>
          <DialogTitle>{translate("Conectar Conta Azul")}</DialogTitle>
          <DialogDescription>
            {translate(
              "Autorize sua empresa e receba um painel financeiro editável.",
            )}
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p className="connection-alert" role="alert">
            {translate(error)}
          </p>
        )}
        {id ? (
          <section className="omie-review" aria-live="polite">
            <h3>
              {progress?.status === "ready"
                ? translate("Seu painel financeiro está pronto")
                : translate("Preparando seu painel financeiro")}
            </h3>
            {progress?.status !== "ready" && (
              <>
                <progress
                  style={{ width: "100%" }}
                  value={progress?.completed || 0}
                  max={progress?.total || 1}
                />
                <p>
                  {translate("{v0} de {v1} etapas · {v2} parcelas", {
                    v0: progress?.completed || 0,
                    v1: progress?.total || 1,
                    v2: progress?.rows || 0,
                  })}
                </p>
                <p>
                  {translate(
                    "Você pode fechar esta tela. A atualização agendada continua a carga e preserva seus dados anteriores até terminar.",
                  )}
                </p>
              </>
            )}
            {progress?.status === "ready" && (
              <button
                className="primary-button"
                onClick={() => {
                  onClose();
                  onAnalyze(progress.sourceId);
                }}
              >
                {translate("Abrir painel financeiro")}
              </button>
            )}
            {error && (
              <div className="watched-actions">
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => {
                    setError("");
                    setRetry((v) => v + 1);
                  }}
                >
                  {translate("Tentar novamente")}
                </button>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => {
                    setId(undefined);
                    setError("");
                  }}
                >
                  {translate("Revisar período e reiniciar")}
                </button>
              </div>
            )}
            <button className="text-button" onClick={onClose}>
              {translate("Fechar")}
            </button>
          </section>
        ) : (
          <form className="omie-fields contaazul-fields" onSubmit={submit}>
            {!connection ? (
              <>
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
                <p>
                  {translate(
                    "Você entrará na própria Conta Azul para autorizar o acesso. Sua senha não é solicitada pelo DriveVision.",
                  )}
                </p>
              </>
            ) : (
              <>
                <label>
                  {translate("Nome da fonte")}
                  <input
                    required
                    maxLength={120}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <label>
                  {translate("Período acompanhado")}
                  <select
                    value={options.periodDays}
                    onChange={(e) =>
                      setOptions({
                        ...options,
                        periodDays: Number(e.target.value) as 30 | 90 | 365,
                      })
                    }
                  >
                    {[30, 90, 365].map((d) => (
                      <option value={d} key={d}>
                        {translate("Últimos {v0} dias", { v0: d })}
                      </option>
                    ))}
                  </select>
                </label>
                <p>
                  {translate(
                    "Inclui também os próximos 30 dias, pela data de vencimento. Até 20 mil parcelas por fonte.",
                  )}
                </p>
                <label>
                  {translate("Horário da atualização diária")}
                  <input
                    type="time"
                    required
                    value={options.daily.time}
                    onChange={(e) =>
                      setOptions({
                        ...options,
                        daily: { ...options.daily, time: e.target.value },
                      })
                    }
                  />
                </label>
                <p>
                  {translate(
                    "Horário de Brasília. Contas a pagar, a receber e vencidas serão organizadas automaticamente.",
                  )}
                </p>
                <p>
                  {translate(
                    "Recebido e pago são acumulados das parcelas selecionadas; não representam o fluxo por data de pagamento.",
                  )}
                </p>
              </>
            )}
            <button className="primary-button" type="submit" disabled={busy}>
              {busy
                ? translate("Aguarde…")
                : connection
                  ? translate("Importar e criar painel financeiro")
                  : translate("Autorizar na Conta Azul")}
            </button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
