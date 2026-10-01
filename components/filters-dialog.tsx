"use client";
import { t as translate, locale } from "@/lib/i18n";
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
          <DialogTitle>{translate("Filtros do dashboard")}</DialogTitle>
          <DialogDescription>
            {translate(
              " Combine condições para controlar quais registros entram em todos os gráficos. ",
            )}
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
            {count} {translate(" de ")}
            {source.rows.length}{" "}
            {translate(
              " linhas atendem às condições na base preparada. Os filtros de período e categoria também se aplicam. ",
            )}
          </p>
          {error && (
            <div className="model-error" role="alert">
              {translate(error)}
            </div>
          )}
        </div>
        <div className="model-footer">
          <button
            className="secondary-button"
            onClick={() => setDraft({ mode: "and", rules: [] })}
          >
            {translate(" Limpar condições ")}
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
            {translate(" Aplicar filtros ")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
