import { normalize, parseDate, parseNumber, type Source } from "./analytics.ts";
export type Merge = { r0: number; r1: number; c0: number; c1: number };
export type GridSheet = {
  name: string;
  rows: string[][];
  merges: Merge[];
  formulas: number;
  uncached: number;
};
export type WorkbookData = { name: string; sheets: GridSheet[] };
export type TableCandidate = {
  header: number;
  start: number;
  end: number;
  left: number;
  right: number;
  score: number;
  reason: string;
};
export type ImportPlan = {
  header: number;
  headerDepth: number;
  end: number;
  left: number;
  right: number;
  skipTotals: boolean;
  skipRepeated: boolean;
  fillMerged: boolean;
  fillDown: number[];
  unpivot: number[];
  variableName: string;
  valueName: string;
};

function csvGrid(text: string): string[][] {
  text = text.replace(/^\uFEFF/, "");
  if (text.includes("\uFFFD"))
    throw new Error(
      "O CSV não está em UTF-8. Salve-o como CSV UTF-8 e tente novamente.",
    );
  const separators = [";", ",", "\t"];
  const sep = separators
    .map((separator) => {
      let quoted = false,
        n = 0;
      const widths: number[] = [];
      for (let i = 0; i < text.length && widths.length < 80; i++) {
        const ch = text[i];
        if (ch === '"') {
          if (quoted && text[i + 1] === '"') i++;
          else quoted = !quoted;
        } else if (!quoted && ch === separator) n++;
        else if (!quoted && ch === "\n") {
          widths.push(n);
          n = 0;
        }
      }
      widths.push(n);
      return {
        separator,
        score: widths.reduce((sum, w) => sum + (w > 0 ? w : 0), 0),
      };
    })
    .sort((a, b) => b.score - a.score)[0].separator;
  const rows: string[][] = [];
  let row: string[] = [],
    value = "",
    quoted = false,
    ended = false;
  const cell = () => {
    if (row.length >= 160)
      throw new Error("Use até 160 colunas na planilha original.");
    row.push(value.trim());
    value = "";
    ended = false;
  };
  const line = () => {
    cell();
    rows.push(row);
    row = [];
    if (rows.length > 20050)
      throw new Error("Use até 20 mil linhas de dados por aba.");
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          value += '"';
          i++;
        } else {
          quoted = false;
          ended = true;
        }
      } else value += ch;
    } else if (ch === '"') {
      if (value.trim() || ended) throw new Error("Confira as aspas do CSV.");
      quoted = true;
    } else if (ch === sep) cell();
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      line();
    } else {
      if (ended && ch.trim()) throw new Error("Confira o separador do CSV.");
      value += ch;
    }
  }
  if (quoted) throw new Error("Há aspas sem fechamento no CSV.");
  if (value || row.length || ended) line();
  return rows;
}
export async function readWorkbook(
  data: ArrayBuffer,
  name: string,
): Promise<WorkbookData> {
  if (data.byteLength > 10_000_000)
    throw new Error("Use arquivos de até 10 MB nesta versão.");
  if (/\.(csv|tsv)$/i.test(name)) {
    const rows = csvGrid(new TextDecoder("utf-8").decode(data));
    if (rows.some((r) => r.length > 160))
      throw new Error("Use até 160 colunas na planilha original.");
    return {
      name,
      sheets: [{ name: "Arquivo", rows, merges: [], formulas: 0, uncached: 0 }],
    };
  }
  if (!/\.xlsx?$/i.test(name))
    throw new Error("Selecione XLSX, XLS, CSV ou TSV.");
  const XLSX = await import("xlsx");
  const wb = XLSX.read(data, {
    type: "array",
    cellDates: true,
    cellFormula: true,
    cellText: false,
    sheetRows: 20051,
  });
  if (wb.SheetNames.length > 30)
    throw new Error("Use um arquivo com até 30 abas.");
  let count = 0;
  const sheets = wb.SheetNames.map((sheetName) => {
    const ws = wb.Sheets[sheetName];
    if (!ws["!ref"])
      return {
        name: sheetName,
        rows: [],
        merges: [],
        formulas: 0,
        uncached: 0,
      };
    const range = XLSX.utils.decode_range(ws["!fullref"] || ws["!ref"]);
    if (range.e.r >= 20050 || range.e.c >= 160)
      throw new Error(
        `A aba “${sheetName}” excede 20 mil linhas ou 160 colunas. Recorte a área utilizada antes de importar.`,
      );
    count += (range.e.r + 1) * (range.e.c + 1);
    if (count > 2_000_000)
      throw new Error(
        "A planilha excede 2 milhões de células na área utilizada. Divida o arquivo.",
      );
    let formulas = 0,
      uncached = 0;
    const rows = Array.from({ length: range.e.r + 1 }, (_, r) =>
      Array.from({ length: range.e.c + 1 }, (_, c) => {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (!cell) return "";
        if (cell.f) {
          formulas++;
          if (cell.v === undefined || cell.v === null) uncached++;
        }
        const v = cell.v;
        if (v === undefined || v === null) return "";
        if (v instanceof Date) {
          const iso = v.toISOString();
          return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso;
        }
        if (cell.t === "e") return `#ERRO(${v})`;
        return String(v).trim();
      }),
    );
    return {
      name: sheetName,
      rows,
      merges: (ws["!merges"] || []).map((m) => ({
        r0: m.s.r,
        r1: m.e.r,
        c0: m.s.c,
        c1: m.e.c,
      })),
      formulas,
      uncached,
    };
  });
  return {
    name,
    sheets: sheets.filter((s) => s.rows.some((r) => r.some(Boolean))),
  };
}
export function detectTables(sheet: GridSheet): TableCandidate[] {
  const candidates: TableCandidate[] = [];
  const rows = sheet.rows;
  for (let i = 0; i < Math.min(rows.length - 1, 1000); i++) {
    const cols = rows[i].map((v, c) => (v ? c : -1)).filter((c) => c >= 0);
    if (cols.length < 2) continue;
    const left = cols[0],
      right = cols.at(-1)!;
    const text = cols.filter(
      (c) => parseNumber(rows[i][c]) === null && parseDate(rows[i][c]) === null,
    ).length;
    const unique =
      new Set(cols.map((c) => normalize(rows[i][c]))).size / cols.length;
    let supported = 0,
      transition = 0;
    for (const next of rows.slice(i + 1, i + 7)) {
      if (
        next.slice(left, right + 1).filter(Boolean).length >=
        Math.max(2, cols.length * 0.5)
      ) {
        supported++;
        for (const c of cols) {
          if (
            parseNumber(rows[i][c]) === null &&
            parseDate(rows[i][c]) === null &&
            (parseNumber(next[c] ?? "") !== null ||
              parseDate(next[c] ?? "") !== null)
          )
            transition++;
        }
      }
    }
    if (!supported) continue;
    const previousEmpty = i === 0 || !rows[i - 1]?.some(Boolean);
    const known = cols.filter((c) =>
      /^(data|date|nome|name|produto|regiao|cliente|valor|receita|custo|vendedor|quantidade|id|codigo|categoria|mes|ano|status)$/.test(
        normalize(rows[i][c]),
      ),
    ).length;
    const score = Math.round(
      25 * (text / cols.length) +
        15 * unique +
        Math.min(supported, 5) * 6 +
        Math.min(transition, 10) * 2 +
        (previousEmpty ? 12 : 0) +
        Math.min(known, 4) * 5,
    );
    if (text / cols.length < 0.5 || score < 55) continue;
    let end = rows.length - 1;
    for (let j = i + 1; j < rows.length; j++) {
      if (!rows[j].slice(left, right + 1).some(Boolean)) {
        end = j - 1;
        break;
      }
    }
    if (end <= i + 1) continue;
    candidates.push({
      header: i,
      start: i + 1,
      end,
      left,
      right,
      score,
      reason: `${cols.length} possíveis cabeçalhos; ${supported} linhas seguintes com estrutura semelhante${transition ? "; nomes seguidos de números ou datas" : ""}.`,
    });
  }
  const best = candidates.sort(
    (a, b) => b.score - a.score || a.header - b.header,
  );
  const selected: TableCandidate[] = [];
  for (const candidate of best) {
    if (
      selected.some(
        (c) => candidate.header > c.header && candidate.header <= c.end,
      )
    )
      continue;
    selected.push(candidate);
    if (selected.length === 8) break;
  }
  return selected;
}
export function planFor(
  sheet: GridSheet,
  candidate?: TableCandidate,
): ImportPlan {
  const c = candidate || {
    header: 0,
    end: sheet.rows.length - 1,
    left: 0,
    right: Math.max(1, ...sheet.rows.map((r) => r.length)) - 1,
  };
  return {
    header: c.header,
    headerDepth: 1,
    end: c.end,
    left: c.left,
    right: c.right,
    skipTotals: false,
    skipRepeated: true,
    fillMerged: true,
    fillDown: [],
    unpivot: [],
    variableName: "Período",
    valueName: "Valor",
  };
}
export function headerNames(sheet: GridSheet, plan: ImportPlan): string[] {
  if (
    !Number.isInteger(plan.left) ||
    !Number.isInteger(plan.right) ||
    plan.left < 0 ||
    plan.right > 159 ||
    plan.right < plan.left ||
    plan.headerDepth < 1 ||
    plan.headerDepth > 3
  )
    return [];
  const names: string[] = [];
  const seen = new Set<string>();
  for (let c = plan.left; c <= plan.right; c++) {
    const pieces: string[] = [];
    for (let r = plan.header; r < plan.header + plan.headerDepth; r++) {
      const merge = sheet.merges.find(
        (m) => r >= m.r0 && r <= m.r1 && c >= m.c0 && c <= m.c1,
      );
      const value = merge
        ? sheet.rows[merge.r0]?.[merge.c0]
        : sheet.rows[r]?.[c];
      if (value && !pieces.includes(value)) pieces.push(value);
    }
    let base = (pieces.join(" · ") || `Coluna ${c + 1}`).replace(/\]/g, ")"),
      name = base,
      n = 2;
    while (seen.has(normalize(name))) name = `${base} (${n++})`;
    seen.add(normalize(name));
    names.push(name);
  }
  return names;
}
const totalLabel = (s: string) =>
  /^(total|subtotal|total geral|totais|soma)(\s|$|:)/i.test(normalize(s));
