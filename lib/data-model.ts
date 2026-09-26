import {
  normalize,
  parseDate,
  parseNumber,
  type DataRow,
  type Source,
} from "./analytics.ts";

export type Rule = {
  id: string;
  field: string;
  op:
    | "eq"
    | "neq"
    | "contains"
    | "notContains"
    | "gt"
    | "gte"
    | "lt"
    | "lte"
    | "between"
    | "empty"
    | "filled";
  value: string;
  end?: string;
};
export type FilterSet = { mode: "and" | "or"; rules: Rule[] };
export type DataStep = {
  id: string;
  kind:
    | "rename"
    | "type"
    | "trim"
    | "upper"
    | "lower"
    | "replace"
    | "fill"
    | "calculate"
    | "conditional"
    | "datepart"
    | "deduplicate"
    | "filter"
    | "edit";
  field: string;
  value: string;
  extra?: string;
  fields?: string[];
  filters?: FilterSet;
};
export const OPERATORS = [
  { value: "eq", label: "É igual a" },
  { value: "neq", label: "É diferente de" },
  { value: "contains", label: "Contém" },
  { value: "notContains", label: "Não contém" },
  { value: "gt", label: "Maior que / depois de" },
  { value: "gte", label: "Maior ou igual" },
  { value: "lt", label: "Menor que / antes de" },
  { value: "lte", label: "Menor ou igual" },
  { value: "between", label: "Está entre" },
  { value: "empty", label: "Está vazio" },
  { value: "filled", label: "Está preenchido" },
];
export const STEP_NAMES: Record<DataStep["kind"], string> = {
  rename: "Renomear coluna",
  type: "Alterar tipo",
  trim: "Remover espaços",
  upper: "Texto em maiúsculas",
  lower: "Texto em minúsculas",
  replace: "Substituir valor",
  fill: "Preencher vazios",
  calculate: "Coluna calculada",
  conditional: "Coluna condicional (se / senão)",
  datepart: "Extrair período de uma data",
  deduplicate: "Remover duplicados",
  filter: "Filtrar linhas",
  edit: "Editar célula",
};

function comparable(
  value: string,
  field: string,
  source: Source,
): number | string | null {
  if (source.numeric.includes(field)) return parseNumber(value);
  if (source.dates.includes(field)) return parseDate(value);
  return normalize(value);
}
export function matchesRule(row: DataRow, rule: Rule, source: Source): boolean {
  if (!source.columns.includes(rule.field)) return false;
  const raw = row[rule.field] ?? "";
  if (rule.op === "empty") return !raw.trim();
  if (rule.op === "filled") return !!raw.trim();
  if (rule.op === "contains" || rule.op === "notContains") {
    const found = normalize(raw).includes(normalize(rule.value));
    return rule.op === "contains" ? found : !found;
  }
  const a = comparable(raw, rule.field, source),
    b = comparable(rule.value, rule.field, source);
  if (a === null || b === null) return false;
  if (rule.op === "eq") return a === b;
  if (rule.op === "neq") return a !== b;
  if (rule.op === "gt") return a > b;
  if (rule.op === "gte") return a >= b;
  if (rule.op === "lt") return a < b;
  if (rule.op === "lte") return a <= b;
  const c = comparable(rule.end ?? "", rule.field, source);
  return c !== null && a >= b && a <= c;
}
export function applyFilters(
  rows: DataRow[],
  source: Source,
  filters?: FilterSet,
) {
  if (!filters?.rules.length) return rows;
  return rows.filter((row) =>
    filters.mode === "or"
      ? filters.rules.some((rule) => matchesRule(row, rule, source))
      : filters.rules.every((rule) => matchesRule(row, rule, source)),
  );
}
export function validateFilters(source: Source, filters?: FilterSet) {
  for (const rule of filters?.rules ?? []) {
    if (!source.columns.includes(rule.field))
      throw new Error(`A coluna “${rule.field}” não existe neste resultado.`);
    if (["empty", "filled"].includes(rule.op)) continue;
    if (!rule.value.trim())
      throw new Error(
        "Preencha o valor de cada condição. Para vazios, use “Está vazio”.",
      );
    if (["contains", "notContains"].includes(rule.op)) continue;
    const first = comparable(rule.value, rule.field, source);
    if (first === null)
      throw new Error(
        `Valor inválido para “${rule.field}”. Use número ou data no formato da coluna.`,
      );
    if (rule.op === "between") {
      const end = comparable(rule.end ?? "", rule.field, source);
      if (!rule.end?.trim() || end === null || end < first)
        throw new Error("Informe um intervalo válido, do menor para o maior.");
    }
  }
}

