import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { PoolClient } from "pg";
import { transaction } from "./database.ts";
import { ConnectorError } from "./connector-security.ts";
import { newToken, tokenHash } from "./security.ts";

const fields = {
  name: z.string().trim().min(2).max(120),
  plan: z.string().trim().min(1).max(80),
};
const createSchema = z
  .object({
    ...fields,
    contact: z.string().trim().min(2).max(100),
    email: z
      .string()
      .trim()
      .email()
      .max(254)
      .transform((s) => s.toLowerCase()),
  })
  .strict();
const identity = {
  id: z.string().uuid(),
  revision: z.number().int().nonnegative(),
};
const updateSchema = z
  .object({ ...identity, ...fields, status: z.enum(["active", "suspended"]) })
  .strict();
const inviteSchema = z.object(identity).strict();
const err = (status: number, message: string): never => {
  throw new ConnectorError(status, message);
};
export async function isSuperAdmin(userId: string) {
  return transaction(
    userId,
    async (c) =>
      Boolean(
        (
          await c.query(
            "select 1 from drivevision.platform_admins where account_id=$1",
            [userId],
          )
        ).rowCount,
      ),
    { allowUnpaid: true },
  );
}
async function audit(
  c: PoolClient,
  actor: string,
  client: string,
  action: string,
  details: object = {},
) {
  await c.query(
    "insert into drivevision.admin_audit(id,actor_id,client_id,action,details) values($1,$2,$3,$4,$5)",
    [randomUUID(), actor, client, action, JSON.stringify(details)],
  );
}
function invitation() {
  const token = newToken(),
    expiresAt = new Date(Date.now() + 72 * 3600_000);
  return {
    token,
    expiresAt,
    marker: `setup:${tokenHash(token)}:${expiresAt.getTime()}`,
  };
}
function invitationResult(
  origin: string,
  value: ReturnType<typeof invitation>,
) {
  return {
    invitationUrl: `${new URL(origin).origin}/#activate=${value.token}`,
    expiresAt: value.expiresAt.toISOString(),
  };
}
export async function adminRoute(
  actor: string,
  path: string,
  method: string,
  url: URL,
  input: unknown,
  origin: string,
) {
  try {
    return await transaction(actor, async (c) => {
      if (
        !(
          await c.query(
            "select 1 from drivevision.platform_admins where account_id=$1",
            [actor],
          )
        ).rowCount
      )
        err(403, "Esta área é exclusiva da administração DriveData.");
      if (path === "/api/admin/clients" && method === "GET") {
        const q = (url.searchParams.get("q") || "").trim().slice(0, 120);
        const status = url.searchParams.get("status") || "all";
        if (!["all", "active", "suspended", "pending"].includes(status))
          err(400, "Filtro inválido.");
        const requested = Number(url.searchParams.get("page") || 1);
        if (!Number.isSafeInteger(requested) || requested < 1)
          err(400, "Página inválida.");
        // Admin accounts are platform operators, not customers. Never return credentials.
        const filter = `from drivevision.clients t join drivevision.accounts a on a.id=t.owner_id
          where not exists(select 1 from drivevision.platform_admins p where p.account_id=a.id)
          and ($1='' or strpos(lower(t.name || ' ' || a.email || ' ' || a.name),lower($1))>0)
          and ($2='all' or ($2='active' and a.disabled_at is null) or ($2='suspended' and a.disabled_at is not null) or ($2='pending' and a.password_hash like 'setup:%'))`;
        const counts = (
          await c.query(
            `select count(*)::int total,count(*) filter(where a.disabled_at is null)::int active,count(*) filter(where a.disabled_at is not null)::int suspended,count(*) filter(where a.password_hash like 'setup:%')::int pending ${filter}`,
            [q, status],
          )
        ).rows[0];
        const pages = Math.max(1, Math.ceil(counts.total / 25)),
          page = Math.min(requested, pages);
        const clients = (
          await c.query(
            `select t.id,t.name,case when exists(select 1 from drivevision.billing_accounts b where b.owner_id=t.owner_id) then 'DriveVision mensal · Asaas' else t.plan end plan,t.revision,t.created_at as "createdAt",a.name contact,a.email,case when a.disabled_at is null then 'active' else 'suspended' end status,(a.password_hash like 'setup:%') as pending, (a.disabled_at is null and a.email_verified_at is not null and a.password_hash not like 'setup:%' and not exists(select 1 from drivevision.billing_accounts b where b.owner_id=t.owner_id and (b.paid_until is null or b.paid_until<=now()))) as access, (a.email_verified_at is not null) as confirmed ${filter} order by t.created_at desc,t.id limit 25 offset $3`,
            [q, status, (page - 1) * 25],
          )
        ).rows;
        return { clients, counts, page, pages };
      }
      if (path === "/api/admin/clients" && method === "POST") {
        const parsed = createSchema.safeParse(input);
        if (!parsed.success)
          err(400, "Confira a empresa, responsável, e-mail e plano.");
        const v = parsed.data!,
          id = randomUUID(),
          invitationValue = invitation();
        await c.query(
          "insert into drivevision.accounts(id,email,name,password_hash) values($1,$2,$3,$4)",
          [id, v.email, v.contact, invitationValue.marker],
        );
        await c.query(
          "update drivevision.clients set name=$2,plan=$3 where id=$1",
          [id, v.name, v.plan],
        );
        await audit(c, actor, id, "created", { name: v.name, plan: v.plan });
        // Scope the workspace INSERT to its owner. No admin policy exposes customer datasets.
        await c.query("select set_config('drivevision.user_id',$1,true)", [id]);
        await c.query(
          "insert into drivevision.workspaces(id,owner_id,name) values($1,$2,$3)",
          [randomUUID(), id, v.name],
        );
        return { id, ...invitationResult(origin, invitationValue) };
      }
      if (path === "/api/admin/audit" && method === "GET") {
        const id = z.string().uuid().safeParse(url.searchParams.get("id"));
        if (!id.success) err(400, "Cliente inválido.");
        return {
          events: (
            await c.query(
              'select e.id,e.action,e.details,e.created_at as "createdAt",a.name actor from drivevision.admin_audit e left join drivevision.accounts a on a.id=e.actor_id where e.client_id=$1 order by e.created_at desc,e.id limit 50',
              [id.data],
            )
          ).rows,
        };
      }
      if (
        ["/api/admin/clients/update", "/api/admin/clients/invite"].includes(
          path,
        ) &&
        method === "POST"
      ) {
        const parsed = (
          path.endsWith("/update") ? updateSchema : inviteSchema
        ).safeParse(input);
        if (!parsed.success)
          err(400, "Dados inválidos. Atualize a lista e tente novamente.");
        const v = parsed.data!;
        const row = (
          await c.query(
            "select t.*,a.password_hash,a.disabled_at from drivevision.clients t join drivevision.accounts a on a.id=t.owner_id where t.id=$1 for update of t,a",
            [v.id],
          )
        ).rows[0];
        if (!row) err(404, "Cliente não encontrado.");
        const protectedAccount = Boolean(
          (
            await c.query(
              "select 1 from drivevision.platform_admins where account_id=$1",
              [row.owner_id],
            )
          ).rowCount,
        );
        if (protectedAccount || row.owner_id === actor)
          err(
            403,
            "Contas da administração não podem ser alteradas neste painel.",
          );
        if (row.revision !== v.revision)
          err(
            409,
            "Este cliente foi alterado em outra sessão. Atualize a lista antes de continuar.",
          );
        if (path.endsWith("/invite")) {
          if (!row.password_hash.startsWith("setup:"))
            err(
              409,
              "O cliente já definiu sua senha. Não é necessário outro convite.",
            );
          if (row.disabled_at)
            err(409, "Reative o cliente antes de gerar um convite.");
          const value = invitation();
          await c.query(
            "update drivevision.accounts set password_hash=$2 where id=$1",
            [row.owner_id, value.marker],
          );
          await c.query(
            "update drivevision.clients set revision=revision+1,updated_at=now() where id=$1",
            [v.id],
          );
          await audit(c, actor, v.id, "invited");
          return invitationResult(origin, value);
        }
        const change = updateSchema.parse(input);
        await c.query(
          "update drivevision.clients set name=$2,plan=$3,revision=revision+1,updated_at=now() where id=$1",
          [v.id, change.name, change.plan],
        );
        await c.query(
          "update drivevision.accounts set disabled_at=case when $2 then coalesce(disabled_at,now()) else null end where id=$1",
          [row.owner_id, change.status === "suspended"],
        );
        if (change.status === "suspended") {
          await c.query("delete from drivevision.sessions where user_id=$1", [
            row.owner_id,
          ]);
          await c.query(
            "update drivevision.cloud_schedule set lease_token=null,lease_until=null where owner_id=$1",
            [row.owner_id],
          );
        }
        await audit(c, actor, v.id, "updated", {
          before: {
            name: row.name,
            plan: row.plan,
            status: row.disabled_at ? "suspended" : "active",
          },
          after: {
            name: change.name,
            plan: change.plan,
            status: change.status,
          },
        });
        return { ok: true };
      }
      return err(404, "Operação administrativa não encontrada.");
    });
  } catch (e) {
    if ((e as { code?: string }).code === "23505")
      err(
        409,
        "Este e-mail já possui uma conta. Use outro endereço ou localize o cliente existente.",
      );
    throw e;
  }
}
