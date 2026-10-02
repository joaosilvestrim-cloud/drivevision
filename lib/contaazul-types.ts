import type { DailySchedule } from "./refresh-schedule";
export type ContaAzulOptions = {
  dataset: "contaazul-financial";
  periodDays: 30 | 90 | 365;
  daily: DailySchedule;
};
export type ContaAzulProgress = {
  id: string;
  sourceId: string;
  status: "pending" | "ready";
  completed: number;
  total: number;
  rows: number;
  error: string | null;
};
