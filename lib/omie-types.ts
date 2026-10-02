import type { DailySchedule } from "./refresh-schedule";
export type OmieOptions = {
  dataset: "omie-invoiced-orders";
  periodDays: 30 | 90 | 365;
  daily?: DailySchedule;
};
export type OmiePreview = {
  connectionId: string;
  columns: string[];
  rows: Record<string, string>[];
  rowCount: number;
  excluded: number;
  total: number;
  from: string;
  to: string;
  fetchedAt: string;
};
