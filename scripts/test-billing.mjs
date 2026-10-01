import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { Client } from "pg";
import handler from "../server/handler.ts";
import {
  database,
  connectionOptions,
  closeDatabase,
  transaction,
} from "../server/database.ts";
import {
  billingCron,
  periodEnd,
  safeAsaasUrl,
  trialDueDate,
} from "../server/billing.ts";
process.loadEnvFile(".env.local");
process.env.DRIVEVISION_CONNECTOR_KEY ||= Buffer.alloc(32, 42).toString(
  "base64",
);
process.env.DRIVEVISION_ASAAS_API_KEY = "test-only-not-a-provider-credential";
process.env.DRIVEVISION_ASAAS_WEBHOOK_TOKEN = randomBytes(32).toString("hex");
process.env.DRIVEVISION_ASAAS_ENV = "sandbox";
const run = randomUUID(),
  owners = [],
  events = [],
  checkouts = new Map(),
  subs = new Map(),
  payments = [];
let creates = 0,
  unknown = false;
const realFetch = globalThis.fetch;
const json = (value, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
globalThis.fetch = async (input, init) => {
  const url = new URL(String(input));
  if (url.hostname === "127.0.0.1") return realFetch(input, init);
  assert.equal(url.origin, "https://api-sandbox.asaas.com");
  assert.equal(
    init.headers.access_token,
    process.env.DRIVEVISION_ASAAS_API_KEY,
  );
  if (url.pathname === "/v3/checkouts" && init.method === "POST") {
    creates++;
    const body = JSON.parse(init.body);
    assert.equal(body.items[0].value, 59.9);
    assert.equal(body.subscription.cycle, "MONTHLY");
    assert.deepEqual(body.billingTypes, ["CREDIT_CARD"]);
    assert.equal(body.customerData, undefined);
    const id = "checkout-" + randomUUID();
    checkouts.set(id, { ...body, id });
    if (unknown) {
      unknown = false;
      throw new Error("Simulated lost response");
    }
    return json({ id });
  }
  if (url.pathname === "/v3/payments")
    return json({
      data: payments.filter((p) =>
        url.searchParams.has("checkoutSession")
          ? p.checkoutSession === url.searchParams.get("checkoutSession")
          : p.subscription === url.searchParams.get("subscription"),
      ),
      hasMore: false,
    });
  if (url.pathname.startsWith("/v3/subscriptions/")) {
    const id = url.pathname.split("/").at(-1);
    if (init.method === "DELETE") {
      subs.delete(id);
      return json({ deleted: true });
    }
    return subs.has(id) ? json(subs.get(id)) : json({}, 404);
  }
  if (url.pathname.endsWith("/cancel")) return json({ deleted: true });
  throw new Error("Unexpected billing fixture request " + url.pathname);
};
const admin = new Client(connectionOptions(true));
await admin.connect();
const server = createServer(handler);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
process.env.DRIVEVISION_APP_ORIGIN = base;
const pool = database(),
  originalQuery = pool.query;
// A shared database must never dispatch other customers' jobs through fake Asaas responses.
pool.query = function (query, ...args) {
  if (
    typeof query === "string" &&
    query.startsWith("update drivevision.billing_events set retry_at=")
  )
    return originalQuery.call(
      this,
      query.replace(
        "where status='pending'",
        "where id=any($1::text[]) and status='pending'",
      ),
      [events],
    );
  if (
    typeof query === "string" &&
    query.startsWith(
      "select owner_id from drivevision.billing_queue where next_reconcile_at",
    )
  )
    return originalQuery.call(
      this,
      query.replace(
        "where next_reconcile_at",
        "where owner_id=any($1::uuid[]) and next_reconcile_at",
      ),
      [owners],
    );
  return originalQuery.call(this, query, ...args);
};
const ip = `198.20.${Math.floor(Math.random() * 254)}.${Math.floor(Math.random() * 254)}`;
async function req(path, body, cookie, headers = {}) {
  const r = await fetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Origin: base,
      "Content-Type": "application/json",
      "X-Forwarded-For": ip,
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await r.text();
  return {
    status: r.status,
    data: r.headers.get("content-type")?.includes("json")
      ? JSON.parse(raw)
      : null,
    cookie: r.headers.get("set-cookie")?.split(";")[0],
  };
}
async function account(trial = false) {
  const r = await req("/api/register", {
    name: "QA Billing",
    email: `qa-billing-${randomUUID()}@drivevision.invalid`,
    password: "Billing-fixture-password-2026",
    acceptedTerms: true,
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  owners.push(r.data.user.id);
  assert.equal((await req("/api/billing/checkout", {}, r.cookie)).status, 403);
  await admin.query(
    "update drivevision.accounts set email_verified_at=now() where id=$1",
    [r.data.user.id],
  );
  if (!trial)
    await admin.query(
      "update drivevision.billing_accounts set trial_eligible=false where owner_id=$1",
      [r.data.user.id],
    );
  return { ...r, id: r.data.user.id };
}
async function event(kind, entity) {
  const id = `evt-${run}-${events.length}`;
  events.push(id);
  const payload = { id, event: kind, ...entity };
  assert.equal(
    (
      await req("/api/webhooks/asaas", payload, null, {
        "asaas-access-token": process.env.DRIVEVISION_ASAAS_WEBHOOK_TOKEN,
      })
    ).status,
    200,
  );
  await billingCron();
  return payload;
}
let checks = 0;
function pass(name) {
  checks++;
  console.log("PASS", name);
}
try {
  for (const start of [
    "2026-09-30T21:00:00-03:00",
    "2026-12-31T23:45:00-03:00",
    "2028-02-28T00:01:00-03:00",
  ]) {
    const now = new Date(start),
      due = new Date(trialDueDate(now) + "T00:00:00-03:00");
    assert.ok(due.getTime() - now.getTime() >= 7 * 86400000 + 3600000);
    assert.ok(due.getTime() - now.getTime() < 8 * 86400000 + 3600000);
  }
  assert.equal(
    periodEnd("2027-01-31").toISOString(),
    "2027-02-28T03:00:00.000Z",
  );
  assert.throws(() => periodEnd("2026-02-31"));
  assert.equal(safeAsaasUrl("https://asaas.com.evil.invalid/pay"), null);
  pass("calendar month boundaries and checkout redirect allowlist");
  assert.equal(
    (
      await req("/api/register", {
        name: "QA",
        email: `qa-${run}@drivevision.invalid`,
        password: "Billing-fixture-password-2026",
      })
    ).status,
    400,
  );
  const a = await account(),
    b = await account();
  assert.equal(a.data.user.access, false);
  assert.equal((await req("/api/workspace", undefined, a.cookie)).status, 402);
  assert.equal(
    (await req("/api/billing", undefined, a.cookie)).data.access,
    false,
  );
  assert.equal(
    (await req("/api/admin/billing", undefined, a.cookie)).status,
    403,
  );
  pass(
    "terms are required and new accounts cannot bypass payment or become administrators",
  );
  const result = await Promise.all([
    req("/api/billing/checkout", { value: 0, ownerId: b.id }, a.cookie),
    req("/api/billing/checkout", {}, a.cookie),
  ]);
  assert.equal(creates, 1);
  assert.ok(result.some((r) => r.status === 200));
  const checkout = [...checkouts.values()][0];
  assert.equal(
    (await req("/api/billing", undefined, b.cookie)).data.checkoutUrl,
    null,
  );
  pass(
    "double clicks produce one fixed-price checkout and do not target another customer",
  );
  assert.equal(
    (
      await req("/api/webhooks/asaas", {
        id: "invalid",
        event: "CHECKOUT_PAID",
      })
    ).status,
    401,
  );
  const payload = await event("CHECKOUT_PAID", {
    checkout: {
      id: checkout.id,
      externalReference: checkout.externalReference,
    },
  });
  assert.equal(
    (await req("/api/billing", undefined, a.cookie)).data.access,
    false,
  );
  pass(
    "unauthorized webhook and checkout success without a verified payment cannot grant access",
  );
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
  const sub = "sub-" + run;
  subs.set(sub, {
    id: sub,
    value: 59.9,
    cycle: "MONTHLY",
    customer: "customer-" + run,
    status: "ACTIVE",
  });
  const payment = {
    id: "pay-" + run,
    value: 59.9,
    status: "CONFIRMED",
    dueDate: today,
    subscription: sub,
    checkoutSession: checkout.id,
    customer: "customer-" + run,
    invoiceUrl: "https://asaas.com/i/qa",
  };
  payments.push(payment);
  await event("CHECKOUT_PAID", {
    checkout: {
      id: checkout.id,
      externalReference: checkout.externalReference,
    },
  });
  assert.equal(
    (await req("/api/billing", undefined, a.cookie)).data.access,
    true,
  );
  assert.equal((await req("/api/workspace", undefined, a.cookie)).status, 200);
  await req("/api/webhooks/asaas", payload, null, {
    "asaas-access-token": process.env.DRIVEVISION_ASAAS_WEBHOOK_TOKEN,
  });
  await billingCron();
  assert.equal(
    Number(
      (
        await admin.query(
          "select count(*) n from drivevision.billing_payments where owner_id=$1",
          [a.id],
        )
      ).rows[0].n,
    ),
    1,
  );
  pass(
    "verified payment grants one monthly period and webhook retries are idempotent",
  );
  await event("PAYMENT_RECEIVED", {
    payment: { id: "other-product", subscription: "academy-subscription" },
  });
  assert.equal(
    (await req("/api/billing", undefined, b.cookie)).data.access,
    false,
  );
  pass("payments belonging to another application are ignored");
  payment.status = "REFUNDED";
  await event("PAYMENT_RECEIVED", {
    payment: { id: payment.id, subscription: sub },
  });
  assert.equal(
    (await req("/api/billing", undefined, a.cookie)).data.access,
    false,
  );
  assert.equal((await req("/api/workspace", undefined, a.cookie)).status, 402);
  pass(
    "late or out-of-order events use authoritative state and revoke refunded access",
  );
  payment.status = "CONFIRMED";
  await event("PAYMENT_CONFIRMED", {
    payment: { id: payment.id, subscription: sub },
  });
  await admin.query(
    "update drivevision.accounts set disabled_at=now() where id=$1",
    [a.id],
  );
  await event("PAYMENT_RECEIVED", {
    payment: { id: payment.id, subscription: sub },
  });
  assert.equal(
    (await req("/api/session", undefined, a.cookie)).data.user,
    null,
  );
  assert.ok(
    (
      await admin.query(
        "select disabled_at from drivevision.accounts where id=$1",
        [a.id],
      )
    ).rows[0].disabled_at,
  );
  await admin.query(
    "update drivevision.accounts set disabled_at=null where id=$1",
    [a.id],
  );
  pass("payment confirmation cannot undo an administrative suspension");
  const canceled = await req("/api/billing/cancel", {}, a.cookie);
  assert.equal(canceled.status, 200, JSON.stringify(canceled.data));
  assert.equal(subs.has(sub), false);
  const after = (await req("/api/billing", undefined, a.cookie)).data;
  assert.equal(after.canceled, true);
  assert.equal(after.access, true);
  pass(
    "canceling renewal removes remote subscription but preserves the paid period",
  );
  await admin.query(
    "update drivevision.billing_accounts set paid_until=now()-interval '1 second' where owner_id=$1",
    [a.id],
  );
  assert.equal(
    (await req("/api/session", undefined, a.cookie)).data.user.access,
    false,
  );
  assert.equal((await req("/api/workspace", undefined, a.cookie)).status, 402);
  await transaction(
    a.id,
    async (c) =>
      assert.equal(
        (
          await c.query(
            "select id from drivevision.workspaces where owner_id=$1",
            [a.id],
          )
        ).rowCount,
        0,
      ),
    { allowUnpaid: true },
  );
  pass(
    "expired subscriptions keep billing access while API and database deny workspace access",
  );
  unknown = true;
  assert.equal((await req("/api/billing/checkout", {}, b.cookie)).status, 502);
  const before = creates;
  assert.equal((await req("/api/billing/checkout", {}, b.cookie)).status, 409);
  assert.equal(creates, before);
  const recovered = [...checkouts.values()].at(-1);
  await event("CHECKOUT_CREATED", {
    checkout: {
      id: recovered.id,
      externalReference: recovered.externalReference,
    },
  });
  assert.ok(
    (await req("/api/billing", undefined, b.cookie)).data.checkoutUrl?.includes(
      recovered.id,
    ),
  );
  pass(
    "unknown checkout outcome is durable, cannot duplicate and recovers through authenticated events",
  );
  const t = await account(true);
  assert.equal((await req("/api/billing/checkout", {}, t.cookie)).status, 400);
  assert.equal(
    (await req("/api/billing/checkout", { acceptedTrial: true }, t.cookie))
      .status,
    200,
  );
  const tc = [...checkouts.values()].at(-1),
    ts = "sub-trial-" + run;
  const td = tc.subscription.nextDueDate;
  assert.ok(new Date(td + "T12:00:00Z") > new Date(Date.now() + 6 * 86400000));
  subs.set(ts, {
    id: ts,
    value: 59.9,
    cycle: "MONTHLY",
    customer: "customer-trial-" + run,
    status: "ACTIVE",
    billingType: "CREDIT_CARD",
    checkoutSession: "wrong-checkout",
    nextDueDate: td,
  });
  const tp = {
    id: "pay-trial-" + run,
    value: 59.9,
    status: "PENDING",
    dueDate: td,
    subscription: ts,
    checkoutSession: tc.id,
    customer: "customer-trial-" + run,
  };
  payments.push(tp);
  await req("/api/billing/sync", {}, t.cookie);
  assert.equal(
    (await req("/api/billing", undefined, t.cookie)).data.access,
    false,
  );
  subs.get(ts).checkoutSession = tc.id;
  await req("/api/billing/sync", {}, t.cookie);
  const activeTrial = (await req("/api/billing", undefined, t.cookie)).data;
  assert.equal(activeTrial.state, "trialing");
  assert.equal(activeTrial.access, true);
  assert.equal(activeTrial.trialEligible, false);
  assert.equal(activeTrial.paidUntil, null);
  assert.equal((await req("/api/workspace", undefined, t.cookie)).status, 200);
  await req("/api/billing/sync", {}, t.cookie);
  assert.equal(
    (await req("/api/billing", undefined, t.cookie)).data.trialEndsAt,
    activeTrial.trialEndsAt,
  );
  assert.equal(
    (await req("/api/billing/checkout", { acceptedTrial: true }, t.cookie))
      .status,
    409,
  );
  pass(
    "trial requires recurring consent and authoritative card checkout subscription; replay cannot extend trial",
  );
  await req("/api/billing/cancel", {}, t.cookie);
  const stopped = (await req("/api/billing", undefined, t.cookie)).data;
  assert.equal(stopped.canceled, true);
  assert.equal(stopped.access, true);
  assert.equal(subs.has(ts), false);
  await admin.query(
    "update drivevision.billing_accounts set trial_ends_at=now()-interval '5 minutes' where owner_id=$1",
    [t.id],
  );
  assert.equal((await req("/api/workspace", undefined, t.cookie)).status, 402);
  await transaction(
    t.id,
    async (c) =>
      assert.equal(
        (
          await c.query(
            "select id from drivevision.workspaces where owner_id=$1",
            [t.id],
          )
        ).rowCount,
        0,
      ),
    { allowUnpaid: true },
  );
  assert.equal((await req("/api/support", undefined, t.cookie)).status, 200);
  const repeat = await req("/api/billing/checkout", {}, t.cookie);
  assert.equal(repeat.status, 200, JSON.stringify(repeat.data));
  assert.equal([...checkouts.values()].at(-1).subscription.nextDueDate, today);
  pass(
    "trial cancellation preserves remaining days, expiry blocks RLS but retains support, repeat subscription has no free trial",
  );
  console.log(
    `${checks} billing checks passed; no real payment was attempted.`,
  );
} finally {
  pool.query = originalQuery;
  globalThis.fetch = realFetch;
  await admin.query(
    "delete from drivevision.billing_events where id=any($1::text[])",
    [events],
  );
  await admin.query(
    "delete from drivevision.sessions where user_id=any($1::uuid[])",
    [owners],
  );
  await admin.query(
    "delete from drivevision.workspaces where owner_id=any($1::uuid[])",
    [owners],
  );
  await admin.query(
    "delete from drivevision.accounts where id=any($1::uuid[])",
    [owners],
  );
  await admin.end();
  await closeDatabase();
  await new Promise((r) => server.close(r));
}
