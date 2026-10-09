import {
  normalize,
  parseDate,
  type DataRow,
  type Source,
} from "./analytics.ts";
import type { CloudBinding, ConnectorState } from "./connector-types.ts";

export const financialMetrics = [
  "receivable",
  "payable",
  "overdueReceivable",
  "overduePayable",
] as const;
export type FinancialMetric = (typeof financialMetrics)[number];
export type FinancialSelection =
  | FinancialMetric
  | "all"
  | "weekReceivable"
  | "weekPayable"
  | "age1"
  | "age8"
  | "age31"
  | "age61";
export type FinancialTitle = {
  row: DataRow;
  balance: number;
  due: string;
  overdueDays: number;
  side: "Receber" | "Pagar";
};
export type FinancialReview = {
  titles: FinancialTitle[];
  reference: string;
  totals: Record<FinancialMetric | "weekReceivable" | "weekPayable", number>;
  weekEnd: string;
};
const DAY = 86400000;
// Only accept the connector's canonical decimal representation, never ambiguous localized amounts.
export function financialCents(value: string): number | null {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null;
  const n = Math.round(Number(value) * 100);
  return Number.isSafeInteger(n) ? n : null;
}
export function reviewFinancialSource(source: Source): FinancialReview | null {
  if (source.remoteInfo?.provider !== "protheus") return null;
  const stamp = new Date(source.remoteInfo.fetchedAt);
  if (!Number.isFinite(stamp.getTime())) return null;
  const reference = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(stamp);
  const today = parseDate(reference)!;
  const weekEnd = new Date(today + 6 * DAY).toISOString().slice(0, 10);
  const totals = {
    receivable: 0,
    payable: 0,
    overdueReceivable: 0,
    overduePayable: 0,
    weekReceivable: 0,
    weekPayable: 0,
  };
  const titles: FinancialTitle[] = [];
  for (const row of source.rows) {
    const balance = financialCents(row["Saldo em aberto"] || "");
    const due = parseDate(row.Vencimento || "");
    if (
      balance === null ||
      balance <= 0 ||
      due === null ||
      !["Receber", "Pagar"].includes(row.Tipo)
    )
      return null;
    const side = row.Tipo as FinancialTitle["side"];
    const overdueDays = Math.max(0, Math.round((today - due) / DAY));
    totals[side === "Receber" ? "receivable" : "payable"] += balance;
    if (overdueDays)
      totals[side === "Receber" ? "overdueReceivable" : "overduePayable"] +=
        balance;
    if (due >= today && row.Vencimento <= weekEnd)
      totals[side === "Receber" ? "weekReceivable" : "weekPayable"] += balance;
    if (Object.values(totals).some((n) => !Number.isSafeInteger(n)))
      return null;
    titles.push({ row, balance, due: row.Vencimento, overdueDays, side });
  }
  return { titles, totals, reference, weekEnd };
}
export function selectFinancialTitles(
  review: FinancialReview,
  selection: FinancialSelection,
  query = "",
  side = "all",
) {
  const search = normalize(query.trim());
  return review.titles
    .filter((t) => {
      if (side !== "all" && t.side !== side) return false;
      if (
        search &&
        !normalize(
          [
            t.row.Título,
            t.row.Pessoa,
            t.row.Loja,
            t.row.Natureza,
            t.row.Empresa,
            t.row.Filial,
          ].join(" "),
        ).includes(search)
      )
        return false;
      switch (selection) {
        case "receivable":
          return t.side === "Receber";
        case "payable":
          return t.side === "Pagar";
        case "overdueReceivable":
          return t.side === "Receber" && t.overdueDays > 0;
        case "overduePayable":
          return t.side === "Pagar" && t.overdueDays > 0;
        case "weekReceivable":
          return (
            t.side === "Receber" &&
            t.due >= review.reference &&
            t.due <= review.weekEnd
          );
        case "weekPayable":
          return (
            t.side === "Pagar" &&
            t.due >= review.reference &&
            t.due <= review.weekEnd
          );
        case "age1":
          return t.overdueDays >= 1 && t.overdueDays <= 7;
        case "age8":
          return t.overdueDays >= 8 && t.overdueDays <= 30;
        case "age31":
          return t.overdueDays >= 31 && t.overdueDays <= 60;
        case "age61":
          return t.overdueDays > 60;
        default:
          return true;
      }
    })
    .sort(
      (a, b) =>
        a.due.localeCompare(b.due) ||
        b.balance - a.balance ||
        (a.row.Título || "").localeCompare(b.row.Título || ""),
    );
}
export type FinancialHealth =
  | "unknown"
  | "disconnected"
  | "paused"
  | "error"
  | "unscheduled"
  | "late"
  | "stale"
  | "current";
export function financialHealth(
  source: Source,
  state: ConnectorState | null,
  now = Date.now(),
): { status: FinancialHealth; binding?: CloudBinding } {
  if (!state) return { status: "unknown" };
  const binding = state.bindings.find((b) => b.source_id === source.id);
  if (!binding) return { status: "disconnected" };
  const result = (status: FinancialHealth) => ({ status, binding });
  if (binding.last_error) return result("error");
  if (binding.paused) return result("paused");
  if (!state.scheduled) return result("unscheduled");
  if (binding.next_due_at && Date.parse(binding.next_due_at) < now - 5 * 60000)
    return result("late");
  // Checked later is not necessarily changed: workspace revision handles exact change detection.
  if (now - Date.parse(source.remoteInfo?.fetchedAt || "") > 26 * 3600000)
    return result("stale");
  return result("current");
}