// Arithmetic grammar, never JavaScript: only numbers, column references and + - * / ().
type Expr =
  | { kind: "number"; value: number }
  | { kind: "field"; value: string }
  | { kind: "op"; value: string; left: Expr; right: Expr };
export function compileFormula(
  formula: string,
  columns: string[],
): (row: DataRow) => number | null {
  if (!formula.trim() || formula.length > 600)
    throw new Error("Escreva uma fórmula com até 600 caracteres.");
  const tokens: { kind: string; value: string }[] = [];
  let i = 0;
  while (i < formula.length) {
    if (/\s/.test(formula[i])) {
      i++;
      continue;
    }
    if (formula[i] === "[") {
      const end = formula.indexOf("]", i + 1);
      if (end < 0) throw new Error("Feche a referência à coluna com ].");
      const value = formula.slice(i + 1, end);
      if (!columns.includes(value))
        throw new Error(`Coluna não encontrada: ${value}.`);
      tokens.push({ kind: "field", value });
      i = end + 1;
      continue;
    }
    const number = formula.slice(i).match(/^(?:\d+(?:[.,]\d+)?|[.,]\d+)/);
    if (number) {
      tokens.push({ kind: "number", value: number[0].replace(",", ".") });
      i += number[0].length;
      continue;
    }
    if ("+-*/()".includes(formula[i])) {
      tokens.push({ kind: formula[i], value: formula[i++] });
      continue;
    }
    throw new Error(
      "Use [Nome da coluna], números, parênteses e os operadores + − * /.",
    );
  }
  let index = 0;
  function primary(depth: number): Expr {
    if (depth > 30) throw new Error("A fórmula tem parênteses demais.");
    const token = tokens[index++];
    if (!token) throw new Error("A fórmula está incompleta.");
    if (token.kind === "number")
      return { kind: "number", value: Number(token.value) };
    if (token.kind === "field") return { kind: "field", value: token.value };
    if (token.kind === "-" || token.kind === "+")
      return {
        kind: "op",
        value: token.kind,
        left: { kind: "number", value: 0 },
        right: primary(depth + 1),
      };
    if (token.kind === "(") {
      const expression = add(depth + 1);
      if (tokens[index++]?.kind !== ")")
        throw new Error("Confira o fechamento dos parênteses.");
      return expression;
    }
    throw new Error("Há um operador fora de posição.");
  }
  function multiply(depth: number): Expr {
    let expression = primary(depth);
    while (["*", "/"].includes(tokens[index]?.kind)) {
      const op = tokens[index++].kind;
      expression = {
        kind: "op",
        value: op,
        left: expression,
        right: primary(depth),
      };
    }
    return expression;
  }
  function add(depth: number): Expr {
    let expression = multiply(depth);
    while (["+", "-"].includes(tokens[index]?.kind)) {
      const op = tokens[index++].kind;
      expression = {
        kind: "op",
        value: op,
        left: expression,
        right: multiply(depth),
      };
    }
    return expression;
  }
  const expression = add(0);
  if (index !== tokens.length)
    throw new Error("Faltou um operador entre os valores.");
  function evaluate(expr: Expr, row: DataRow): number | null {
    if (expr.kind === "number") return expr.value;
    if (expr.kind === "field") return parseNumber(row[expr.value] ?? "");
    const a = evaluate(expr.left, row),
      b = evaluate(expr.right, row);
    if (a === null || b === null || (expr.value === "/" && b === 0))
      return null;
    const result =
      expr.value === "+"
        ? a + b
        : expr.value === "-"
          ? a - b
          : expr.value === "*"
            ? a * b
            : a / b;
    return Number.isFinite(result) ? result : null;
  }
  return (row) => evaluate(expression, row);
}

