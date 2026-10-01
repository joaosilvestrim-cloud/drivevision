import { emailVerified, queueEmail } from "./email.ts";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { database, transaction } from "./database.ts";
import {
  ConnectorError,
  seal,
  unseal,
  secretMatches,
} from "./connector-security.ts";

export const PRICE_CENTS = 5990;
export const TERMS_VERSION = "2026-09-30-trial-v1";
export function trialDueDate(now = new Date()) {
  const format = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // Asaas charges by date. Round UP and include the checkout's one-hour validity,
  // so even a late enrollment receives at least seven full days before charging.
  const earliest = new Date(now.getTime() + 7 * 86400000 + 3600000);
  const midnight = new Date(`${format.format(earliest)}T00:00:00-03:00`);
  return format.format(
    new Date(midnight.getTime() + (midnight < earliest ? 86400000 : 0)),
  );
}
type ProviderPayment = {
  id: string;
  subscription?: string;
  customer?: string;
  value: number;
  dueDate: string;
  status: string;
  deleted?: boolean;
  invoiceUrl?: string;
  refunds?: { status: string; value: number }[];
};
type ProviderResponse = {
  billingType?: string;
  checkoutSession?: string;
  nextDueDate?: string;
  id?: string;
  link?: string;
  value?: number;
  cycle?: string;
  customer?: string;
  status?: string;
  deleted?: boolean;
  data?: ProviderPayment[];
  hasMore?: boolean;
};
type BillingConfig = {
  apiKey: string;
  webhookToken: string;
  environment: "production" | "sandbox";
};
const configSchema = z
  .object({
    apiKey: z.string().min(30).max(1000),
    webhookToken: z.string().min(32).max(255),
    environment: z.enum(["production", "sandbox"]),
  })
  .strict();