export function normalizeSheet(
  sheet: GridSheet,
  plan: ImportPlan,
  fileName: string,
) {
  if (
    !Number.isInteger(plan.header) ||
    plan.header < 0 ||
    plan.header >= sheet.rows.length - 1
  )
    throw new Error("Escolha uma linha de cabeçalho com dados abaixo.");
  if (![1, 2, 3].includes(plan.headerDepth))
    throw new Error("Use de uma a três linhas de cabeçalho.");
  if (
    !Number.isInteger(plan.end) ||
    plan.end < plan.header + plan.headerDepth ||
    plan.end >= sheet.rows.length
  )
    throw new Error(
      "A última linha precisa incluir dados e estar dentro da aba.",
    );
  if (
    !Number.isInteger(plan.left) ||
    !Number.isInteger(plan.right) ||
    plan.left < 0 ||
    plan.right < plan.left ||
    plan.right >= 160
  )
    throw new Error("Confira o intervalo de colunas.");
  const headers = headerNames(sheet, plan),
    indices = headers.map((_, i) => i + plan.left);
  if (headers.length > 60)
    throw new Error("Selecione até 60 colunas para a base.");
  let empty = 0,
    totals = 0,
    repeated = 0,
    filled = 0;
  const data: string[][] = [],
    last = new Map<number, string>();
  for (let r = plan.header + plan.headerDepth; r <= plan.end; r++) {
    const raw = indices.map((c) => sheet.rows[r]?.[c] ?? "");
    if (!raw.some(Boolean)) {
      empty++;
      continue;
    }
    if (totalLabel(raw.find(Boolean) ?? "")) {
      totals++;
      if (plan.skipTotals) continue;
    }
    const headerRow = indices.map(
      (c) => sheet.rows[plan.header + plan.headerDepth - 1]?.[c] ?? "",
    );
    if (
      plan.skipRepeated &&
      raw.every((v, i) => normalize(v) === normalize(headerRow[i]))
    ) {
      repeated++;
      continue;
    }
    const values = indices.map((c, index) => {
      let v = raw[index];
      if (!v && plan.fillMerged) {
        const merge = sheet.merges.find(
          (m) =>
            m.r0 > plan.header &&
            r >= m.r0 &&
            r <= m.r1 &&
            c >= m.c0 &&
            c <= m.c1,
        );
        if (merge) {
          v = sheet.rows[merge.r0]?.[merge.c0] ?? "";
          if (v) filled++;
        }
      }
      if (!v && plan.fillDown.includes(c)) {
        v = last.get(c) || "";
        if (v) filled++;
      }
      if (v) last.set(c, v);
      return v;
    });
    data.push(values);
  }
  const active = indices.filter((c, i) => data.some((r) => r[i] !== "")),
    names = active.map((c) => headers[c - plan.left]);
  let columns = names,
    rows = data.map((r) =>
      Object.fromEntries(active.map((c, i) => [names[i], r[c - plan.left]])),
    );
  if (plan.unpivot.length) {
    const melted = active.filter((c) => plan.unpivot.includes(c));
    if (!melted.length)
      throw new Error("Selecione colunas com valores para empilhar.");
    if (data.length * melted.length > 20000)
      throw new Error("A transformação excede 20 mil registros. Selecione um intervalo menor.");
    const keep = active.filter((c) => !melted.includes(c));
    if (!keep.length)
      throw new Error("Mantenha ao menos uma coluna de identificação.");
    const variable = plan.variableName.trim(),
      value = plan.valueName.trim();
    columns = keep.map((c) => headers[c - plan.left]);
    if (
      !variable ||
      !value ||
      normalize(variable) === normalize(value) ||
      [variable, value].some((n) =>
        columns.some((c) => normalize(c) === normalize(n)),
      )
    )
      throw new Error(
        "Use nomes diferentes e novos para as colunas empilhadas.",
      );
    columns = [...columns, variable, value];
    rows = data.flatMap((r) =>
      melted.map((c) => ({
        ...Object.fromEntries(
          keep.map((k) => [headers[k - plan.left], r[k - plan.left]]),
        ),
        [variable]: headers[c - plan.left],
        [value]: r[c - plan.left],
      })),
    );
  }
  if (!rows.length || !columns.length)
    throw new Error(
      "Nenhum dado encontrado neste intervalo. Ajuste o cabeçalho e as linhas.",
    );
  if (rows.length > 20000)
    throw new Error(
      "A transformação excede 20 mil registros. Selecione um intervalo menor.",
    );
  const numeric = columns.filter((c) => {
    const values = rows.map((r) => r[c]).filter(Boolean);
    return (
      values.length > 0 &&
      values.every((v) => parseNumber(v) !== null) &&
      !values.some((v) => /^0\d+/.test(v))
    );
  });
  const dates = columns.filter((c) => {
    const values = rows.map((r) => r[c]).filter(Boolean);
    return values.length > 0 && values.every((v) => parseDate(v) !== null);
  });
  const mixed = columns.filter((c) => {
    if (numeric.includes(c) || dates.includes(c)) return false;
    const values = rows.map((r) => r[c]).filter(Boolean);
    const count = values.filter((v) => parseNumber(v) !== null).length;
    return count > 0 && count < values.length;
  });
  const source: Source = {
    id: "import-preview",
    name: `${fileName.replace(/\.[^.]+$/, "")} · ${sheet.name}`,
    rows,
    columns,
    numeric,
    dates,
    demo: false,
    createdAt: new Date().toISOString(),
    importNotes: {
      file: fileName,
      sheet: sheet.name,
      header: plan.header + 1,
      end: plan.end + 1,
      details: `${empty} linhas vazias; ${repeated} cabeçalhos repetidos removidos; ${plan.skipTotals ? totals : 0} totais removidos; ${filled} células preenchidas; ${plan.unpivot.length} colunas empilhadas.`,
    },
  };
  return {
    source,
    empty,
    totals,
    repeated,
    filled,
    mixed,
    removedColumns: headers.length - active.length,
  };
}
