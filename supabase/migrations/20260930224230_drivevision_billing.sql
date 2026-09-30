-- Existing manually provisioned clients keep their access; self-service buyers require payment.
create table drivevision.platform_settings (
  key text primary key,
  encrypted_value text not null,
  updated_at timestamptz not null default now()
);
create table drivevision.billing_accounts (
  owner_id uuid primary key references drivevision.accounts(id) on delete cascade,
  subscription_id text unique,
  customer_id text,
  paid_until timestamptz,
  canceled boolean not null default false,
  state text not null default 'pending',
  terms_version text not null,
  terms_accepted_at timestamptz not null default now(),
  next_reconcile_at timestamptz not null default now(),
  last_reconciled_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
create index billing_due_idx on drivevision.billing_accounts(next_reconcile_at);
create table drivevision.billing_checkouts (
  id uuid primary key,
  owner_id uuid not null references drivevision.billing_accounts(owner_id) on delete cascade,
  provider_id text unique,
  url text,
  state text not null default 'creating',
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index billing_checkout_owner_idx on drivevision.billing_checkouts(owner_id,created_at desc);
create table drivevision.billing_payments (
  id text primary key,
  owner_id uuid not null references drivevision.billing_accounts(owner_id) on delete cascade,
  subscription_id text not null,
  status text not null,
  amount_cents integer not null,
  due_date date not null,
  period_end timestamptz not null,
  invoice_url text,
  updated_at timestamptz not null default now()
);
create index billing_payment_owner_idx on drivevision.billing_payments(owner_id,period_end desc);
create table drivevision.billing_events (
  id text primary key,
  kind text not null,
  resource_id text,
  checkout_reference text,
  subscription_id text,
  status text not null default 'pending',
  attempts integer not null default 0,
  retry_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index billing_event_queue_idx on drivevision.billing_events(status,retry_at);
revoke all on drivevision.platform_settings,drivevision.billing_accounts,drivevision.billing_checkouts,drivevision.billing_payments,drivevision.billing_events from public,anon,authenticated;
grant select,insert,update on drivevision.platform_settings,drivevision.billing_accounts,drivevision.billing_checkouts,drivevision.billing_payments,drivevision.billing_events to drivevision_app;
alter table drivevision.platform_settings enable row level security;
alter table drivevision.platform_settings force row level security;
create policy billing_settings_read on drivevision.platform_settings for select to drivevision_app using(true);
create policy billing_settings_insert on drivevision.platform_settings for insert to drivevision_app with check(exists(select 1 from drivevision.platform_admins where account_id=nullif(current_setting('drivevision.user_id',true),'')::uuid));
create policy billing_settings_update on drivevision.platform_settings for update to drivevision_app using(exists(select 1 from drivevision.platform_admins where account_id=nullif(current_setting('drivevision.user_id',true),'')::uuid)) with check(exists(select 1 from drivevision.platform_admins where account_id=nullif(current_setting('drivevision.user_id',true),'')::uuid));
-- The event inbox is server-only and accepts only authenticated Asaas notifications.
alter table drivevision.billing_events enable row level security;
alter table drivevision.billing_events force row level security;
create policy server_billing_events on drivevision.billing_events to drivevision_app using(true) with check(true);
-- Background workers use the same explicit owner context as the interactive API.
do $$ declare t text; begin
  foreach t in array array['billing_accounts','billing_checkouts','billing_payments'] loop
    execute format('alter table drivevision.%I enable row level security',t);
    execute format('alter table drivevision.%I force row level security',t);
    execute format('create policy owner_billing on drivevision.%I to drivevision_app using(owner_id=nullif(current_setting(''drivevision.user_id'',true),'''')::uuid) with check(owner_id=nullif(current_setting(''drivevision.user_id'',true),'''')::uuid)',t);
  end loop;
end $$;
create policy admin_billing_read on drivevision.billing_accounts for select to drivevision_app using(exists(select 1 from drivevision.platform_admins where account_id=nullif(current_setting('drivevision.user_id',true),'')::uuid));
-- Minimal private dispatch tables never contain payment credentials.
create table drivevision.billing_queue(owner_id uuid primary key references drivevision.billing_accounts(owner_id) on delete cascade,subscription_id text,paid_until timestamptz,next_reconcile_at timestamptz not null);
create table drivevision.checkout_queue(id uuid primary key references drivevision.billing_checkouts(id) on delete cascade,owner_id uuid not null,provider_id text);
create index billing_queue_due_idx on drivevision.billing_queue(next_reconcile_at);
create index billing_queue_subscription_idx on drivevision.billing_queue(subscription_id);
create index checkout_queue_provider_idx on drivevision.checkout_queue(provider_id);
revoke all on drivevision.billing_queue,drivevision.checkout_queue from public,anon,authenticated;
grant select,insert,update on drivevision.billing_queue,drivevision.checkout_queue to drivevision_app;
alter table drivevision.billing_queue enable row level security;
alter table drivevision.billing_queue force row level security;
alter table drivevision.checkout_queue enable row level security;
alter table drivevision.checkout_queue force row level security;
create policy server_billing_queue on drivevision.billing_queue to drivevision_app using(true) with check(true);
create policy server_checkout_queue on drivevision.checkout_queue to drivevision_app using(true) with check(true);
create function drivevision.billing_dispatch() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_table_name='billing_accounts' then
    insert into drivevision.billing_queue(owner_id,subscription_id,paid_until,next_reconcile_at) values(new.owner_id,new.subscription_id,new.paid_until,new.next_reconcile_at)
    on conflict(owner_id) do update set subscription_id=excluded.subscription_id,paid_until=excluded.paid_until,next_reconcile_at=excluded.next_reconcile_at;
  else
    insert into drivevision.checkout_queue(id,owner_id,provider_id) values(new.id,new.owner_id,new.provider_id)
    on conflict(id) do update set provider_id=excluded.provider_id;
  end if;
  return new;
end;
$$;
revoke all on function drivevision.billing_dispatch() from public,anon,authenticated;
create trigger billing_dispatch after insert or update on drivevision.billing_accounts for each row execute function drivevision.billing_dispatch();
create trigger checkout_dispatch after insert or update on drivevision.billing_checkouts for each row execute function drivevision.billing_dispatch();
create policy paid_workspace on drivevision.workspaces as restrictive to drivevision_app
  using(not exists(select 1 from drivevision.billing_accounts b where b.owner_id=workspaces.owner_id and (b.paid_until is null or b.paid_until<=now())))
  with check(not exists(select 1 from drivevision.billing_accounts b where b.owner_id=workspaces.owner_id and (b.paid_until is null or b.paid_until<=now())));
insert into drivevision.schema_migrations(version) values('20260930224230');
