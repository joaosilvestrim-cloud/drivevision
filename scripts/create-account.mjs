import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createAccountInvitation } from "../server/invitations.ts";
import { closeDatabase } from "../server/database.ts";
process.loadEnvFile(".env.local");
const [name, email, origin] = process.argv.slice(2);
if (!name || !email || !origin)
  throw new Error(
    'Use: node scripts/create-account.mjs "Nome" "email@empresa.com" "https://dominio-da-aplicacao"',
  );
const base = new URL(origin);
if (
  base.protocol !== "https:" &&
  !(
    base.protocol === "http:" &&
    ["localhost", "127.0.0.1"].includes(base.hostname)
  )
)
  throw new Error("Use HTTPS ou um endereço local.");
try {
  const invitation = await createAccountInvitation(name, email);
  const url = new URL("/", base);
  url.hash = new URLSearchParams({ activate: invitation.token }).toString();
  const path = resolve("work", `ativar-conta-${invitation.id}.html`);
  mkdirSync(resolve("work"), { recursive: true });
  const escape = (s) =>
    s
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  writeFileSync(
    path,
    `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ative sua conta DriveVision</title><style>body{background:#07151c;color:#e3f3ee;font:16px system-ui;max-width:620px;padding:80px 24px;margin:auto}a{display:inline-block;background:#45dbaa;color:#05241a;padding:16px 25px;border-radius:8px;text-decoration:none}p{line-height:1.7;color:#a4bcb6}</style><h1>Sua conta está pronta, ${escape(invitation.name)}.</h1><p>Usuário: ${escape(invitation.email)}. Defina sua própria senha no primeiro acesso. Este link só pode ser usado uma vez e expira em ${invitation.expiresAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} (Brasília).</p><a href="${escape(url.href)}" rel="noreferrer">Ativar meu workspace</a><p>Este arquivo contém seu link privado de ativação. Não compartilhe nem publique no repositório.</p></html>`,
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      created: true,
      email: invitation.email,
      activationFile: path,
      expiresAt: invitation.expiresAt.toISOString(),
    }),
  );
} catch (e) {
  console.error(
    e.code === "23505"
      ? "A conta já existe; nenhuma senha foi alterada."
      : "Não foi possível preparar a conta. Confira os dados e a conexão.",
  );
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
