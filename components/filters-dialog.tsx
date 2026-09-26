"use client";
import { useMemo, useState } from "react";
import { Filter } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { FilterBuilder } from "./model-controls";
import {
  applyFilters,
  validateFilters,
  type FilterSet,
} from "@/lib/data-model";
import type { Source } from "@/lib/analytics";
export function FiltersDialog({
  source,
  value,
  onApply,
  onClose,
}: {
  source: Source;
  value?: FilterSet;
  onApply: (v: FilterSet) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<FilterSet>(
      value ?? { mode: "and", rules: [] },
    ),
    [error, setError] = useState("");
  const count = useMemo(
    () => applyFilters(source.rows, source, draft).length,
    [source, draft],
  );
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="model-dialog filters-dialog">
        <DialogHeader className="model-header">
          <div className="model-eyebrow">
            <Filter size={16} /> RECORTE DA ANÁLISE
          </div>
          <DialogTitle>Filtros do dashboard</DialogTitle>
          <DialogDescription>
            Combine condições para controlar quais registros entram em todos os
            gráficos.
          </DialogDescription>
        </DialogHeader>
        <div className="settings-stack">
          <FilterBuilder
            source={source}
            value={draft}
            onChange={(v) => {
              setDraft(v);
              setError("");
            }}
          />
          <p className="filter-preview-count">
            {count} de {source.rows.length} linhas atendem às condições na base
            preparada. Os filtros de período e categoria também se aplicam.
          </p>
          {error && (
            <div className="model-error" role="alert">
              {error}
            </div>
          )}
        </div>
        <div className="model-footer">
          <button
            className="secondary-button"
            onClick={() => setDraft({ mode: "and", rules: [] })}
          >
            Limpar condições
          </button>
          <button
            className="primary-button"
            onClick={() => {
              try {
                validateFilters(source, draft);
                onApply(draft);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Revise os filtros.");
              }
            }}
          >
            Aplicar filtros
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
