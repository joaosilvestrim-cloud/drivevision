"use client";
import { useState } from "react";
import { ArrowRight, Upload, Cloud, Play, Pencil } from "lucide-react";
import { t as translate } from "@/lib/i18n";
import type { Source } from "@/lib/analytics";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";

export function DashboardStart({
  sources,
  onClose,
  onImport,
  onConnect,
  onGuided,
  onBlank,
  onDemo,
}: {
  sources: Source[];
  onClose: () => void;
  onImport: () => void;
  onConnect: () => void;
  onGuided: (source: Source) => void;
  onBlank: () => void;
  onDemo: () => void;
}) {
  const available = sources.filter((s) => !s.demo);
  const [sourceId, setSourceId] = useState(available[0]?.id || "");
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="app-dialog journey-start">
        <DialogHeader>
          <DialogTitle>{translate("Como você quer começar?")}</DialogTitle>
          <DialogDescription>
            {translate(
              "Traga seus dados. Nós ajudamos a conferir as colunas e preparar um primeiro painel para você explorar.",
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="journey-options">
          <button className="journey-option preferred" onClick={onImport}>
            <Upload size={23} />
            <span>
              <strong>{translate("Enviar minha planilha")}</strong>
              <small>
                {translate(
                  "Excel ou CSV → confira os dados → receba seu painel pronto.",
                )}
              </small>
            </span>
            <ArrowRight size={19} />
          </button>
          {available.length > 0 && (
            <div className="journey-existing">
              <label htmlFor="journey-source">
                {translate("Usar uma fonte já cadastrada")}
              </label>
              <select
                id="journey-source"
                value={sourceId}
                onChange={(e) => setSourceId(e.target.value)}
              >
                {available.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <button
                className="secondary-button"
                onClick={() => {
                  const s = available.find((s) => s.id === sourceId);
                  if (s) onGuided(s);
                }}
              >
                {translate("Preparar painel com esta fonte")}
                <ArrowRight size={16} />
              </button>
            </div>
          )}
          <button className="journey-option" onClick={onConnect}>
            <Cloud size={23} />
            <span>
              <strong>{translate("Conectar OneDrive ou SharePoint")}</strong>
              <small>
                {translate(
                  "Autorize sua conta, escolha o conteúdo e depois prepare o painel.",
                )}
              </small>
            </span>
            <ArrowRight size={19} />
          </button>
          <button className="journey-option" onClick={onDemo}>
            <Play size={23} />
            <span>
              <strong>{translate("Experimentar um painel pronto")}</strong>
              <small>
                {translate(
                  "Explore dados fictícios e descubra o que pode fazer antes de enviar os seus.",
                )}
              </small>
            </span>
            <ArrowRight size={19} />
          </button>
        </div>
        <button className="text-button journey-advanced" onClick={onBlank}>
          <Pencil size={16} />
          {translate("Já sei o que quero: montar em branco")}
        </button>
      </DialogContent>
    </Dialog>
  );
}

export function ImportProgress({ step }: { step: 0 | 1 | 2 }) {
  const labels = [
    translate("Seu negócio e arquivo"),
    translate("Conferir a tabela"),
    translate("Revisar e abrir painel"),
  ];
  return (
    <ol
      className="journey-progress"
      aria-label={translate("Etapas da importação")}
    >
      {labels.map((label, i) => (
        <li
          key={i}
          aria-current={i === step ? "step" : undefined}
          className={i < step ? "completed" : ""}
        >
          <span>{i + 1}</span>
          {label}
        </li>
      ))}
    </ol>
  );
}
