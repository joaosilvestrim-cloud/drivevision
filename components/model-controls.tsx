"use client";
import { Plus, Trash2 } from "lucide-react";
import type { Source } from "@/lib/analytics";
import { OPERATORS, type FilterSet, type Rule } from "@/lib/data-model";

export function Field({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <label className="model-field">
      <span>{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
export function TextField({
  label,
  value,
  onChange,
  placeholder = "",
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="model-field">
      <span>{label}</span>
      <input
        type={type}
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}
export function FilterBuilder({
  source,
  value,
  onChange,
}: {
  source: Source;
  value: FilterSet;
  onChange: (value: FilterSet) => void;
}) {
  function update(id: string, patch: Partial<Rule>) {
    onChange({
      ...value,
      rules: value.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    });
  }
  return (
    <div className="filter-builder">
      <Field
        label="Combinar condições"
        value={value.mode}
        onChange={(mode) =>
          onChange({ ...value, mode: mode as FilterSet["mode"] })
        }
        options={[
          { value: "and", label: "Todas as condições (E)" },
          { value: "or", label: "Qualquer condição (OU)" },
        ]}
      />
      {!value.rules.length && (
        <div className="model-empty">
          Sem condições. Todos os registros participam da análise.
        </div>
      )}
      {value.rules.map((r, index) => (
        <div className="filter-condition" key={r.id}>
          <div className="model-section-label">
            CONDIÇÃO {index + 1}
            <button
              type="button"
              aria-label={`Remover condição ${index + 1}`}
              onClick={() =>
                onChange({
                  ...value,
                  rules: value.rules.filter((x) => x.id !== r.id),
                })
              }
            >
              <Trash2 size={14} />
            </button>
          </div>
          <Field
            label={`Campo da condição ${index + 1}`}
            value={r.field}
            onChange={(field) => update(r.id, { field, value: "", end: "" })}
            options={source.columns.map((c) => ({ value: c, label: c }))}
          />
          <Field
            label={`Operador da condição ${index + 1}`}
            value={r.op}
            onChange={(op) => update(r.id, { op: op as Rule["op"] })}
            options={OPERATORS}
          />
          {!["empty", "filled"].includes(r.op) && (
            <>
              <TextField
                label={`Valor da condição ${index + 1}`}
                value={r.value}
                onChange={(v) => update(r.id, { value: v })}
                placeholder={
                  source.dates.includes(r.field)
                    ? "AAAA-MM-DD ou DD/MM/AAAA"
                    : "Valor"
                }
              />
              {r.op === "between" && (
                <TextField
                  label={`Até, condição ${index + 1}`}
                  value={r.end ?? ""}
                  onChange={(end) => update(r.id, { end })}
                />
              )}
            </>
          )}
        </div>
      ))}
      <button
        type="button"
        className="secondary-button"
        disabled={value.rules.length >= 12}
        onClick={() =>
          onChange({
            ...value,
            rules: [
              ...value.rules,
              {
                id: crypto.randomUUID(),
                field: source.columns[0],
                op: "eq",
                value: "",
              },
            ],
          })
        }
      >
        <Plus size={15} /> Adicionar condição
      </button>
      <p className="model-note">
        Condições numéricas e de data usam o tipo da coluna. Textos são
        comparados sem diferença de maiúsculas ou acentos.
      </p>
    </div>
  );
}
