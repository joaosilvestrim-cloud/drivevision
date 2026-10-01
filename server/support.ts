import { randomUUID } from "node:crypto";
import { z } from "zod";
import { transaction } from "./database.ts";
import { ConnectorError } from "./connector-security.ts";
import { isSuperAdmin } from "./admin.ts";
import { queueSupportNotification, supportNotifications } from "./email.ts";

const ticketSchema = z
  .object({
    requestId: z.string().uuid(),
    name: z.string().trim().min(2).max(120),
    email: z
      .string()
      .trim()
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    company: z.string().trim().max(160).default(""),
    phone: z.string().trim().max(32).default(""),
    category: z.enum([
      "comercial",
      "acesso",
      "assinatura",
      "dados",
      "graficos",
      "conexoes",
      "sugestao",
      "outro",
    ]),
    priority: z.enum(["normal", "alta"]),
    subject: z.string().trim().min(5).max(160),
    description: z.string().trim().min(20).max(5000),
    steps: z.string().trim().max(2000).default(""),
    expected: z.string().trim().max(1000).default(""),
    page: z
      .string()
      .regex(/^[a-z-]{0,40}$/)
      .default(""),
    consent: z.literal(true),
    website: z.string().max(0).default(""),
  })
  .strict();
const identity = {
  id: z.string().uuid(),
  revision: z.number().int().nonnegative(),
};
const statuses = z.enum(["open", "progress", "waiting", "resolved"]);
const fields = `id,owner_id as "ownerId",name,email,company,phone,category,priority,subject,description,steps,expected,page,status,revision,created_at as "createdAt",updated_at as "updatedAt"`;
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new ConnectorError(
      400,
      "Confira os campos do atendimento e a autorização de contato.",
    );
  return result.data;
}
export async function createTicket(actor: string | null, input: unknown) {
  const v = parse(ticketSchema, input),
    id = randomUUID();
  return transaction(
    actor || "",
    async (c) => {
      const canonical = actor
        ? (
            await c.query(
              "select name,email from drivevision.accounts where id=$1",
              [actor],
            )
          ).rows[0]
        : null;
      // INSERT without RETURNING permits public creation without granting public SELECT.
      const result = await c.query(
        `insert into drivevision.support_tickets(id,request_id,owner_id,name,email,company,phone,category,priority,subject,description,steps,expected,page) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          id,
          v.requestId,
          actor,
          canonical?.name || v.name,
          canonical?.email || v.email,
          v.company,
          v.phone,
          v.category,
          v.priority,
          v.subject,
          v.description,
          v.steps,
          v.expected,
          v.page,
        ],
      );
      if (!result.rowCount)
        throw new ConnectorError(
          409,
          "Esta solicitação já foi recebida. Consulte Meus chamados se estiver conectado.",
        );
      await queueSupportNotification(c, actor, id, "created", v.subject);
      return { id };
    },
    { allowUnpaid: true },
  ).catch((error) => {
    if (error?.code === "23505")
      throw new ConnectorError(
        409,
        "Esta solicitação já foi recebida. Consulte Meus chamados se estiver conectado.",
      );
    throw error;
  });
}
export async function supportRoute(
  actor: string,
  admin: boolean,
  method: string,
  url: URL,
  input?: unknown,
) {
  if (admin && !(await isSuperAdmin(actor)))
    throw new ConnectorError(403, "Acesso restrito à administração.");
  return transaction(
    actor,
    async (c) => {
      if (method === "GET") {
        const id = url.searchParams.get("id");
        if (id) {
          parse(z.string().uuid(), id);
          const ticket = (
            await c.query(
              `select ${fields} from drivevision.support_tickets where id=$1`,
              [id],
            )
          ).rows[0];
          if (!ticket)
            throw new ConnectorError(404, "Atendimento não encontrado.");
          const messages = (
            await c.query(
              `select id,staff,body,created_at as "createdAt" from drivevision.support_messages where ticket_id=$1 order by created_at,id`,
              [id],
            )
          ).rows;
          const notifications = admin
            ? await supportNotifications(c, id)
            : undefined;
          return { ticket, messages, notifications };
        }
        const status = url.searchParams.get("status") || "all";
        if (status !== "all") parse(statuses, status);
        const q = (url.searchParams.get("q") || "").trim().slice(0, 120);
        const requested = Number(url.searchParams.get("page") || 1);
        if (!Number.isSafeInteger(requested) || requested < 1)
          throw new ConnectorError(400, "Página inválida.");
        const filter =
          "from drivevision.support_tickets where ($1='all' or status=$1) and ($2='' or strpos(lower(subject||' '||email||' '||name||' '||company||' '||id::text),lower($2))>0)";
        const counts = (
          await c.query(
            `select count(*)::int total,count(*) filter(where status='open')::int open,count(*) filter(where status='progress')::int progress,count(*) filter(where status='waiting')::int waiting,count(*) filter(where status='resolved')::int resolved ${filter}`,
            [status, q],
          )
        ).rows[0];
        const pages = Math.max(1, Math.ceil(counts.total / 20)),
          page = Math.min(pages, requested);
        const tickets = (
          await c.query(
            `select ${fields} ${filter} order by created_at desc,id limit 20 offset $3`,
            [status, q, (page - 1) * 20],
          )
        ).rows;
        return { tickets, counts, pages, page };
      }
      if (method === "POST") {
        const v = parse(
          z
            .object({
              ...identity,
              body: z.string().trim().max(5000).default(""),
              status: statuses.optional(),
            })
            .strict(),
          input,
        );
        if (!admin && (!v.body || v.status))
          throw new ConnectorError(400, "Escreva uma mensagem para a equipe.");
        if (admin && !v.body && !v.status)
          throw new ConnectorError(
            400,
            "Informe uma resposta ou altere a situação.",
          );
        const ticket = (
          await c.query(
            "select * from drivevision.support_tickets where id=$1 for update",
            [v.id],
          )
        ).rows[0];
        if (!ticket)
          throw new ConnectorError(404, "Atendimento não encontrado.");
        if (ticket.revision !== v.revision)
          throw new ConnectorError(
            409,
            "Este atendimento foi atualizado. Atualize a lista antes de enviar novamente.",
          );
        const messageId = randomUUID();
        if (v.body)
          await c.query(
            "insert into drivevision.support_messages(id,ticket_id,author_id,staff,body) values($1,$2,$3,$4,$5)",
            [messageId, v.id, actor, admin, v.body],
          );
        await c.query(
          "update drivevision.support_tickets set status=$2,revision=revision+1,updated_at=now() where id=$1",
          [v.id, admin ? v.status || "waiting" : "open"],
        );
        if (!admin)
          await queueSupportNotification(
            c,
            actor,
            v.id,
            messageId,
            ticket.subject,
          );
        return { id: v.id };
      }
      throw new ConnectorError(404, "Operação de atendimento não encontrada.");
    },
    { allowUnpaid: true },
  );
}
