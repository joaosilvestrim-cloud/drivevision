import type { DailySchedule } from "./refresh-schedule";
export type ProtheusOptions = {
  dataset: "protheus-financial";
  periodDays: 30 | 90 | 365;
  titleTypes: string[];
  daily?: DailySchedule;
};
export type ProtheusPreview = {
  connectionId: string;
  columns: string[];
  rows: Record<string, string>[];
  rowCount: number;
  from: string;
  to: string;
  fetchedAt: string;
  fingerprint: string;
  totals: {
    receivable: number;
    payable: number;
    overdueReceivable: number;
    overduePayable: number;
  };
};
