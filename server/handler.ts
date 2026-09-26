import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { database, databaseConfigured, transaction } from "./database.ts";
import {
  credentialsSchema,
  saveSchema,
  activationSchema,
} from "./validation.ts";
import {
  hashPassword,
  verifyPassword,
  tokenHash,
  newToken,
} from "./security.ts";

const COOKIE = "drivevision_session";
const MAX_RAW = 50_000_000,
  MAX_WIRE = 3_500_000;
class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
function json(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}
function assertOrigin(req: IncomingMessage) {
  const origin = req.headers.origin;
  const host = req.headers.host;
  const allowed = process.env.DRIVEVISION_APP_ORIGIN;
  let valid = false;
  try {
    valid = Boolean(
      origin &&
        (allowed
          ? origin === new URL(allowed).origin
          : new URL(origin).host === host),
    );
  } catch {}
  if (!valid) throw new HttpError(403, "Origem da requisição não permitida.");
}
async function body(req: IncomingMessage, large = false) {
  let buffer: Buffer;
  const preParsed = (req as IncomingMessage & { body?: unknown }).body;
  if (preParsed !== undefined) {
    buffer = Buffer.isBuffer(preParsed)
      ? preParsed
      : Buffer.from(
          typeof preParsed === "string" ? preParsed : JSON.stringify(preParsed),
        );
  } else {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > (large ? MAX_WIRE : 16384))
        throw new HttpError(
          413,
          "Dados maiores que o limite desta requisição.",
        );
      chunks.push(Buffer.from(chunk));
    }
    buffer = Buffer.concat(chunks);
  }
  if (buffer.length > (large ? MAX_WIRE : 16384))
    throw new HttpError(413, "Divida a base em arquivos menores.");
  try {
    if (large && req.headers["x-drivevision-encoding"] === "gzip")
      buffer = gunzipSync(buffer, { maxOutputLength: MAX_RAW });
    if (buffer.length > (large ? MAX_RAW : 16384)) throw new Error("SIZE");
    return JSON.parse(buffer.toString("utf8"));
  } catch {
    throw new HttpError(
      400,
      "Conteúdo inválido ou maior que o limite permitido.",
    );
  }
}
function sessionCookie(req: IncomingMessage, value: string, maxAge = 604800) {
  const secure =
    process.env.VERCEL || req.headers["x-forwarded-proto"] === "https";
  return `${COOKIE}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}
function cookieToken(req: IncomingMessage) {
  return (
    (req.headers.cookie || "")
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${COOKIE}=`))
      ?.slice(COOKIE.length + 1) || ""
  );
}
async function userFor(req: IncomingMessage) {
  const token = cookieToken(req);
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const result = await database().query(
    "select u.id,u.email,u.name from drivevision.sessions s join drivevision.accounts u on u.id=s.user_id where s.token_hash=$1 and s.expires_at>now() and u.disabled_at is null",
    [tokenHash(token)],
  );
  return result.rows[0] || null;
}
async function rateLimit(key: string, limit: number, windowSeconds: number) {
  const bucket = tokenHash(
    `${key}:${Math.floor(Date.now() / 1000 / windowSeconds)}`,
  );
  const result = await database().query(
    "insert into drivevision.rate_limits (bucket,attempts,expires_at) values ($1,1,now()+$2*interval '1 second') on conflict (bucket) do update set attempts=drivevision.rate_limits.attempts+1 returning attempts",
    [bucket, windowSeconds],
  );
  if (result.rows[0].attempts > limit)
    throw new HttpError(
      429,
      "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
    );
}
export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  try {
    const path = new URL(req.url || "/", "http://localhost").pathname.replace(
      /\/$/,
      "",
    );
    if (path === "/api/status" && req.method === "GET") {
      json(res, 200, { configured: databaseConfigured() });
      return;
    }
    if (!databaseConfigured())
      throw new HttpError(503, "O servidor ainda não está conectado ao banco.");
    if (!["GET", "HEAD"].includes(req.method || "")) assertOrigin(req);
    if (path === "/api/session" && req.method === "GET") {
      json(res, 200, { user: await userFor(req) });
      return;
    }
    if (path === "/api/activate" && req.method === "POST") {
      const ip = (
        req.headers["x-forwarded-for"]?.toString().split(",")[0] ||
        req.socket.remoteAddress ||
        "unknown"
      ).trim();
      await rateLimit(`activation-ip:${ip}`, 20, 900);
      const parsed = activationSchema.safeParse(await body(req));
      if (!parsed.success)
        throw new HttpError(
          400,
          "Confira o link e use uma senha de 12 a 128 caracteres.",
        );
      const { token, password } = parsed.data;
      await rateLimit(`activation-token:${tokenHash(token)}`, 6, 900);
      const session = newToken();
      const user = await transaction("", async (c) => {
        const found = await c.query(
          "select id,email,name,password_hash from drivevision.accounts where password_hash like $1 and disabled_at is null for update",
          [`setup:${tokenHash(token)}:%`],
        );
        const account = found.rows[0];
        if (
          !account ||
          !Number.isFinite(Number(account.password_hash.split(":")[2])) ||
          Number(account.password_hash.split(":")[2]) <= Date.now()
        )
          throw new HttpError(
            401,
            "Este link de ativação expirou ou já foi utilizado. Solicite um novo ao administrador.",
          );
        await c.query(
          "update drivevision.accounts set password_hash=$1 where id=$2",
          [await hashPassword(password), account.id],
        );
        await c.query("delete from drivevision.sessions where user_id=$1", [
          account.id,
        ]);
        await c.query(
          "insert into drivevision.sessions(token_hash,user_id,expires_at) values($1,$2,now()+interval '7 days')",
          [tokenHash(session), account.id],
        );
        return { id: account.id, email: account.email, name: account.name };
      });
      res.setHeader("Set-Cookie", sessionCookie(req, session));
      json(res, 200, { user });
      return;
    }
    if (
      (path === "/api/login" || path === "/api/register") &&
      req.method === "POST"
    ) {
      const ip = (
        req.headers["x-forwarded-for"]?.toString().split(",")[0] ||
        req.socket.remoteAddress ||
        "unknown"
      ).trim();
      await rateLimit(`ip:${ip}`, 40, 900);
      const parsed = credentialsSchema.safeParse(await body(req));
      if (!parsed.success)
        throw new HttpError(
          400,
          "Informe um e-mail válido, nome e senha de 12 a 128 caracteres.",
        );
      const { email, password, name } = parsed.data;
      await rateLimit(`email:${email}`, 10, 900);
      let user;
      if (path === "/api/register") {
        if (process.env.DRIVEVISION_ALLOW_REGISTRATION === "false")
          throw new HttpError(403, "Novos cadastros estão desativados.");
        if (!name) throw new HttpError(400, "Informe seu nome.");
        await rateLimit(`signup:${ip}`, 5, 3600);
        const id = randomUUID(),
          hash = await hashPassword(password);
        try {
          user = await transaction(id, async (c) => {
            const account = await c.query(
              "insert into drivevision.accounts (id,email,name,password_hash) values ($1,$2,$3,$4) returning id,email,name",
              [id, email, name, hash],
            );
            await c.query(
              "insert into drivevision.workspaces (id,owner_id,name) values ($1,$2,$3)",
              [randomUUID(), id, "Meu workspace"],
            );
            return account.rows[0];
          });
        } catch (e) {
          if ((e as { code?: string }).code === "23505")
            throw new HttpError(
              409,
              "Não foi possível criar a conta. Se já possui cadastro, entre.",
            );
          throw e;
        }
      } else {
        const account = await database().query(
          "select id,email,name,password_hash from drivevision.accounts where email=$1 and disabled_at is null",
          [email],
        );
        const stored =
          account.rows[0]?.password_hash ||
          `scrypt:${"0".repeat(32)}:${"0".repeat(128)}`;
        if (!(await verifyPassword(password, stored)) || !account.rows.length)
          throw new HttpError(401, "E-mail ou senha incorretos.");
        const { password_hash, ...safe } = account.rows[0];
        user = safe;
      }
      const token = newToken();
      await database().query(
        "insert into drivevision.sessions (token_hash,user_id,expires_at) values ($1,$2,now()+interval '7 days')",
        [tokenHash(token), user.id],
      );
      await database().query(
        "delete from drivevision.rate_limits where bucket in (select bucket from drivevision.rate_limits where expires_at<now() limit 100)",
      );
      res.setHeader("Set-Cookie", sessionCookie(req, token));
      json(res, 200, { user });
      return;
    }
    if (path === "/api/logout" && req.method === "POST") {
      await database().query(
        "delete from drivevision.sessions where token_hash=$1",
        [tokenHash(cookieToken(req))],
      );
      res.setHeader("Set-Cookie", sessionCookie(req, "", 0));
      json(res, 200, { ok: true });
      return;
    }
    const user = await userFor(req);
    if (!user)
      throw new HttpError(
        401,
        "Sua sessão expirou. Entre novamente para salvar na nuvem.",
      );
    if (path === "/api/workspace" && req.method === "GET") {
      const result = await transaction(user.id, async (c) => {
        const workspace = (
          await c.query(
            "select id,revision from drivevision.workspaces where owner_id=$1 for share",
            [user.id],
          )
        ).rows[0];
        if (!workspace) throw new HttpError(404, "Workspace não encontrado.");
        const sources = await c.query(
          "select payload from drivevision.sources where workspace_id=$1 order by position,id",
          [workspace.id],
        );
        const dashboards = await c.query(
          "select payload from drivevision.dashboards where workspace_id=$1 order by position,id",
          [workspace.id],
        );
        return {
          revision: Number(workspace.revision),
          workspace: {
            version: 1,
            sources: sources.rows.map((r) => r.payload),
            dashboards: dashboards.rows.map((r) => r.payload),
          },
        };
      });
      const compressed = gzipSync(JSON.stringify(result));
      if (compressed.length > MAX_WIRE)
        throw new HttpError(
          413,
          "O workspace ultrapassou o limite de transferência.",
        );
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("X-Drivevision-Encoding", "gzip");
      res.end(compressed);
      return;
    }
    if (path === "/api/workspace" && req.method === "PUT") {
      const parsed = saveSchema.safeParse(await body(req, true));
      if (!parsed.success)
        throw new HttpError(
          400,
          "O workspace contém campos inválidos ou ultrapassa o limite de 50 bases, 24 visuais por painel ou 60 etapas de preparação.",
        );
      const { workspace, revision } = parsed.data;
      const wire = gzipSync(
        JSON.stringify({ workspace, revision: revision + 1 }),
      );
      if (wire.length > MAX_WIRE)
        throw new HttpError(
          413,
          "Seu workspace excede 3,5 MB compactados. Reduza as bases antes de salvar.",
        );
      const next = await transaction(user.id, async (c) => {
        const current = (
          await c.query(
            "select id,revision from drivevision.workspaces where owner_id=$1 for update",
            [user.id],
          )
        ).rows[0];
        if (!current) throw new HttpError(404, "Workspace não encontrado.");
        if (Number(current.revision) !== revision)
          throw new HttpError(
            409,
            "Outra aba ou dispositivo atualizou este workspace. Exporte seu rascunho e recarregue antes de salvar.",
          );
        const id = current.id;
        // Identifiers are fixed constants; all user data is parameterized.
        for (const [table, items] of [
          ["sources", workspace.sources],
          ["dashboards", workspace.dashboards],
        ] as const) {
          await c.query(
            `delete from drivevision.${table} where workspace_id=$1 and not (id=any($2::text[]))`,
            [id, items.map((i) => i.id)],
          );
          if (items.length)
            await c.query(
              `insert into drivevision.${table} (workspace_id,id,position,payload) select $1, entry->>'id', ordinality-1, entry from jsonb_array_elements($2::jsonb) with ordinality as e(entry,ordinality) on conflict (workspace_id,id) do update set position=excluded.position,payload=excluded.payload,updated_at=now()`,
              [id, JSON.stringify(items)],
            );
        }
        await c.query(
          "update drivevision.workspaces set revision=revision+1,updated_at=now() where id=$1",
          [id],
        );
        return revision + 1;
      });
      json(res, 200, { revision: next });
      return;
    }
    throw new HttpError(404, "Recurso não encontrado.");
  } catch (error) {
    if (res.headersSent) {
      res.end();
      return;
    }
    if (error instanceof HttpError) {
      json(res, error.status, { error: error.message });
      return;
    }
    console.error("DriveVision API failure", {
      code: (error as { code?: string }).code || "INTERNAL",
    });
    json(res, 503, {
      error:
        "Não foi possível acessar o banco. Seus dados atuais continuam na tela; tente novamente.",
    });
  }
}
