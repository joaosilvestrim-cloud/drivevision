import { resolve4 } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import { ConnectorError } from "./connector-security.ts";

// Pin a validated public address to the TLS connection. Never follow redirects,
// reuse a socket or resolve the hostname a second time (DNS rebinding).
export function publicIPv4(address: string) {
  if (isIP(address) !== 4) return false;
  const [a, b, c] = address.split(".").map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}
export function protheusBase(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConnectorError(400, "Informe a URL HTTPS do REST Protheus.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    isIP(url.hostname) ||
    !url.hostname.includes(".") ||
    /[\[\]]/.test(url.hostname) ||
    /\.(local|localhost|internal|lan|test|invalid)$/.test(url.hostname) ||
    !/^\/[A-Za-z0-9_/-]*$/.test(url.pathname)
  )
    throw new ConnectorError(
      400,
      "Use um domínio HTTPS público, sem credenciais, parâmetros ou fragmentos na URL. Redes internas precisam de uma integração assistida.",
    );
  return url.href.replace(/\/+$/, "");
}
export async function protheusRequest(
  url: URL,
  headers: Record<string, string>,
  signal: AbortSignal,
  method = "GET",
): Promise<unknown> {
  try {
    const addresses = await new Promise<string[]>((resolve, reject) => {
      const abort = () => reject(new Error("aborted"));
      if (signal.aborted) {
        abort();
        return;
      }
      signal.addEventListener("abort", abort, { once: true });
      resolve4(url.hostname)
        .then(resolve, reject)
        .finally(() => signal.removeEventListener("abort", abort));
    });
    signal.throwIfAborted();
    if (!addresses.length || addresses.some((a) => !publicIPv4(a)))
      throw new ConnectorError(
        400,
        "O endereço Protheus precisa resolver para uma rede pública autorizada. Endereços internos não são aceitos nesta conexão.",
      );
    return await new Promise((resolve, reject) => {
      const req = request(
        url,
        {
          method,
          headers: { Accept: "application/json", ...headers },
          signal,
          agent: false,
          family: 4,
          servername: url.hostname,
          lookup: (_host, _options, callback) =>
            callback(null, addresses[0], 4),
        },
        (res) => {
          const status = res.statusCode || 502;
          if (status !== 200) {
            res.destroy();
            const message =
              status === 401 || status === 403
                ? "O Protheus recusou o acesso. Confira usuário, senha, empresa, filial e permissões das tabelas SE1 e SE2."
                : status === 404
                  ? "API Protheus não encontrada. Confira a URL base do REST e a disponibilidade de Token e GenericQuery nesta LIB."
                  : status === 429
                    ? "O Protheus limitou as consultas. Aguarde antes de atualizar."
                    : "O serviço Protheus não concluiu a consulta. Redirecionamentos não são permitidos; use o endereço final do REST.";
            reject(
              new ConnectorError(
                status === 401 || status === 403
                  ? 401
                  : status === 429
                    ? 429
                    : 502,
                message,
              ),
            );
            return;
          }
          const chunks: Buffer[] = [];
          let bytes = 0;
          res.on("data", (chunk: Buffer) => {
            bytes += chunk.length;
            if (bytes > 2_000_000) {
              res.destroy();
              reject(
                new ConnectorError(
                  413,
                  "A página do Protheus excedeu o limite de leitura. Nenhum resultado parcial foi publicado.",
                ),
              );
            } else chunks.push(chunk);
          });
          res.on("error", reject);
          res.on("end", () => {
            try {
              resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
            } catch {
              reject(
                new ConnectorError(
                  502,
                  "O Protheus retornou uma resposta inválida. Confira o endereço REST e a configuração das APIs.",
                ),
              );
            }
          });
        },
      );
      req.on("error", reject);
      req.end();
    });
  } catch (error) {
    if (error instanceof ConnectorError) throw error;
    throw new ConnectorError(
      502,
      "Não foi possível alcançar o Protheus com HTTPS válido dentro do prazo. Confira certificado, DNS IPv4 público e liberação de rede. A última versão foi preservada.",
    );
  }
}
