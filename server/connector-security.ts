import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
export class ConnectorError extends Error {
  status: number;
  diagnostic?: string;
  constructor(status: number, message: string, diagnostic?: string) {
    super(message);
    this.status = status;
    this.diagnostic = diagnostic;
  }
}
export function encryptionKey() {
  const key = Buffer.from(
    process.env.DRIVEVISION_CONNECTOR_KEY || "",
    "base64",
  );
  if (key.length !== 32)
    throw new ConnectorError(
      503,
      "As conexões externas aguardam configuração pelo administrador.",
    );
  return key;
}
export function seal(value: unknown, owner: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(owner));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value)),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), encrypted]
    .map((b) => b.toString("base64url"))
    .join(".");
}
export function unseal<T>(value: string, owner: string): T {
  const [iv, tag, data] = value
    .split(".")
    .map((p) => Buffer.from(p, "base64url"));
  const cipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(owner));
  cipher.setAuthTag(tag);
  return JSON.parse(
    Buffer.concat([cipher.update(data), cipher.final()]).toString(),
  );
}
export function secretMatches(
  actual: string | undefined,
  expected: string | undefined,
) {
  if (!expected || !actual) return false;
  const a = Buffer.from(actual),
    b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
export async function boundedBody(response: Response, max = 10_000_000) {
  if (Number(response.headers.get("content-length")) > max)
    throw new ConnectorError(413, "O arquivo excede 10 MB.");
  const reader = response.body?.getReader();
  if (!reader) throw new ConnectorError(502, "Arquivo vazio.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > max) throw new ConnectorError(413, "O arquivo excede 10 MB.");
      chunks.push(part.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks);
}