export function prepareSource(original: Source, steps: DataStep[] = []) {
  let source: Source = {
    ...original,
    columns: [...original.columns],
    numeric: [...original.numeric],
    dates: [...original.dates],
    rows: original.rows,
  };
  const reports: {
    id: string;
    label: string;
    before: number;
    after: number;
    invalid: number;
  }[] = [];
  const aliases: Record<string, string> = Object.fromEntries(
    original.columns.map((c) => [c, c]),
  );
  let error: string | undefined;
  for (const step of steps) {
    const before = source.rows.length;
    let invalid = 0;
    try {
      if (
        !["calculate", "conditional", "deduplicate", "filter"].includes(
          step.kind,
        ) &&
        !source.columns.includes(step.field)
      )
        throw new Error(`Coluna não encontrada: ${step.field}.`);
      const map = (fn: (r: DataRow) => DataRow) => {
        source = { ...source, rows: source.rows.map(fn) };
      };
      if (step.kind === "rename") {
        const name = step.value.trim();
        if (
          !name ||
          name.includes("]") ||
          source.columns.some(
            (c) => c !== step.field && normalize(c) === normalize(name),
          )
        )
          throw new Error("Use um nome único e sem ].");
        map((r) =>
          Object.fromEntries(
            Object.entries(r).map(([k, v]) => [k === step.field ? name : k, v]),
          ),
        );
        source = {
          ...source,
          columns: source.columns.map((c) => (c === step.field ? name : c)),
          numeric: source.numeric.map((c) => (c === step.field ? name : c)),
          dates: source.dates.map((c) => (c === step.field ? name : c)),
        };
        for (const key of Object.keys(aliases))
          if (aliases[key] === step.field) aliases[key] = name;
        aliases[step.field] = name;
      } else if (step.kind === "calculate") {
        const name = step.field.trim();
        if (
          !name ||
          name.includes("]") ||
          source.columns.some((c) => normalize(c) === normalize(name))
        )
          throw new Error("A coluna calculada precisa de um nome novo, sem ].");
        if (source.columns.length >= 100)
          throw new Error("O limite do modelo é de 100 colunas.");
        const formula = compileFormula(step.value, source.columns);
        map((r) => {
          const n = formula(r);
          if (n === null) invalid++;
          return { ...r, [name]: n === null ? "" : String(n) };
        });
        source = {
          ...source,
          columns: [...source.columns, name],
          numeric: [...source.numeric, name],
        };
        aliases[name] = name;
      } else if (step.kind === "conditional" || step.kind === "datepart") {
        const name = (
          step.kind === "conditional" ? step.field : (step.extra ?? "")
        ).trim();
        if (
          !name ||
          name.includes("]") ||
          source.columns.some((c) => normalize(c) === normalize(name))
        )
          throw new Error("Informe um nome novo e único para a coluna, sem ].");
        if (source.columns.length >= 100)
          throw new Error("O limite do modelo é de 100 colunas.");
        if (step.kind === "conditional") {
          if (!step.filters?.rules.length)
            throw new Error("Adicione pelo menos uma condição.");
          validateFilters(source, step.filters);
          const matched = new Set(
            applyFilters(source.rows, source, step.filters),
          );
          map((r) => ({
            ...r,
            [name]: matched.has(r) ? step.value : (step.extra ?? ""),
          }));
        } else {
          if (!["year", "month", "quarter", "weekday"].includes(step.value))
            throw new Error("Escolha o período que deseja extrair.");
          map((r) => {
            const t = parseDate(r[step.field]);
            if (t === null) {
              if (r[step.field]) invalid++;
              return { ...r, [name]: "" };
            }
            const d = new Date(t),
              y = d.getUTCFullYear(),
              m = d.getUTCMonth();
            return {
              ...r,
              [name]:
                step.value === "year"
                  ? String(y)
                  : step.value === "month"
                    ? `${y}-${String(m + 1).padStart(2, "0")}`
                    : step.value === "quarter"
                      ? `${y}-T${Math.floor(m / 3) + 1}`
                      : [
                          "Domingo",
                          "Segunda",
                          "Terça",
                          "Quarta",
                          "Quinta",
                          "Sexta",
                          "Sábado",
                        ][d.getUTCDay()],
            };
          });
        }
        source = { ...source, columns: [...source.columns, name] };
        aliases[name] = name;
      } else if (step.kind === "type") {
        if (!["number", "date", "text"].includes(step.value))
          throw new Error("Escolha um tipo válido.");
        if (step.value !== "text")
          map((r) => {
            const raw = r[step.field];
            const n =
              step.value === "number" ? parseNumber(raw) : parseDate(raw);
            if (raw && n === null) invalid++;
            return {
              ...r,
              [step.field]:
                n === null
                  ? ""
                  : step.value === "number"
                    ? String(n)
                    : new Date(n).toISOString().slice(0, 10),
            };
          });
        source = {
          ...source,
          numeric: source.numeric
            .filter((c) => c !== step.field)
            .concat(step.value === "number" ? [step.field] : []),
          dates: source.dates
            .filter((c) => c !== step.field)
            .concat(step.value === "date" ? [step.field] : []),
        };
      } else if (step.kind === "deduplicate") {
        const fields = step.fields?.length ? step.fields : source.columns;
        if (fields.some((c) => !source.columns.includes(c)))
          throw new Error("Uma coluna de deduplicação não existe.");
        const seen = new Set<string>();
        source = {
          ...source,
          rows: source.rows.filter((r) => {
            const key = JSON.stringify(fields.map((c) => r[c]));
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          }),
        };
      } else if (step.kind === "filter") {
        validateFilters(source, step.filters);
        source = {
          ...source,
          rows: applyFilters(source.rows, source, step.filters),
        };
      } else {
        if (["replace", "fill", "edit"].includes(step.kind)) {
          const replacement =
            step.kind === "replace" ? (step.extra ?? "") : step.value;
          if (
            replacement &&
            source.numeric.includes(step.field) &&
            parseNumber(replacement) === null
          )
            throw new Error(
              "O novo valor precisa ser numérico. Altere o tipo para texto se necessário.",
            );
          if (
            replacement &&
            source.dates.includes(step.field) &&
            parseDate(replacement) === null
          )
            throw new Error("O novo valor precisa ser uma data válida.");
        }
        if (step.kind === "edit") {
          const index = Number(step.extra);
          if (
            !Number.isInteger(index) ||
            index < 0 ||
            index >= source.rows.length
          )
            throw new Error("A linha da edição não existe mais.");
          source = {
            ...source,
            rows: source.rows.map((r, i) =>
              i === index ? { ...r, [step.field]: step.value } : r,
            ),
          };
        } else
          map((r) => {
            const value = r[step.field] ?? "";
            return {
              ...r,
              [step.field]:
                step.kind === "trim"
                  ? value.trim()
                  : step.kind === "upper"
                    ? value.toLocaleUpperCase("pt-BR")
                    : step.kind === "lower"
                      ? value.toLocaleLowerCase("pt-BR")
                      : step.kind === "fill"
                        ? !value.trim()
                          ? step.value
                          : value
                        : value === step.value
                          ? (step.extra ?? "")
                          : value,
            };
          });
      }
      reports.push({
        id: step.id,
        label: STEP_NAMES[step.kind],
        before,
        after: source.rows.length,
        invalid,
      });
    } catch (cause) {
      error = `Etapa ${reports.length + 1}: ${cause instanceof Error ? cause.message : "Não foi possível aplicar."}`;
      break;
    }
  }
  return { source, reports, aliases, error };
}
export function profileColumn(source: Source, field: string) {
  const values = source.rows.map((r) => r[field] ?? ""),
    filled = values.filter((v) => v.trim()),
    numbers = filled.map(parseNumber).filter((v): v is number => v !== null);
  const frequencies = new Map<string, number>();
  for (const value of values)
    frequencies.set(value, (frequencies.get(value) ?? 0) + 1);
  return {
    empty: values.length - filled.length,
    distinct: new Set(filled).size,
    invalid: source.numeric.includes(field)
      ? filled.length - numbers.length
      : source.dates.includes(field)
        ? filled.filter((v) => parseDate(v) === null).length
        : 0,
    min: numbers.length ? Math.min(...numbers) : null,
    max: numbers.length ? Math.max(...numbers) : null,
    top: [...frequencies].sort((a, b) => b[1] - a[1]).slice(0, 5),
  };
}
