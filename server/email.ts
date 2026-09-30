import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { database, transaction } from "./database.ts";
import { ConnectorError, seal, unseal } from "./connector-security.ts";
import { newToken, tokenHash, hashPassword } from "./security.ts";
import { isSuperAdmin } from "./admin.ts";

const aad = "drivevision:resend:platform:v1";
const configSchema = z
  .object({ apiKey: z.string().regex(/^re_[A-Za-z0-9_-]{10,200}$/) })
  .strict();
const sender = "DriveVision <suporte@drivedata.com.br>";
type Message = {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
  reply_to: string;
};
function origin() {
  const value = new URL(
    process.env.DRIVEVISION_APP_ORIGIN || "https://vision.drivedata.com.br",
  );
  return value.origin;
}
const escape = (v: string) =>
  v.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
async function config(): Promise<{ apiKey: string } | null> {
  if (process.env.DRIVEVISION_RESEND_API_KEY)
    return configSchema.parse({
      apiKey: process.env.DRIVEVISION_RESEND_API_KEY,
    });
  const row = (
    await database().query(
      "select encrypted_value from drivevision.platform_settings where key='resend'",
    )
  ).rows[0];
  return row ? configSchema.parse(unseal(row.encrypted_value, aad)) : null;
}
export async function queueEmail(
  c: PoolClient,
  owner: string,
  key: string,
  kind: string,
  subject: string,
  paragraph: string,
  link: string,
  label: string,
  lifetimeMinutes = 1200,
) {
  const account = (
    await c.query(
      "select email,name from drivevision.accounts where id=$1 and disabled_at is null",
      [owner],
    )
  ).rows[0];
  if (!account) return;
  const id = randomUUID();
  const text = `Olá, ${account.name}.\n\n${paragraph}\n\n${label}: ${link}\n\nSe você não solicitou esta mensagem, ignore-a. Precisa de ajuda? suporte@drivedata.com.br\nDriveVision · DriveData`;
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#e5e5e5;font-family:Arial,sans-serif;color:#111"><div style="max-width:560px;margin:32px auto;background:white;border-radius:24px;padding:32px"><p style="font-size:12px;letter-spacing:3px">DRIVEDATA / DRIVEVISION</p><h1 style="font-size:28px">${escape(subject)}</h1><p>Olá, ${escape(account.name)}.</p><p style="line-height:1.6">${escape(paragraph)}</p><p style="margin:32px 0"><a href="${escape(link)}" style="display:inline-block;background:#d1ffca;color:#111;padding:16px 24px;border-radius:12px;text-decoration:none;font-weight:bold">${escape(label)}</a></p><p style="font-size:12px;color:#555">Se você não solicitou esta mensagem, ignore-a. Precisa de ajuda? <a href="mailto:suporte@drivedata.com.br">suporte@drivedata.com.br</a></p><hr style="border:0;border-top:1px solid #eee"><p style="font-size:12px">DriveVision · DriveData</p></div></body></html>`;
  const message: Message = {
    from: sender,
    to: [account.email],
    subject,
    html,
    text,
    reply_to: "suporte@drivedata.com.br",
  };
  await c.query(
    "insert into drivevision.email_outbox(id,owner_id,dedupe_key,kind,encrypted_payload,expires_at) values($1,$2,$3,$4,$5,now()+$6*interval '1 minute') on conflict(dedupe_key) do nothing",
    [
      id,
      owner,
      key,
      kind,
      seal(message, `drivevision:email:${id}`),
      lifetimeMinutes,
    ],
  );
}
export async function issueEmailToken(
  c: PoolClient,
  owner: string,
  purpose: "verify" | "reset",
) {
  const token = newToken();
  // Serialize all token issuance with consumption/password changes for this account.
  await c.query("select id from drivevision.accounts where id=$1 for update", [
    owner,
  ]);
  await c.query(
    "update drivevision.email_tokens set used_at=now() where owner_id=$1 and purpose=$2 and used_at is null",
    [owner, purpose],
  );
  await c.query(
    "update drivevision.email_outbox set state='failed',encrypted_payload=null,last_error='Substituído por um novo link' where owner_id=$1 and kind=$2 and state='pending'",
    [owner, purpose],
  );
  const minutes = purpose === "reset" ? 30 : 1440;
  await c.query(
    "insert into drivevision.email_tokens(token_hash,owner_id,purpose,expires_at) values($1,$2,$3,now()+$4*interval '1 minute')",
    [tokenHash(token), owner, purpose, minutes],
  );
  await queueEmail(
    c,
    owner,
    `${purpose}:${tokenHash(token)}`,
    purpose,
    purpose === "verify" ? "Confirme seu e-mail" : "Redefina sua senha",
    purpose === "verify"
      ? "Confirme seu endereço para continuar com sua assinatura de R$ 59,90/mês. Este link vale por 24 horas."
      : "Recebemos uma solicitação para redefinir sua senha. O link vale por 30 minutos e pode ser usado uma única vez.",
    `${origin()}/?view=${purpose}#token=${token}`,
    purpose === "verify" ? "Confirmar meu e-mail" : "Criar nova senha",
    purpose === "reset" ? 25 : 1200,
  );
}
export async function requestRecovery(email: string) {
  await transaction("", async (c) => {
    const row = (
      await c.query(
        "select id from drivevision.accounts where email=$1 and disabled_at is null and password_hash not like 'setup:%' for update",
        [email],
      )
    ).rows[0];
    if (row) await issueEmailToken(c, row.id, "reset");
  });
}
export async function resendVerification(owner: string) {
  await transaction("", async (c) => {
    const row = (
      await c.query(
        "select email_verified_at from drivevision.accounts where id=$1 and disabled_at is null for update",
        [owner],
      )
    ).rows[0];
    if (row && !row.email_verified_at)
      await issueEmailToken(c, owner, "verify");
  });
}
export async function consumeEmailToken(
  input: unknown,
  purpose: "verify" | "reset",
) {
  const parsed = z
    .object({
      token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
      password: z.string().min(12).max(128).optional(),
    })
    .strict()
    .safeParse(input);
  if (!parsed.success || (purpose === "reset" && !parsed.data.password))
    throw new ConnectorError(
      400,
      "Confira o link e use uma senha de 12 a 128 caracteres.",
    );
  const hash =
    purpose === "reset" ? await hashPassword(parsed.data.password!) : null;
  return transaction("", async (c) => {
    const lookup = (
      await c.query(
        "select owner_id from drivevision.email_tokens where token_hash=$1 and purpose=$2",
        [tokenHash(parsed.data.token), purpose],
      )
    ).rows[0];
    const fail = () =>
      new ConnectorError(
        400,
        "Este link expirou ou já foi utilizado. Solicite um novo link.",
      );
    if (!lookup) throw fail();
    const account = (
      await c.query(
        "select id from drivevision.accounts where id=$1 and disabled_at is null for update",
        [lookup.owner_id],
      )
    ).rows[0];
    const token = (
      await c.query(
        "select owner_id from drivevision.email_tokens where token_hash=$1 and purpose=$2 and used_at is null and expires_at>now() for update",
        [tokenHash(parsed.data.token), purpose],
      )
    ).rows[0];
    if (!account || !token) throw fail();
    await c.query(
      "update drivevision.email_tokens set used_at=now() where owner_id=$1 and purpose=$2 and used_at is null",
      [account.id, purpose],
    );
    if (purpose === "reset") {
      await c.query(
        "update drivevision.accounts set password_hash=$2,email_verified_at=coalesce(email_verified_at,now()) where id=$1",
        [account.id, hash],
      );
      await c.query("delete from drivevision.sessions where user_id=$1", [
        account.id,
      ]);
    } else
      await c.query(
        "update drivevision.accounts set email_verified_at=now() where id=$1",
        [account.id],
      );
    return { ok: true };
  });
}
export async function emailVerified(owner: string) {
  return !!(
    await database().query(
      "select email_verified_at from drivevision.accounts where id=$1",
      [owner],
    )
  ).rows[0]?.email_verified_at;
}
export async function flushEmails(limit = 5, owner?: string) {
  const credentials = await config();
  if (!credentials) return { configured: false, sent: 0 };
  let sent = 0;
  await database().query(
    "update drivevision.email_outbox set state='failed',encrypted_payload=null,last_error='Prazo de envio expirado' where state in ('pending','sending') and expires_at<=now() and retry_at<=now()",
  );
  for (let i = 0; i < limit; i++) {
    const row = await transaction(
      "",
      async (c) =>
        (
          await c.query(
            "update drivevision.email_outbox set state='sending',attempts=attempts+1,retry_at=now()+interval '2 minutes' where id=(select id from drivevision.email_outbox where state in ('pending','sending') and retry_at<=now() and expires_at>now() and ($1::uuid is null or owner_id=$1) order by created_at for update skip locked limit 1) returning *",
            [owner || null],
          )
        ).rows[0],
    );
    if (!row) break;
    let failure = "Falha temporária no envio";
    let permanent = false;
    try {
      const message = unseal<Message>(
        row.encrypted_payload,
        `drivevision:email:${row.id}`,
      );
      // Reserved test addresses never leave the application except in intercepted tests.
      if (message.to.some((v) => v.endsWith(".invalid")))
        throw new Error("TEST_RECIPIENT");
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credentials.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `drivevision/${row.id}`,
        },
        body: JSON.stringify(message),
        signal: AbortSignal.timeout(10000),
        redirect: "error",
      });
      if (!response.ok) {
        permanent =
          response.status >= 400 &&
          response.status < 500 &&
          ![409, 429].includes(response.status);
        failure = `Resend HTTP ${response.status}`;
        throw new Error("PROVIDER");
      }
      const result = (await response.json()) as { id?: string };
      if (!result.id) throw new Error("NO_ID");
      await database().query(
        "update drivevision.email_outbox set state='sent',provider_id=$2,sent_at=now(),encrypted_payload=null,last_error=null where id=$1",
        [row.id, result.id],
      );
      sent++;
    } catch (error) {
      if (error instanceof Error && error.message === "TEST_RECIPIENT") {
        permanent = true;
        failure = "Destinatário de teste reservado";
      }
      await database().query(
        "update drivevision.email_outbox set state=$2,last_error=$3,retry_at=now()+interval '5 minutes',encrypted_payload=case when $2='failed' then null else encrypted_payload end where id=$1 and state<>'sent'",
        [
          row.id,
          permanent || row.attempts >= 6 ? "failed" : "pending",
          failure,
        ],
      );
    }
  }
  return { configured: true, sent };
}
export async function adminEmail(owner: string, input?: unknown) {
  if (!(await isSuperAdmin(owner)))
    throw new ConnectorError(403, "Acesso restrito à administração.");
  if (input !== undefined) {
    const value = configSchema.safeParse(input);
    if (!value.success)
      throw new ConnectorError(400, "Chave de envio inválida.");
    await transaction(
      owner,
      async (c) => {
        await c.query(
          "insert into drivevision.platform_settings(key,encrypted_value) values('resend',$1) on conflict(key) do update set encrypted_value=excluded.encrypted_value,updated_at=now()",
          [seal(value.data, aad)],
        );
      },
      { allowUnpaid: true },
    );
  }
  const counts = (
    await database().query(
      "select state,count(*)::int as count from drivevision.email_outbox group by state",
    )
  ).rows;
  const recent = (
    await database().query(
      'select e.id,e.kind,e.state,e.last_error as error,e.created_at as "createdAt",e.sent_at as "sentAt",a.email from drivevision.email_outbox e join drivevision.accounts a on a.id=e.owner_id order by e.created_at desc limit 20',
    )
  ).rows;
  return { configured: !!(await config()), sender, counts, recent };
}
