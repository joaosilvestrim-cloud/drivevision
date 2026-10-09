export type Provider = "onedrive" | "sharepoint" | "google";
export type RemoteItem = {
  id: string;
  name: string;
  kind: "file" | "folder" | "drive" | "site";
  driveId?: string;
  version?: string;
  size?: number;
  mime?: string;
};
export type RemoteOptions = {
  daily?: import("./refresh-schedule").DailySchedule;
  sheet: string;
  header: number;
  left: number;
  right: number;
  end: number | null;
  skipTotals: boolean;
  nameContains: string;
};
export type CloudConnection = {
  id: string;
  provider: Provider | "omie" | "contaazul" | "protheus";
  label: string;
};
export type CloudBinding = {
  id: string;
  connection_id: string;
  source_id: string;
  name: string;
  target: RemoteItem;
  options: RemoteOptions | import("./omie-types").OmieOptions | import('./contaazul-types').ContaAzulOptions | import('./protheus-types').ProtheusOptions;
  interval_minutes: number;
  paused: boolean;
  last_success_at: string | null;
  last_checked_at: string | null;
  last_error: string | null;
  next_due_at: string | null;
};
export type CloudRun = {
  id: string;
  status: string;
  message: string;
  rows_count: number | null;
  created_at: string;
};
export type ConnectorState = {
  providers: { id: Provider; configured: boolean }[];
  connections: CloudConnection[];
  bindings: CloudBinding[];
  scheduled: boolean;
  protheusConfigured?: boolean;
  omieConfigured?: boolean;
  contaAzulConfigured?: boolean;
};
