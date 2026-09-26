import {
  loadWorkspace,
  saveWorkspace,
  type Workspace,
} from "./local-workspace";
export type Account = { id: string; name: string; email: string };
export type Persistence = {
  cloud: boolean;
  load: () => Promise<Workspace>;
  save: (w: Workspace) => Promise<void>;
};
export const localPersistence: Persistence = {
  cloud: false,
  load: loadWorkspace,
  save: saveWorkspace,
};
export async function apiJson<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw new Error("O servidor da conta não está disponível neste endereço.");
  const result = (await response.json()) as T & { error?: string };
  if (!response.ok)
    throw new Error(result.error || "Não foi possível concluir a solicitação.");
  return result;
}
export function cloudPersistence(): Persistence {
  let revision: number | null = null;
  return {
    cloud: true,
    async load() {
      const response = await fetch("/api/workspace", {
        credentials: "same-origin",
        cache: "no-store",
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) {
        const error = (await response.json()) as { error?: string };
        throw new Error(error.error || "Não foi possível carregar seus dados.");
      }
      const stream = response.body;
      if (!stream) throw new Error("O servidor retornou uma resposta vazia.");
      const data = (await new Response(
        response.headers.get("x-drivevision-encoding") === "gzip"
          ? stream.pipeThrough(new DecompressionStream("gzip"))
          : stream,
      ).json()) as { revision: number; workspace: Workspace };
      revision = data.revision;
      return data.workspace;
    },
    async save(workspace) {
      if (revision === null)
        throw new Error(
          "Carregue seu workspace antes de salvar. Recarregue a página.",
        );
      const raw = JSON.stringify({ workspace, revision });
      if (new Blob([raw]).size > 50_000_000)
        throw new Error(
          "Seu workspace excede 50 MB. Reduza as bases antes de salvar.",
        );
      const compressed = await new Response(
        new Blob([raw]).stream().pipeThrough(new CompressionStream("gzip")),
      ).blob();
      if (compressed.size > 3_500_000)
        throw new Error(
          "Seu workspace excede 3,5 MB compactados. Reduza as bases antes de salvar.",
        );
      const response = await fetch("/api/workspace", {
        method: "PUT",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-Drivevision-Encoding": "gzip",
        },
        body: compressed,
        signal: AbortSignal.timeout(30000),
      });
      const result = (await response.json()) as {
        revision: number;
        error?: string;
      };
      if (!response.ok)
        throw new Error(result.error || "Falha ao salvar na nuvem.");
      revision = result.revision;
    },
  };
}
