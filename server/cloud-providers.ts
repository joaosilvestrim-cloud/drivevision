import type { Provider, RemoteItem } from "../lib/connector-types.ts";
import { AsyncLocalStorage } from "node:async_hooks";
import {
  ConnectorError,
  boundedBody,
  encryptionKey,
} from "./connector-security.ts";
export type OAuthTokens = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};
const jobSignal = new AsyncLocalStorage<AbortSignal>();
export function withProviderDeadline<T>(fn: () => Promise<T>) {
  return jobSignal.run(AbortSignal.timeout(85000), fn);
}
function requestSignal(timeout: number) {
  const job = jobSignal.getStore();
  return job
    ? AbortSignal.any([job, AbortSignal.timeout(timeout)])
    : AbortSignal.timeout(timeout);
}
export const providers: Provider[] = ["onedrive", "sharepoint", "google"];
export function providerConfig(provider: Provider) {
  const google = provider === "google";
  const tenant = process.env.DRIVEVISION_MICROSOFT_TENANT || "common";
  if (!/^[a-z\d-]+$/i.test(tenant))
    throw new ConnectorError(503, "Configuração Microsoft inválida.");
  return {
    clientId:
      process.env[
        google
          ? "DRIVEVISION_GOOGLE_CLIENT_ID"
          : "DRIVEVISION_MICROSOFT_CLIENT_ID"
      ] || "",
    secret:
      process.env[
        google
          ? "DRIVEVISION_GOOGLE_CLIENT_SECRET"
          : "DRIVEVISION_MICROSOFT_CLIENT_SECRET"
      ] || "",
    authorize: google
      ? "https://accounts.google.com/o/oauth2/v2/auth"
      : `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
    token: google
      ? "https://oauth2.googleapis.com/token"
      : `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    scope: google
      ? "https://www.googleapis.com/auth/drive.readonly"
      : `offline_access User.Read ${provider === "sharepoint" ? "Files.Read.All Sites.Read.All" : "Files.Read"}`,
  };
}
export function providerReady(provider: Provider) {
  try {
    encryptionKey();
    const c = providerConfig(provider);
    return !!(c.clientId && c.secret);
  } catch {
    return false;
  }
}
export async function exchange(
  provider: Provider,
  values: Record<string, string>,
): Promise<OAuthTokens> {
  const c = providerConfig(provider);
  const r = await fetch(c.token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: c.clientId,
      client_secret: c.secret,
      ...values,
    }),
    signal: requestSignal(12000),
    redirect: "error",
  });
  const data = (await r.json()) as Partial<OAuthTokens>;
  if (!r.ok || !data.access_token)
    throw new ConnectorError(
      401,
      "A autorização expirou ou foi revogada. Reconecte a conta.",
    );
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token || values.refresh_token || "",
    expires_in: Math.max(60, Number(data.expires_in) || 3600),
  };
}
async function providerFetch(url: string, access: string, binary = false) {
  const target = new URL(url);
  if (
    target.protocol !== "https:" ||
    !["graph.microsoft.com", "www.googleapis.com"].includes(target.hostname)
  )
    throw new ConnectorError(400, "Endereço do provedor inválido.");
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${access}` },
    signal: requestSignal(15000),
    redirect: "manual",
  });
  if (!r.ok && !(binary && r.status === 302)) {
    if (r.status === 401)
      throw new ConnectorError(401, "O acesso expirou. Reconecte esta conta.");
    if (r.status === 403)
      throw new ConnectorError(
        403,
        "A conta não tem permissão para ler este conteúdo.",
      );
    if (r.status === 404)
      throw new ConnectorError(
        404,
        "O conteúdo foi movido, removido ou deixou de ser compartilhado.",
      );
    if (r.status === 429)
      throw new ConnectorError(
        429,
        "O provedor limitou as consultas. A próxima atualização tentará novamente.",
      );
    throw new ConnectorError(
      502,
      "O provedor está indisponível. A última versão foi preservada.",
    );
  }
  return r;
}
type ProviderEntry = {
  id: string;
  name: string;
  displayName?: string;
  mimeType?: string;
  size?: string | number;
  version?: string;
  modifiedTime?: string;
  lastModifiedDateTime?: string;
  eTag?: string;
  folder?: object;
  parentReference?: { driveId?: string };
  trashed?: boolean;
};
type ProviderResponse = ProviderEntry & {
  value?: ProviderEntry[];
  files?: ProviderEntry[];
  drives?: ProviderEntry[];
  user?: { emailAddress?: string; displayName?: string };
  mail?: string;
  userPrincipalName?: string;
  nextPageToken?: string;
  "@odata.nextLink"?: string;
};
async function data(url: string, access: string): Promise<ProviderResponse> {
  return (await providerFetch(url, access)).json() as Promise<ProviderResponse>;
}
const enc = encodeURIComponent;
const graph = "https://graph.microsoft.com/v1.0";
const google = "https://www.googleapis.com/drive/v3";
function googleItem(i: ProviderEntry): RemoteItem {
  return {
    id: i.id,
    name: i.name,
    kind:
      i.mimeType === "application/vnd.google-apps.folder" ? "folder" : "file",
    mime: i.mimeType,
    size: Number(i.size) || 0,
    version: String(i.version || i.modifiedTime || ""),
  };
}
function microsoftItem(i: ProviderEntry, driveId: string): RemoteItem {
  return {
    id: i.id,
    name: i.name,
    kind: i.folder ? "folder" : "file",
    driveId: i.parentReference?.driveId || driveId,
    size: Number(i.size) || 0,
    version: i.eTag || i.lastModifiedDateTime || "",
  };
}
export function supportedFile(item: RemoteItem) {
  return (
    item.kind === "file" &&
    (/\.(xlsx?|csv|tsv)$/i.test(item.name) ||
      item.mime === "application/vnd.google-apps.spreadsheet")
  );
}
export async function accountLabel(provider: Provider, access: string) {
  if (provider === "google") {
    const d = await data(
      `${google}/about?fields=user(displayName,emailAddress)`,
      access,
    );
    return d.user?.emailAddress || d.user?.displayName || "Google Drive";
  }
  const d = await data(
    `${graph}/me?$select=displayName,mail,userPrincipalName`,
    access,
  );
  return d.mail || d.userPrincipalName || d.displayName || "Microsoft";
}
export async function browse(
  provider: Provider,
  access: string,
  target?: RemoteItem,
  page?: string,
  search = "",
): Promise<{ items: RemoteItem[]; next?: string }> {
  if (provider === "google") {
    if (!target) {
      const d = await data(
        `${google}/drives?pageSize=50${page ? `&pageToken=${enc(page)}` : ""}`,
        access,
      );
      return {
        items: [
          ...(!page
            ? [{ id: "root", name: "Meu Drive", kind: "folder" as const }]
            : []),
          ...(d.drives || []).map((i) => ({
            id: i.id,
            name: i.name,
            kind: "folder" as const,
          })),
        ],
        next: d.nextPageToken,
      };
    }
    const parent = target.id.replace(/['\\]/g, "");
    const q = `trashed = false and '${parent}' in parents`;
    const d = await data(
      `${google}/files?${new URLSearchParams({ q, pageSize: "100", fields: "nextPageToken,files(id,name,mimeType,size,version,modifiedTime)", supportsAllDrives: "true", includeItemsFromAllDrives: "true", ...(page ? { pageToken: page } : {}) })}`,
      access,
    );
    return {
      items: (d.files || [])
        .map(googleItem)
        .filter((i: RemoteItem) => i.kind === "folder" || supportedFile(i)),
      next: d.nextPageToken,
    };
  }
  if (page) {
    const url = new URL(page);
    if (
      url.origin !== "https://graph.microsoft.com" ||
      !url.pathname.startsWith("/v1.0/")
    )
      throw new ConnectorError(400, "Página inválida.");
    const d = await data(page, access);
    return {
      items: (d.value || []).map((i) =>
        !target && provider === "sharepoint"
          ? { id: i.id, name: i.displayName || i.name, kind: "site" }
          : target?.kind === "site"
            ? { id: i.id, name: i.name, kind: "drive", driveId: i.id }
            : microsoftItem(i, target?.driveId || target?.id || ""),
      ),
      next: d["@odata.nextLink"],
    };
  }
  if (!target) {
    if (provider === "sharepoint") {
      const d = await data(
        `${graph}/sites?search=${enc(search || "*")}&$select=id,displayName&$top=50`,
        access,
      );
      return {
        items: (d.value || []).map((i) => ({
          id: i.id,
          name: i.displayName || i.name,
          kind: "site",
        })),
        next: d["@odata.nextLink"],
      };
    }
    const d = await data(`${graph}/me/drive?$select=id,name`, access);
    return {
      items: [
        {
          id: d.id,
          driveId: d.id,
          name: d.name || "Meu OneDrive",
          kind: "drive",
        },
      ],
    };
  }
  if (target.kind === "site") {
    const d = await data(
      `${graph}/sites/${enc(target.id)}/drives?$select=id,name`,
      access,
    );
    return {
      items: (d.value || []).map((i) => ({
        id: i.id,
        driveId: i.id,
        name: i.name,
        kind: "drive",
      })),
      next: d["@odata.nextLink"],
    };
  }
  const drive = target.driveId || target.id;
  const path =
    target.kind === "drive"
      ? `drives/${enc(drive)}/root/children`
      : `drives/${enc(drive)}/items/${enc(target.id)}/children`;
  const d = await data(`${graph}/${path}?$top=100`, access);
  return {
    items: (d.value || [])
      .map((i) => microsoftItem(i, drive))
      .filter((i: RemoteItem) => i.kind === "folder" || supportedFile(i)),
    next: d["@odata.nextLink"],
  };
}
export async function metadata(
  provider: Provider,
  access: string,
  target: RemoteItem,
) {
  if (provider === "google") {
    const d = await data(
      `${google}/files/${enc(target.id)}?supportsAllDrives=true&fields=id,name,mimeType,size,version,modifiedTime,trashed`,
      access,
    );
    if (d.trashed) throw new ConnectorError(404, "Arquivo removido.");
    return googleItem(d);
  }
  if (!target.driveId)
    throw new ConnectorError(400, "Escolha uma biblioteca e um arquivo.");
  return microsoftItem(
    await data(
      `${graph}/drives/${enc(target.driveId)}/items/${enc(target.id)}`,
      access,
    ),
    target.driveId,
  );
}
export function safeDownloadUrl(raw: string) {
  const url = new URL(raw);
  const allowed = [
    "sharepoint.com",
    "sharepoint-df.com",
    "1drv.com",
    "onedrive.com",
    "onedrive.live.com",
  ];
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !allowed.some((h) => url.hostname === h || url.hostname.endsWith("." + h))
  )
    throw new ConnectorError(
      502,
      "O provedor retornou um endereço de download não permitido.",
    );
  return url;
}
export async function download(
  provider: Provider,
  access: string,
  item: RemoteItem,
) {
  if (!supportedFile(item))
    throw new ConnectorError(
      400,
      "Selecione Excel, CSV, TSV ou Google Sheets.",
    );
  if ((item.size || 0) > 10_000_000)
    throw new ConnectorError(413, "Use arquivos de até 10 MB.");
  let name = item.name;
  let url: string;
  if (provider === "google") {
    if (item.mime === "application/vnd.google-apps.spreadsheet") {
      name = item.name + ".xlsx";
      url = `${google}/files/${enc(item.id)}/export?mimeType=${enc("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}`;
    } else
      url = `${google}/files/${enc(item.id)}?alt=media&supportsAllDrives=true`;
  } else
    url = `${graph}/drives/${enc(item.driveId!)}/items/${enc(item.id)}/content`;
  let response = await providerFetch(url, access, true);
  for (
    let redirects = 0;
    response.status === 302 ||
    response.status === 301 ||
    response.status === 307;
    redirects++
  ) {
    if (redirects >= 3)
      throw new ConnectorError(502, "Redirecionamentos demais no download.");
    const location = response.headers.get("location");
    if (!location) throw new ConnectorError(502, "Download indisponível.");
    // Preauthenticated Microsoft URLs must never receive the OAuth bearer token.
    response = await fetch(safeDownloadUrl(location), {
      signal: requestSignal(15000),
      redirect: "manual",
    });
  }
  if (!response.ok)
    throw new ConnectorError(502, "Não foi possível baixar o arquivo.");
  const bytes = await boundedBody(response);
  return {
    name,
    bytes: bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer,
  };
}
