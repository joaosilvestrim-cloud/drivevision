"use client";
import { useState } from "react";
import { BookmarkPlus, X, RotateCcw } from "lucide-react";
import type { Config } from "@/lib/analytics";
export function BookmarkBar({
  config,
  onChange,
}: {
  config: Config;
  onChange: (c: Config) => void;
}) {
  const [adding, setAdding] = useState(false),
    [name, setName] = useState("");
  const bookmarks = config.bookmarks ?? [],
    hasFilters =
      !!config.filter ||
      !!config.filters?.rules.length ||
      !!config.selections?.length ||
      config.period !== "all";
  function save() {
    if (!name.trim() || bookmarks.length >= 12) return;
    onChange({
      ...config,
      bookmarks: [
        ...bookmarks,
        {
          id: crypto.randomUUID(),
          name: name.trim(),
          period: config.period,
          filter: config.filter,
          filters: config.filters,
          selections: config.selections,
        },
      ],
    });
    setName("");
    setAdding(false);
  }
  return (
    <div className="bookmark-bar">
      <span className="bookmark-label">RECORTES</span>
      {bookmarks.map((b) => (
        <div className="bookmark-chip" key={b.id}>
          <button
            onClick={() =>
              onChange({
                ...config,
                period: b.period,
                filter: b.filter,
                filters: b.filters,
                selections: b.selections,
              })
            }
            title="Restaurar filtros deste recorte"
          >
            {b.name}
          </button>
          <button
            aria-label={`Remover recorte ${b.name}`}
            onClick={() =>
              onChange({
                ...config,
                bookmarks: bookmarks.filter((x) => x.id !== b.id),
              })
            }
          >
            <X size={12} />
          </button>
        </div>
      ))}
      <button
        className="bookmark-action"
        disabled={bookmarks.length >= 12}
        onClick={() => setAdding(!adding)}
      >
        <BookmarkPlus size={15} />
        Guardar recorte
      </button>
      {hasFilters && (
        <button
          className="bookmark-action"
          onClick={() =>
            onChange({
              ...config,
              period: "all",
              filter: undefined,
              filters: undefined,
              selections: undefined,
            })
          }
        >
          <RotateCcw size={14} />
          Limpar filtros do painel
        </button>
      )}
      {adding && (
        <form
          className="bookmark-form"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <input
            autoFocus
            maxLength={60}
            aria-label="Nome do recorte"
            placeholder="Ex.: Sul · últimos 30 dias"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button className="primary-button" disabled={!name.trim()}>
            Guardar
          </button>
          <span>Incluído ao salvar o dashboard.</span>
        </form>
      )}
      {config.selections?.map((s, i) => (
        <span className="selection-chip" key={`${s.field}-${i}`}>
          {s.field}: {s.value}
          <button
            aria-label={`Remover seleção ${s.field}`}
            onClick={() =>
              onChange({
                ...config,
                selections: config.selections?.filter(
                  (_, index) => index !== i,
                ),
              })
            }
          >
            <X size={13} />
          </button>
        </span>
      ))}
    </div>
  );
}
