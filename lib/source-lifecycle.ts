import { parseDate, DEMO, type Source, type DataRow } from "./analytics.ts";
import { combineSources, type CombineOptions } from "./exploration.ts";

export type LoadOptions = {
  mode: "append" | "upsert" | "replace-period";
  keys: string[];
  dateField?: string;
  start?: string;
  end?: string;
};
export type LoadSummary = {
  added: number;
  updated: number;
  unchanged: number;
  removed: number;
  duplicates: number;
};
export type SourceRecipe = {
  leftId: string;
  rightId: string;
  rightName: string;
  options: CombineOptions;
};
export function assertSourceCompatible(before: Source, after: Source) {
  if (
    before.columns.length !== after.columns.length ||
    before.columns.some((c) => !after.columns.includes(c)) ||
    before.columns.some(
      (c) =>
        before.numeric.includes(c) !== after.numeric.includes(c) ||
        before.dates.includes(c) !== after.dates.includes(c),
    )
  )
    throw new Error(
      "As colunas ou seus tipos mudaram. Ajuste o mapeamento antes de atualizar esta base.",
    );
}
const signature = (row: DataRow, columns: string[]) =>
  JSON.stringify(columns.map((c) => row[c] ?? ""));
export function planLoad(
  before: Source,
  incoming: Source,
  options: LoadOptions,
): { source: Source; summary: LoadSummary } {
  if (before.recipe)
    throw new Error("Atualize as origens desta base combinada.");
  assertSourceCompatible(before, incoming);
  if (
    !options.keys.length ||
    new Set(options.keys).size !== options.keys.length ||
    options.keys.some((k) => !before.columns.includes(k))
  )
    throw new Error(
      "Selecione as colunas que identificam cada operação, como ID da venda e ID do item.",
    );
  const key = (r: DataRow) => {
    if (options.keys.some((k) => !(r[k] ?? "").trim()))
      throw new Error(
        "Há identificadores vazios. Corrija-os antes de publicar.",
      );
    return signature(r, options.keys);
  };
  const old = new Map<string, DataRow>();
  for (const row of before.rows) {
    const k = key(row);
    if (old.has(k))
      throw new Error(
        "A chave escolhida se repete na base atual. Inclua outra coluna na identificação.",
      );
    old.set(k, row);
  }
  const summary: LoadSummary = {
    added: 0,
    updated: 0,
    unchanged: 0,
    removed: 0,
    duplicates: 0,
  };
  const fresh = new Map<string, DataRow>();
  for (const row of incoming.rows) {
    const k = key(row),
      prior = fresh.get(k);
    if (prior) {
      if (signature(prior, before.columns) !== signature(row, before.columns))
        throw new Error(
          "O arquivo contém valores conflitantes para a mesma chave. Corrija antes de publicar.",
        );
      summary.duplicates++;
    } else fresh.set(k, row);
  }
  let result = new Map(old);
  if (options.mode === "replace-period") {
    const field = options.dateField || "",
      start = parseDate(options.start || ""),
      end = parseDate(options.end || "");
    if (
      !before.dates.includes(field) ||
      start === null ||
      end === null ||
      start > end
    )
      throw new Error("Escolha uma coluna de data e um período válido.");
    const inside = (r: DataRow) => {
      const date = parseDate(r[field] || "");
      if (date === null)
        throw new Error(
          "Há datas inválidas ou vazias. Não é seguro substituir o período.",
        );
      return date >= start && date <= end;
    };
    result = new Map([...old].filter(([, r]) => !inside(r)));
    for (const [k, row] of fresh) {
      if (!inside(row))
        throw new Error(
          "O arquivo contém registros fora do período selecionado.",
        );
      if (result.has(k))
        throw new Error(
          "Uma chave do arquivo já existe fora do período. Use atualização por identificador.",
        );
    }
    summary.removed = [...old].filter(
      ([k, r]) => inside(r) && !fresh.has(k),
    ).length;
  }
  for (const [k, row] of fresh) {
    const previous = old.get(k);
    if (!previous) summary.added++;
    else if (
      signature(previous, before.columns) === signature(row, before.columns)
    )
      summary.unchanged++;
    else {
      if (options.mode === "append")
        throw new Error(
          "Há operações já existentes com valores diferentes. Escolha Atualizar por identificador para revisá-las.",
        );
      summary.updated++;
    }
    result.set(k, row);
  }
  if (result.size > 20000)
    throw new Error("O resultado ultrapassa 20 mil registros por base.");
  return {
    source: {
      ...before,
      rows: [...result.values()],
      importNotes: incoming.importNotes,
      lastLoad: {
        ...options,
        at: new Date().toISOString(),
        file: incoming.importNotes?.file || incoming.name,
        summary,
      },
    },
    summary,
  };
}

// Rebuild the full graph in memory before publishing anything. Failed joins leave all sources intact.
export function refreshDerived(sources: Source[]): Source[] {
  const resolved = new Map<string, Source>([[DEMO.id, DEMO]]),
    visiting = new Set<string>();
  const byId = new Map(sources.map((s) => [s.id, s]));
  function visit(id: string): Source {
    const cached = resolved.get(id);
    if (cached) return cached;
    const source = byId.get(id);
    if (!source)
      throw new Error(
        "Uma base combinada depende de uma origem ausente. Exclua a combinação primeiro.",
      );
    if (visiting.has(id))
      throw new Error("As bases combinadas formam uma dependência circular.");
    visiting.add(id);
    let next = source;
    if (source.recipe) {
      const r = source.recipe;
      const combined = combineSources(
        visit(r.leftId),
        { ...visit(r.rightId), name: r.rightName },
        r.options,
      ).source;
      assertSourceCompatible(source, combined);
      next = { ...source, rows: combined.rows };
    }
    visiting.delete(id);
    resolved.set(id, next);
    return next;
  }
  return sources.map((s) => visit(s.id));
}
