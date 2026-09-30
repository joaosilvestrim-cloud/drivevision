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
export const TERMS_VERSION = "2026-09-30";
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
    const state =
      until && new Date(until).getTime() > Date.now()
        ? "active"
        : canceled
          ? "canceled"
          : payments.some((p) => p.status === "OVERDUE")
            ? "overdue"
            : "pending";
    await c.query(
      "update drivevision.billing_accounts set paid_until=$2,canceled=$3,state=$4,customer_id=coalesce($5,customer_id),last_reconciled_at=now(),next_reconcile_at=now()+interval '6 hours',last_error=null where owner_id=$1",
      [owner, until, canceled, state, sub?.customer || null],
    );
  });
}
export async function billingStatus(owner: string) {
  return transaction(
    owner,
    async (c) => {
      const row = (
        await c.query(
          "select state,paid_until,canceled,subscription_id,last_reconciled_at,last_error from drivevision.billing_accounts where owner_id=$1",
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
          "select url,state,expires_at from drivevision.billing_checkouts where owner_id=$1 order by created_at desc limit 1",
          [owner],
        )
      ).rows[0];
      return {
        required: true,
        access:
          !!row.paid_until && new Date(row.paid_until).getTime() > Date.now(),
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
async function createCheckout(owner: string, origin: string) {
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
      await c.query(
        "insert into drivevision.billing_checkouts(id,owner_id,expires_at) values($1,$2,now()+interval '60 minutes')",
        [id, owner],
      );
      return { id };
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
          description: "Workspace de análises DriveVision. R$ 59,90 por mês.",
          quantity: 1,
          value: PRICE_CENTS / 100,
        },
      ],
      subscription: { cycle: "MONTHLY", nextDueDate: today },
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
        "update drivevision.billing_accounts set canceled=true,state=case when paid_until>now() then 'active' else 'canceled' end,next_reconcile_at=now()+interval '6 hours' where owner_id=$1",
        [owner],
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
) {
  if (path === "/api/billing" && method === "GET") return billingStatus(owner);
  if (path === "/api/billing/checkout" && method === "POST")
    return createCheckout(owner, origin);
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
          'select a.name,a.email,b.state,b.canceled,b.paid_until as "paidUntil",b.last_error as error,b.created_at as "createdAt" from drivevision.billing_accounts b join drivevision.accounts a on a.id=b.owner_id order by b.created_at desc limit 100',
        )
      ).rows;
      const counts = (
        await c.query(
          "select count(*)::int total,count(*) filter(where paid_until>now())::int active,count(*) filter(where canceled)::int canceled from drivevision.billing_accounts",
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
          "select 1 from drivevision.billing_accounts where owner_id=$1 and (paid_until is null or paid_until<=now())",
          [owner],
        )
      ).rowCount,
    { allowUnpaid: true },
  );
}
