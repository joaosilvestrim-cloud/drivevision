import { createTicket, supportRoute } from "./support.ts";
import {
  adminEmail,
  consumeEmailToken,
  emailVerified,
  flushEmails,
  issueEmailToken,
  requestRecovery,
  resendVerification,
} from "./email.ts";
import { adminRoute, isSuperAdmin } from "./admin.ts";
import {
  billingRoute,
  workspaceAccess,
  billingCron,
  authorizeWebhook,
  receiveBillingEvent,
  adminBilling,
  TERMS_VERSION,
} from "./billing.ts";
import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { database, databaseConfigured, transaction } from "./database.ts";
import { databaseFailureCode } from "./database-errors.ts";
import { ConnectorError, secretMatches } from "./connector-security.ts";
import { connectorsRoute } from "./connectors.ts";
import { syncDue } from "./cloud-sync.ts";
import {
  historyRoute,
  recordSourceHistory,
  rebuildSources,
} from "./source-history.ts";
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
  const user = result.rows[0];
  return user
    ? {
        ...user,
        superAdmin: await isSuperAdmin(user.id),
        access: await workspaceAccess(user.id),
        emailVerified: await emailVerified(user.id),
      }
    : null;
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
    if (path === "/api/cron/sources" && req.method === "GET") {
      if (
        !secretMatches(
          req.headers.authorization,
          process.env.CRON_SECRET
            ? `Bearer ${process.env.CRON_SECRET}`
            : undefined,
        )
      )
        throw new HttpError(401, "Não autorizado.");
      const email = await flushEmails(3).catch(() => ({
        configured: false,
        sent: 0,
      }));
      const billing = await billingCron();
      json(res, 200, { ...(await syncDue()), billing, email });
      return;
    }
    if (path === "/api/webhooks/asaas" && req.method === "POST") {
      await authorizeWebhook(req.headers["asaas-access-token"]?.toString());
      json(res, 200, await receiveBillingEvent(await body(req)));
      return;
    }
    if (!["GET", "HEAD"].includes(req.method || "")) assertOrigin(req);
    if (path === "/api/session" && req.method === "GET") {
      json(res, 200, { user: await userFor(req) });
      return;
    }
    if (
      ["/api/email/recover", "/api/email/reset", "/api/email/verify"].includes(
        path,
      ) &&
      req.method === "POST"
    ) {
      const ip = (
        req.headers["x-forwarded-for"]?.toString().split(",")[0] ||
        req.socket.remoteAddress ||
        "unknown"
      ).trim();
      await rateLimit(`email-action:${ip}`, 20, 900);
      const input = await body(req);
      if (path === "/api/email/recover") {
        const email =
          typeof input.email === "string"
            ? input.email.trim().toLowerCase()
            : "";
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
          throw new HttpError(400, "Informe um e-mail válido.");
        await rateLimit(`recovery:${email}`, 3, 900);
        await requestRecovery(email);
        // Delivery runs in the durable worker; response timing does not expose account existence.
        json(res, 200, { ok: true });
      } else {
        const purpose = path.endsWith("/reset") ? "reset" : "verify";
        const confirmed = await consumeEmailToken(input, purpose);
        const session = purpose === "verify" ? await userFor(req) : null;
        const sameAccount = session?.id === confirmed.accountId;
        json(res, 200, {
          ok: true,
          next:
            purpose === "reset"
              ? "/?view=login"
              : sameAccount
                ? session!.access
                  ? "/"
                  : "/?view=billing"
                : "/?view=login&verified=1",
        });
      }
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
      json(res, 200, {
        user: {
          ...user,
          superAdmin: await isSuperAdmin(user.id),
          access: await workspaceAccess(user.id),
          emailVerified: await emailVerified(user.id),
        },
      });
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
      const input = await body(req);
      const parsed = credentialsSchema.safeParse(input);
      if (!parsed.success)
        throw new HttpError(
          400,
          "Informe um e-mail válido, nome e senha de 12 a 128 caracteres.",
        );
      const { email, password, name } = parsed.data;
      await rateLimit(`email:${email}`, 10, 900);
      let user;
      if (path === "/api/register") {
        if (input.acceptedTerms !== true)
          throw new HttpError(
            400,
            "Aceite os termos de uso e a política de privacidade para continuar.",
          );
        if (process.env.DRIVEVISION_ALLOW_REGISTRATION === "false")
          throw new HttpError(403, "Novos cadastros estão desativados.");
        if (!name) throw new HttpError(400, "Informe seu nome.");
        await rateLimit(`signup:${ip}`, 5, 3600);
        const id = randomUUID(),
          hash = await hashPassword(password);
        try {
          user = await transaction(id, async (c) => {
            const account = await c.query(
              "insert into drivevision.accounts (id,email,name,password_hash,email_verified_at) values ($1,$2,$3,$4,null) returning id,email,name",
              [id, email, name, hash],
            );
            await c.query(
              "insert into drivevision.workspaces (id,owner_id,name) values ($1,$2,$3)",
              [randomUUID(), id, "Meu workspace"],
            );
            await c.query(
              "insert into drivevision.billing_accounts(owner_id,terms_version,trial_eligible,next_reconcile_at) values($1,$2,true,'infinity')",
              [id, TERMS_VERSION],
            );
            await issueEmailToken(c, id, "verify");
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
      if (path === "/api/register")
        await flushEmails(1, user.id).catch(() => {});
      const token = newToken();
      await database().query(
        "insert into drivevision.sessions (token_hash,user_id,expires_at) values ($1,$2,now()+interval '7 days')",
        [tokenHash(token), user.id],
      );
      await database().query(
        "delete from drivevision.rate_limits where bucket in (select bucket from drivevision.rate_limits where expires_at<now() limit 100)",
      );
      res.setHeader("Set-Cookie", sessionCookie(req, token));
      json(res, 200, {
        user: {
          ...user,
          superAdmin: await isSuperAdmin(user.id),
          access: await workspaceAccess(user.id),
          emailVerified: await emailVerified(user.id),
        },
      });
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
    // An old tab must not operate on a different account after the shared cookie changes.
    // This is a consistency guard; authorization always uses the authenticated session.
    const expectedAccount = req.headers["x-drivevision-account"];
    if (expectedAccount && expectedAccount !== user?.id)
      throw new HttpError(
        409,
        "A conta foi alterada em outra aba. Recarregue esta página antes de continuar.",
      );
    if (path === "/api/support" && req.method === "POST") {
      const ip = (
        req.headers["x-forwarded-for"]?.toString().split(",")[0] ||
        req.socket.remoteAddress ||
        "unknown"
      ).trim();
      await rateLimit(`support-ip:${ip}`, 5, 3600);
      if (user) await rateLimit(`support-user:${user.id}`, 10, 3600);
      const result = await createTicket(user?.id || null, await body(req));
      // The ticket and notification intent are committed together; delivery failure does not lose the request.
      await flushEmails(2, undefined, `support:${result.id}:`).catch(() => {});
      json(res, 201, result);
      return;
    }
    if (!user)
      throw new HttpError(
        401,
        "Sua sessão expirou. Entre novamente para salvar na nuvem.",
      );
    if (
      (path === "/api/support" && req.method === "GET") ||
      path === "/api/support/reply" ||
      path === "/api/admin/support"
    ) {
      if (req.method === "POST")
        await rateLimit(`support-reply:${user.id}`, 30, 3600);
      const result = await supportRoute(
        user.id,
        path.startsWith("/api/admin/"),
        req.method || "GET",
        new URL(req.url || "/", "http://localhost"),
        req.method === "POST" ? await body(req) : undefined,
      );
      if (
        req.method === "POST" &&
        "id" in result &&
        !path.startsWith("/api/admin/")
      )
        await flushEmails(2, undefined, `support:${result.id}:`).catch(
          () => {},
        );
      json(res, 200, result);
      return;
    }
    if (path === "/api/email/resend" && req.method === "POST") {
      await rateLimit(`verify-resend:${user.id}`, 1, 60);
      await rateLimit(`verify-resend-day:${user.id}`, 10, 86400);
      await resendVerification(user.id);
      await flushEmails(1, user.id).catch(() => {});
      json(res, 200, { ok: true });
      return;
    }
    if (
      path === "/api/admin/email" &&
      ["GET", "POST"].includes(req.method || "")
    ) {
      json(
        res,
        200,
        await adminEmail(
          user.id,
          req.method === "POST" ? await body(req) : undefined,
        ),
      );
      return;
    }
    if (path === "/api/billing" || path.startsWith("/api/billing/")) {
      if (req.method === "POST") await rateLimit(`billing:${user.id}`, 12, 300);
      const origin = new URL(
        process.env.DRIVEVISION_APP_ORIGIN || `http://${req.headers.host}`,
      ).origin;
      json(
        res,
        200,
        await billingRoute(
          user.id,
          path,
          req.method || "GET",
          origin,
          req.method === "POST" ? await body(req) : undefined,
        ),
      );
      return;
    }
    if (
      path === "/api/admin/billing" &&
      ["GET", "POST"].includes(req.method || "")
    ) {
      json(
        res,
        200,
        await adminBilling(
          user.id,
          req.method === "POST" ? await body(req) : undefined,
        ),
      );
      return;
    }
    if (path.startsWith("/api/admin/")) {
      if (req.method === "POST") await rateLimit(`admin:${user.id}`, 120, 300);
      const origin =
        process.env.DRIVEVISION_APP_ORIGIN ||
        `${process.env.VERCEL ? "https" : "http"}://${req.headers.host}`;
      const result = await adminRoute(
        user.id,
        path,
        req.method || "GET",
        new URL(req.url || "/", origin),
        req.method === "POST" ? await body(req) : undefined,
        origin,
      );
      json(res, 200, result);
      return;
    }
    if (!user.access)
      throw new HttpError(
        402,
        "Ative ou regularize sua assinatura em Minha assinatura para acessar o workspace.",
      );
    if (path === "/api/connectors" || path.startsWith("/api/connectors/")) {
      if (req.method === "POST")
        await rateLimit(`connectors:${user.id}`, 60, 300);
      const origin =
        process.env.DRIVEVISION_APP_ORIGIN ||
        `${process.env.VERCEL ? "https" : "http"}://${req.headers.host}`;
      try {
        const result = await connectorsRoute(
          user.id,
          tokenHash(cookieToken(req)),
          path,
          req.method || "GET",
          req.method === "POST" ? await body(req) : undefined,
          new URL(req.url || "/", origin),
          new URL(origin).origin,
        );
        if (result.redirect) {
          res.statusCode = 303;
          res.setHeader("Location", result.redirect);
          res.setHeader("Referrer-Policy", "no-referrer");
          res.end();
        } else json(res, 200, result.data);
      } catch (error) {
        if (path.startsWith("/api/connectors/callback/")) {
          res.statusCode = 303;
          res.setHeader("Location", "/?view=connections&connection=error");
          res.end();
        } else throw error;
      }
      return;
    }
    if (path === "/api/history" && ["GET", "POST"].includes(req.method || "")) {
      const result = await historyRoute(
        user.id,
        req.method!,
        new URL(req.url || "/", "http://localhost"),
        req.method === "POST" ? await body(req) : undefined,
      );
      if ("source" in result) {
        const compressed = gzipSync(JSON.stringify(result));
        if (compressed.length > MAX_WIRE)
          throw new HttpError(
            413,
            "A versão ultrapassa o limite de transferência.",
          );
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Content-Encoding", "gzip");
        res.end(compressed);
        return;
      }
      json(res, 200, result);
      return;
    }
    if (path === "/api/workspace/revision" && req.method === "GET") {
      const revision = await transaction(user.id, async (c) => {
        const row = (
          await c.query(
            "select revision from drivevision.workspaces where owner_id=$1",
            [user.id],
          )
        ).rows[0];
        if (!row) throw new HttpError(404, "Workspace não encontrado.");
        return Number(row.revision);
      });
      json(res, 200, { revision });
      return;
    }
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
      workspace.sources = rebuildSources(
        workspace.sources,
      ) as typeof workspace.sources;
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
        const before = (
          await c.query(
            "select payload from drivevision.sources where workspace_id=$1",
            [id],
          )
        ).rows.map((r) => r.payload);
        // Removing a source stops its refresh and retains the last saved dashboards policy.
        await c.query(
          "delete from drivevision.cloud_bindings where owner_id=$1 and source_id in (select id from drivevision.sources where workspace_id=$2) and not (source_id=any($3::text[]))",
          [user.id, id, workspace.sources.map((s) => s.id)],
        );
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
        await recordSourceHistory(
          c,
          id,
          before,
          workspace.sources,
          "publication",
        );
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
    if (error instanceof HttpError || error instanceof ConnectorError) {
      json(res, error.status, { error: error.message });
      return;
    }
    const diagnostic = databaseFailureCode(error);
    console.error("DriveVision API failure", {
      diagnostic,
      code: (error as { code?: string }).code || "INTERNAL",
    });
    json(res, 503, {
      code: diagnostic,
      error:
        "Não foi possível acessar o banco. Seus dados atuais continuam na tela; tente novamente.",
    });
  }
}