const configAAD = "drivevision:asaas:platform:v1";
export async function billingConfig(): Promise<BillingConfig | null> {
  if (
    process.env.DRIVEVISION_ASAAS_API_KEY &&
    process.env.DRIVEVISION_ASAAS_WEBHOOK_TOKEN
  )
    return {
      apiKey: process.env.DRIVEVISION_ASAAS_API_KEY,
      webhookToken: process.env.DRIVEVISION_ASAAS_WEBHOOK_TOKEN,
      environment:
        process.env.DRIVEVISION_ASAAS_ENV === "sandbox"
          ? "sandbox"
          : "production",
    };
  const row = (
    await database().query(
      "select encrypted_value from drivevision.platform_settings where key='asaas'",
    )
  ).rows[0];
  return row
    ? configSchema.parse(unseal(row.encrypted_value, configAAD))
    : null;
}
async function requiredConfig() {
  const config = await billingConfig();
  if (!config)
    throw new ConnectorError(
      503,
      "As assinaturas estão temporariamente indisponíveis. Tente novamente em instantes.",
    );
  return config;
}
async function asaas(
  path: string,
  method = "GET",
  body?: unknown,
  config?: BillingConfig,
): Promise<ProviderResponse | null> {
  const credentials = config || (await requiredConfig());
  const base =
    credentials.environment === "sandbox"
      ? "https://api-sandbox.asaas.com/v3"
      : "https://api.asaas.com/v3";
  let response: Response;
  try {
    response = await fetch(base + path, {
      method,
      headers: {
        access_token: credentials.apiKey,
        "User-Agent": "DriveVision/1.0",
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    throw new ConnectorError(
      502,
      "Não foi possível consultar o pagamento. Seus dados estão preservados; tente novamente.",
    );
  }
  if (response.status === 404) return null;
  if (!response.ok)
    throw new ConnectorError(
      502,
      "O serviço de pagamento não concluiu a solicitação. Tente novamente ou fale com o suporte.",
    );
  return response.json();
}
export function safeAsaasUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const u = new URL(value);
    return u.protocol === "https:" &&
      ["asaas.com", "www.asaas.com", "sandbox.asaas.com"].includes(
        u.hostname,
      ) &&
      !u.username &&
      !u.password
      ? u.href
      : null;
  } catch {
    return null;
  }
}
function billingTx<T>(owner: string, fn: (c: PoolClient) => Promise<T>) {
  // Signed background events must still reconcile a manually suspended customer.
  // This does not clear accounts.disabled_at or grant application access.
  return transaction(
    "",
    async (c) => {
      await c.query("select set_config('drivevision.user_id',$1,true)", [
        owner,
      ]);
      return fn(c);
    },
    { allowUnpaid: true },
  );
}
async function allPayments(filter: string, config: BillingConfig) {
  const data: ProviderPayment[] = [];
  for (let offset = 0; offset < 2000; offset += 100) {
    const page = await asaas(
      `/payments?${filter}&limit=100&offset=${offset}`,
      "GET",
      undefined,
      config,
    );
    if (!page || !Array.isArray(page.data))
      throw new ConnectorError(502, "Não foi possível conferir a assinatura.");
    data.push(...page.data);
    if (!page.hasMore) return data;
  }
  throw new ConnectorError(
    502,
    "A conciliação precisa de uma revisão do suporte.",
  );
}
export function periodEnd(due: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due))
    throw new ConnectorError(502, "Vencimento inválido recebido do pagamento.");
  const [year, month, day] = due.split("-").map(Number);
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > new Date(Date.UTC(year, month, 0)).getUTCDate()
  )
    throw new ConnectorError(502, "Vencimento inválido recebido do pagamento.");
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, days), 3));
}
function paidState(p: ProviderPayment) {
  if (p.deleted) return "DELETED";
  if (p.refunds?.some((r) => r.status === "DONE" && Number(r.value) > 0))
    return "REFUNDED";
  return String(p.status || "UNKNOWN");
}
export async function reconcileBilling(owner: string) {
  const config = await requiredConfig();
  return billingTx(owner, async (c) => {
    const account = (
      await c.query(
        "select * from drivevision.billing_accounts where owner_id=$1 for update",
        [owner],
      )
    ).rows[0];
    if (!account) return;
    const checkout = (
      await c.query(
        "select * from drivevision.billing_checkouts where owner_id=$1 and provider_id is not null order by created_at desc limit 1",
        [owner],
      )
    ).rows[0];
    if (
      checkout?.state === "creating" &&
      new Date(checkout.expires_at).getTime() > Date.now()
    ) {
      const cfg = config;
      await c.query(
        "update drivevision.billing_checkouts set state='active',url=$2 where id=$1",
        [
          checkout.id,
          `https://${cfg.environment === "sandbox" ? "sandbox." : ""}asaas.com/checkoutSession/show?id=${encodeURIComponent(checkout.provider_id)}`,
        ],
      );
    }
    let subscription = account.subscription_id;
    // A canceled past subscription is replaced only by the new checkout's verified payments.
    if (checkout && (!subscription || account.canceled)) {
      const payments = await allPayments(
        `checkoutSession=${encodeURIComponent(checkout.provider_id)}`,
        config,
      );
      const first = payments.find(
        (p) =>
          typeof p.subscription === "string" &&
          Math.round(Number(p.value) * 100) === PRICE_CENTS,
      );
      if (first) {
        subscription = first.subscription;
        await c.query(
          "update drivevision.billing_accounts set subscription_id=$2,customer_id=$3 where owner_id=$1",
          [owner, subscription, first.customer],
        );
        await c.query(
          "update drivevision.billing_checkouts set state='paid' where id=$1",
          [checkout.id],
        );
      }
    }
    if (!subscription) {
      await c.query(
        "update drivevision.billing_accounts set last_reconciled_at=now(),next_reconcile_at=case when $2::boolean then now()+interval '5 minutes' else now()+interval '1 day' end,last_error=null where owner_id=$1",
        [
          owner,
          !!checkout && new Date(checkout.expires_at).getTime() > Date.now(),
        ],
      );
      return;
    }
    const sub = await asaas(
      `/subscriptions/${encodeURIComponent(subscription)}`,
      "GET",
      undefined,
      config,
    );
    if (
      sub &&
      (Math.round(Number(sub.value) * 100) !== PRICE_CENTS ||
        sub.cycle !== "MONTHLY" ||
        (account.customer_id &&
          subscription === account.subscription_id &&
          sub.customer !== account.customer_id))
    )
      throw new ConnectorError(
        409,
        "Os dados da assinatura precisam ser conferidos pelo suporte.",
      );
    const payments = await allPayments(
      `subscription=${encodeURIComponent(subscription)}`,
      config,
    );
    // The provider is authoritative, including refunds and deleted charges; callbacks are never proof.
    await c.query(
      "update drivevision.billing_payments set status='DELETED',updated_at=now() where owner_id=$1 and subscription_id=$2 and not(id=any($3::text[]))",
      [owner, subscription, payments.map((p) => p.id)],
    );
    for (const p of payments) {
      if (p.subscription !== subscription || !p.id || !p.dueDate) continue;
      const amount = Math.round(Number(p.value) * 100);
      if (!Number.isSafeInteger(amount)) continue;
      await c.query(
        "insert into drivevision.billing_payments(id,owner_id,subscription_id,status,amount_cents,due_date,period_end,invoice_url) values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(id) do update set status=excluded.status,amount_cents=excluded.amount_cents,due_date=excluded.due_date,period_end=excluded.period_end,invoice_url=excluded.invoice_url,updated_at=now() where drivevision.billing_payments.owner_id=excluded.owner_id",
        [
          p.id,
          owner,
          subscription,
          paidState(p),
          amount,
          p.dueDate,
          periodEnd(p.dueDate),
          safeAsaasUrl(p.invoiceUrl),
        ],
      );
    }
    const until = (
      await c.query(
        "select max(period_end) as until from drivevision.billing_payments where owner_id=$1 and amount_cents=$2 and status in ('CONFIRMED','RECEIVED','RECEIVED_IN_CASH')",
        [owner, PRICE_CENTS],
      )
    ).rows[0].until;
    const canceled = !sub || sub.deleted === true || sub.status === "INACTIVE";
    let trialUntil = account.trial_ends_at;
    // Asaas creates a hosted recurring subscription only after checkout completion.
    // Verify its checkout identity, type, price, cycle and first due date server-side.
    // Redirects and unverified webhook payloads cannot start or extend a trial.
    const due = checkout?.trial_due_date;
    const dueDay = due instanceof Date ? due.toISOString().slice(0, 10) : due;
    if (
      !account.trial_started_at &&
      account.trial_eligible &&
      !account.paid_until &&
      dueDay &&
      !canceled &&
      sub?.status === "ACTIVE" &&
      sub.billingType === "CREDIT_CARD" &&
      sub.checkoutSession === checkout.provider_id &&
      payments.some(
        (p) =>
          p.subscription === subscription &&
          p.customer === sub.customer &&
          p.dueDate === dueDay &&
          p.status === "PENDING" &&
          !p.deleted &&
          Math.round(Number(p.value) * 100) === PRICE_CENTS,
      )
    ) {
      const end = new Date(`${dueDay}T00:00:00-03:00`);
      if (end.getTime() > Date.now()) {
        trialUntil = end;
        await c.query(
          "update drivevision.billing_accounts set trial_started_at=now(),trial_ends_at=$2,trial_eligible=false where owner_id=$1",
          [owner, end],
        );
        await queueEmail(
          c,
          owner,
          `trial:${owner}`,
          "subscription",
          "Seu teste DriveVision começou",
          `Seu cartão foi cadastrado no Asaas. Seu teste vai até ${end.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}, quando começa a cobrança automática de R$ 59,90/mês. Cancele a renovação antes dessa data se não quiser continuar.`,
          `${process.env.DRIVEVISION_APP_ORIGIN || "https://vision.drivedata.com.br"}/?view=billing`,
          "Gerenciar meu teste",
        );
      }
    }
    const state =
      until && new Date(until).getTime() > Date.now()
        ? "active"
        : trialUntil && new Date(trialUntil).getTime() > Date.now()
          ? "trialing"
          : canceled
            ? "canceled"
            : payments.some((p) => p.status === "OVERDUE")
              ? "overdue"
              : "pending";
    await c.query(
      "update drivevision.billing_accounts set paid_until=$2,canceled=$3,state=$4,customer_id=coalesce($5,customer_id),last_reconciled_at=now(),next_reconcile_at=now()+interval '6 hours',last_error=null where owner_id=$1",
      [owner, until, canceled, state, sub?.customer || null],
    );
    if (
      state === "active" &&
      until &&
      (!account.paid_until ||
        new Date(until).getTime() > new Date(account.paid_until).getTime())
    ) {
      await queueEmail(
        c,
        owner,
        `paid:${owner}:${new Date(until).toISOString()}`,
        "subscription",
        "Sua assinatura está ativa",
        `O pagamento foi confirmado. Seu workspace está disponível até ${new Date(until).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}. A mensalidade é de R$ 59,90.`,
        `${process.env.DRIVEVISION_APP_ORIGIN || "https://vision.drivedata.com.br"}/?view=billing`,
        "Acessar minha assinatura",
      );
    } else if (state === "overdue" && account.state !== "overdue") {
      await queueEmail(
        c,
        owner,
        `overdue:${owner}:${payments
          .filter((p) => p.status === "OVERDUE")
          .map((p) => p.id)
          .sort()
          .join(",")}`,
        "subscription",
        "Sua assinatura precisa de atenção",
        "Há uma pendência de pagamento. Acesse sua assinatura para conferir a cobrança e regularizar seu acesso.",
        `${process.env.DRIVEVISION_APP_ORIGIN || "https://vision.drivedata.com.br"}/?view=billing`,
        "Conferir assinatura",
      );
    }
  });
}
export async function billingStatus(owner: string) {
  return transaction(
    owner,
    async (c) => {
      const row = (
        await c.query(
          "select state,paid_until,trial_eligible,trial_started_at,trial_ends_at,canceled,subscription_id,last_reconciled_at,last_error from drivevision.billing_accounts where owner_id=$1",
          [owner],
        )
      ).rows[0];
      if (!row)
        return {
          required: false,
          access: true,
          state: "manual",
          priceCents: PRICE_CENTS,
        };
      const payments = (
        await c.query(
          'select id,status,amount_cents as "amountCents",due_date as "dueDate",invoice_url as url from drivevision.billing_payments where owner_id=$1 order by due_date desc,id limit 12',
          [owner],
        )
      ).rows;
      const checkout = (
        await c.query(
          "select url,state,expires_at,trial_due_date from drivevision.billing_checkouts where owner_id=$1 order by created_at desc limit 1",
          [owner],
        )
      ).rows[0];
      return {
        required: true,
        access:
          Math.max(
            new Date(row.paid_until || 0).getTime(),
            new Date(row.trial_ends_at || 0).getTime(),
          ) > Date.now(),
        trialEligible:
          row.trial_eligible && !row.trial_started_at && !row.paid_until,
        trialEndsAt: row.trial_ends_at,
        firstChargeDate:
          row.trial_ends_at ||
          (checkout?.state === "active" &&
          new Date(checkout.expires_at).getTime() > Date.now()
            ? checkout.trial_due_date instanceof Date
              ? checkout.trial_due_date.toISOString().slice(0, 10)
              : checkout.trial_due_date
            : null) ||
          trialDueDate(),
        state: row.state,
        canceled: row.canceled,
        hasSubscription: !!row.subscription_id,
        paidUntil: row.paid_until,
        lastReconciledAt: row.last_reconciled_at,
        error: row.last_error,
        priceCents: PRICE_CENTS,
        payments,
        checkoutUrl:
          checkout?.state === "active" &&
          new Date(checkout.expires_at).getTime() > Date.now()
            ? safeAsaasUrl(checkout.url)
            : null,
      };
    },
    { allowUnpaid: true },
  );
}
async function createCheckout(owner: string, origin: string, input: unknown) {
  const config = await requiredConfig();
  // Commit the creation intent BEFORE the remote request. An unknown outcome never creates a second charge path.
  const intent = await transaction(
    owner,
    async (c) => {
      const row = (
        await c.query(
          "select * from drivevision.billing_accounts where owner_id=$1 for update",
          [owner],
        )
      ).rows[0];
      if (!row)
        throw new ConnectorError(
          409,
          "Seu acesso já é administrado pela DriveData.",
        );
      if (row.paid_until && new Date(row.paid_until).getTime() > Date.now())
        throw new ConnectorError(
          409,
          "Sua assinatura já possui um período pago. Acesse seu workspace.",
        );
      if (
        row.trial_ends_at &&
        new Date(row.trial_ends_at).getTime() > Date.now()
      )
        throw new ConnectorError(
          409,
          "Seu teste já está liberado. Acesse seu workspace.",
        );
      const trial =
        row.trial_eligible && !row.trial_started_at && !row.paid_until;
      if (
        trial &&
        !(
          input &&
          typeof input === "object" &&
          (input as { acceptedTrial?: boolean }).acceptedTrial === true
        )
      )
        throw new ConnectorError(
          400,
          "Autorize a cobrança mensal após os 7 dias grátis para cadastrar seu cartão.",
        );
      if (row.subscription_id && !row.canceled) {
        const payment = (
          await c.query(
            "select invoice_url from drivevision.billing_payments where owner_id=$1 and subscription_id=$2 and status in ('PENDING','OVERDUE') order by due_date limit 1",
            [owner, row.subscription_id],
          )
        ).rows[0];
        const url = safeAsaasUrl(payment?.invoice_url);
        if (url) return { url };
        throw new ConnectorError(
          409,
          "Sua assinatura está sendo conferida. Atualize a situação antes de tentar novamente.",
        );
      }
      const previous = (
        await c.query(
          "select * from drivevision.billing_checkouts where owner_id=$1 order by created_at desc limit 1",
          [owner],
        )
      ).rows[0];
      if (
        previous?.state === "active" &&
        new Date(previous.expires_at).getTime() > Date.now() &&
        safeAsaasUrl(previous.url)
      )
        return { url: previous.url };
      if (
        previous?.state === "creating" &&
        new Date(previous.expires_at).getTime() > Date.now()
      )
        throw new ConnectorError(
          409,
          "Seu checkout está sendo preparado. Aguarde a confirmação e atualize a situação em instantes.",
        );
      const id = randomUUID();
      const due = trial ? trialDueDate() : null;
      await c.query(
        "insert into drivevision.billing_checkouts(id,owner_id,expires_at,trial_due_date) values($1,$2,now()+interval '60 minutes',$3)",
        [id, owner, due],
      );
      return { id, due };
    },
    { allowUnpaid: true },
  );
  if ("url" in intent) return intent;
  const id = intent.id;
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const result = await asaas(
    "/checkouts",
    "POST",
    {
      billingTypes: ["CREDIT_CARD"],
      chargeTypes: ["RECURRENT"],
      minutesToExpire: 60,
      externalReference: `drivevision:${id}`,
      callback: {
        successUrl: `${origin}/?view=billing&payment=return`,
        cancelUrl: `${origin}/?view=billing&payment=canceled`,
        expiredUrl: `${origin}/?view=billing&payment=expired`,
      },
      items: [
        {
          name: "DriveVision mensal",
          description: intent.due
            ? `7 dias grátis. Primeira cobrança em ${intent.due}; depois R$ 59,90/mês. Cancele antes dessa data para não cobrar.`
            : "Workspace de análises DriveVision. R$ 59,90 por mês.",
          quantity: 1,
          value: PRICE_CENTS / 100,
        },
      ],
      subscription: { cycle: "MONTHLY", nextDueDate: intent.due || today },
    },
    config,
  );
  if (!result?.id)
    throw new ConnectorError(502, "Não foi possível abrir o checkout.");
  const url =
    safeAsaasUrl(result.link) ||
    `https://${config.environment === "sandbox" ? "sandbox." : ""}asaas.com/checkoutSession/show?id=${encodeURIComponent(result.id)}`;
  return transaction(
    owner,
    async (c) => {
      await c.query(
        "update drivevision.billing_checkouts set provider_id=$2,url=$3,state=case when state='creating' then 'active' else state end where id=$1 and (provider_id is null or provider_id=$2)",
        [id, result.id, url],
      );
      await c.query(
        "update drivevision.billing_accounts set next_reconcile_at=now()+interval '2 minutes' where owner_id=$1",
        [owner],
      );
      return { url };
    },
    { allowUnpaid: true },
  );
}
async function cancelSubscription(owner: string) {
  const config = await requiredConfig();
  await reconcileBilling(owner);
  return transaction(
    owner,
    async (c) => {
      const row = (
        await c.query(
          "select * from drivevision.billing_accounts where owner_id=$1 for update",
          [owner],
        )
      ).rows[0];
      if (!row)
        throw new ConnectorError(
          409,
          "Este acesso não possui cobrança recorrente.",
        );
      if (
        (
          await c.query(
            "select 1 from drivevision.billing_checkouts where owner_id=$1 and state='creating' and expires_at>now()",
            [owner],
          )
        ).rowCount
      )
        throw new ConnectorError(
          409,
          "Aguarde a confirmação do checkout antes de cancelar.",
        );
      if (row.subscription_id && !row.canceled)
        await asaas(
          `/subscriptions/${encodeURIComponent(row.subscription_id)}`,
          "DELETE",
          undefined,
          config,
        );
      const checkouts = (
        await c.query(
          "select provider_id from drivevision.billing_checkouts where owner_id=$1 and state='active'",
          [owner],
        )
      ).rows;
      for (const checkout of checkouts)
        await asaas(
          `/checkouts/${encodeURIComponent(checkout.provider_id)}/cancel`,
          "POST",
          {},
        );
      await c.query(
        "update drivevision.billing_checkouts set state='canceled' where owner_id=$1 and state='active'",
        [owner],
      );
      await c.query(
        "update drivevision.billing_accounts set canceled=true,state=case when paid_until>now() then 'active' when trial_ends_at>now() then 'trialing' else 'canceled' end,next_reconcile_at=now()+interval '6 hours' where owner_id=$1",
        [owner],
      );
      if (row.subscription_id && !row.canceled)
        await queueEmail(
          c,
          owner,
          `cancel:${owner}:${row.subscription_id}`,
          "subscription",
          "Renovação cancelada",
          "Sua assinatura não será renovada. Seu acesso permanece disponível até o fim do teste já concedido ou do período pago. Nenhuma nova cobrança será feita nesta assinatura.",
          `${process.env.DRIVEVISION_APP_ORIGIN || "https://vision.drivedata.com.br"}/?view=billing`,
          "Ver minha assinatura",
        );
      return { ok: true };
    },
    { allowUnpaid: true },
  );
}
export async function billingRoute(
  owner: string,
  path: string,
  method: string,
  origin: string,
  input?: unknown,
) {
  if (path === "/api/billing" && method === "GET") return billingStatus(owner);
  if (path === "/api/billing/checkout" && method === "POST") {
    if (!(await emailVerified(owner)))
      throw new ConnectorError(
        403,
        "Confirme seu e-mail antes de continuar com a assinatura.",
      );
    return createCheckout(owner, origin, input);
  }
  if (path === "/api/billing/sync" && method === "POST") {
    await reconcileBilling(owner);
    return billingStatus(owner);
  }
  if (path === "/api/billing/cancel" && method === "POST")
    return cancelSubscription(owner);
  throw new ConnectorError(404, "Operação de assinatura não encontrada.");
}
export async function authorizeWebhook(token: string | undefined) {
  const config = await requiredConfig();
  if (!secretMatches(token, config.webhookToken))
    throw new ConnectorError(401, "Não autorizado.");
}
export async function receiveBillingEvent(input: unknown) {
  const entity = z
    .object({
      id: z.string().max(200),
      externalReference: z.string().max(200).nullish(),
      subscription: z.string().max(200).nullish(),
    })
    .passthrough();
  const parsed = z
    .object({
      id: z.string().min(1).max(200),
      event: z.string().min(1).max(100),
      checkout: entity.optional(),
      payment: entity.optional(),
      subscription: entity.optional(),
    })
    .safeParse(input);
  if (!parsed.success) throw new ConnectorError(400, "Evento inválido.");
  const v = parsed.data;
  if (!/^(CHECKOUT_|PAYMENT_|SUBSCRIPTION_)/.test(v.event))
    return { received: true, ignored: true };
  await database().query(
    "insert into drivevision.billing_events(id,kind,resource_id,checkout_reference,subscription_id) values($1,$2,$3,$4,$5) on conflict(id) do nothing",
    [
      v.id,
      v.event,
      v.checkout?.id || v.payment?.id || v.subscription?.id || null,
      v.checkout?.externalReference || null,
      v.payment?.subscription || v.subscription?.id || null,
    ],
  );
  return { received: true };
}
export async function billingCron() {
  if (!(await billingConfig())) return { processed: 0 };
  const deadline = Date.now() + 18000;
  const events = (
    await database().query(
      "update drivevision.billing_events set retry_at=now()+interval '2 minutes',attempts=attempts+1 where id in(select id from drivevision.billing_events where status='pending' and retry_at<=now() order by created_at limit 20 for update skip locked) returning *",
    )
  ).rows;
  let processed = 0;
  for (const event of events) {
    if (Date.now() > deadline) break;
    let owner: string | undefined;
    try {
      if (event.kind.startsWith("CHECKOUT_")) {
        const candidate = event.checkout_reference?.replace(
          /^drivevision:/,
          "",
        );
        const ref = z.string().uuid().safeParse(candidate).success
          ? candidate
          : null;
        const row = (
          await database().query(
            "select owner_id,id from drivevision.checkout_queue where provider_id=$1 or id=$2::uuid limit 1",
            [event.resource_id, ref || null],
          )
        ).rows[0];
        owner = row?.owner_id;
        if (owner && ref)
          await billingTx(owner, (c) =>
            c.query(
              "update drivevision.billing_checkouts set provider_id=coalesce(provider_id,$2) where id=$1 and (provider_id is null or provider_id=$2)",
              [row.id, event.resource_id],
            ),
          );
        if (
          owner &&
          ["CHECKOUT_CANCELED", "CHECKOUT_EXPIRED"].includes(event.kind)
        )
          await billingTx(owner, (c) =>
            c.query(
              "update drivevision.billing_checkouts set state=$2 where provider_id=$1 and state<>'paid'",
              [
                event.resource_id,
                event.kind === "CHECKOUT_EXPIRED" ? "expired" : "canceled",
              ],
            ),
          );
      } else if (event.subscription_id)
        owner = (
          await database().query(
            "select owner_id from drivevision.billing_queue where subscription_id=$1",
            [event.subscription_id],
          )
        ).rows[0]?.owner_id;
      if (owner) await reconcileBilling(owner);
      await database().query(
        "update drivevision.billing_events set status=$2,processed_at=now() where id=$1",
        [event.id, owner ? "processed" : "ignored"],
      );
      processed++;
    } catch {
      if (owner)
        await billingTx(owner, (c) =>
          c.query(
            "update drivevision.billing_accounts set last_error='A confirmação de pagamento será tentada novamente.',next_reconcile_at=now()+interval '2 minutes' where owner_id=$1",
            [owner],
          ),
        );
    }
  }
  // Recover lost notifications without letting browser redirects grant access.
  if (Date.now() < deadline) {
    const due = (
      await database().query(
        "select owner_id from drivevision.billing_queue where next_reconcile_at<=now() order by next_reconcile_at limit 3",
      )
    ).rows;
    for (const { owner_id: owner } of due) {
      if (Date.now() > deadline) break;
      try {
        await reconcileBilling(owner);
        processed++;
      } catch {
        await billingTx(owner, (c) =>
          c.query(
            "update drivevision.billing_accounts set next_reconcile_at=now()+interval '5 minutes',last_error='A confirmação de pagamento será tentada novamente.' where owner_id=$1",
            [owner],
          ),
        );
      }
    }
  }
  return { processed };
}
export async function adminBilling(actor: string, input?: unknown) {
  const configured = !!(await billingConfig());
  return transaction(
    actor,
    async (c) => {
      if (
        !(
          await c.query(
            "select 1 from drivevision.platform_admins where account_id=$1",
            [actor],
          )
        ).rowCount
      )
        throw new ConnectorError(403, "Acesso restrito à DriveData.");
      if (input !== undefined) {
        const parsed = configSchema.safeParse(input);
        if (!parsed.success)
          throw new ConnectorError(400, "Configuração de pagamento inválida.");
        await asaas("/webhooks?limit=1", "GET", undefined, parsed.data);
        await c.query(
          "insert into drivevision.platform_settings(key,encrypted_value) values('asaas',$1) on conflict(key) do update set encrypted_value=excluded.encrypted_value,updated_at=now()",
          [seal(parsed.data, configAAD)],
        );
        return { configured: true };
      }
      const rows = (
        await c.query(
          'select a.name,a.email,b.state,b.canceled,b.paid_until as "paidUntil",b.trial_ends_at as "trialEndsAt",b.last_error as error,b.created_at as "createdAt" from drivevision.billing_accounts b join drivevision.accounts a on a.id=b.owner_id order by b.created_at desc limit 100',
        )
      ).rows;
      const counts = (
        await c.query(
          "select count(*)::int total,count(*) filter(where paid_until>now())::int active,count(*) filter(where trial_ends_at>now() and (paid_until is null or paid_until<=now()))::int trialing,count(*) filter(where canceled)::int canceled from drivevision.billing_accounts",
        )
      ).rows[0];
      const failures = (
        await c.query(
          "select count(*)::int n from drivevision.billing_events where status='pending' and attempts>2",
        )
      ).rows[0].n;
      return { configured, counts, rows, pendingEvents: failures };
    },
    { allowUnpaid: true },
  );
}

export async function workspaceAccess(owner: string) {
  return transaction(
    owner,
    async (c) =>
      !(
        await c.query(
          "select 1 from drivevision.billing_accounts where owner_id=$1 and coalesce(greatest(paid_until,trial_ends_at),'-infinity'::timestamptz)<=now()",
          [owner],
        )
      ).rowCount,
    { allowUnpaid: true },
  );
}
