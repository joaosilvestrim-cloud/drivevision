-- Private support desk. Public submissions are inserted by the server only.
create table drivevision.support_tickets (
 id uuid primary key, request_id uuid unique not null,
 owner_id uuid references drivevision.accounts(id) on delete set null,
 name text not null, email text not null, company text not null default '', phone text not null default '',
 category text not null check(category in ('comercial','acesso','assinatura','dados','graficos','conexoes','sugestao','outro')),
 priority text not null check(priority in ('normal','alta')), subject text not null, description text not null,
 steps text not null default '', expected text not null default '', page text not null default '',
 status text not null default 'open' check(status in ('open','progress','waiting','resolved')),
 revision integer not null default 0, consent_at timestamptz not null default now(),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index support_tickets_owner on drivevision.support_tickets(owner_id,created_at desc);
create index support_tickets_status on drivevision.support_tickets(status,created_at desc);
create table drivevision.support_messages (
 id uuid primary key, ticket_id uuid not null references drivevision.support_tickets(id) on delete cascade,
 author_id uuid not null references drivevision.accounts(id), staff boolean not null,
 body text not null, created_at timestamptz not null default now()
);
create index support_messages_ticket on drivevision.support_messages(ticket_id,created_at);
alter table drivevision.support_tickets enable row level security;
alter table drivevision.support_tickets force row level security;
alter table drivevision.support_messages enable row level security;
alter table drivevision.support_messages force row level security;
create policy support_read on drivevision.support_tickets for select to drivevision_app using (
 owner_id=nullif(current_setting('drivevision.user_id',true),'')::uuid or exists(select 1 from drivevision.platform_admins where account_id=nullif(current_setting('drivevision.user_id',true),'')::uuid)
);
create policy support_insert on drivevision.support_tickets for insert to drivevision_app with check (
 owner_id is not distinct from nullif(current_setting('drivevision.user_id',true),'')::uuid
);
create policy support_update on drivevision.support_tickets for update to drivevision_app using (
 owner_id=nullif(current_setting('drivevision.user_id',true),'')::uuid or exists(select 1 from drivevision.platform_admins where account_id=nullif(current_setting('drivevision.user_id',true),'')::uuid)
);
create policy support_messages_read on drivevision.support_messages for select to drivevision_app using(exists(select 1 from drivevision.support_tickets where id=ticket_id));
create policy support_messages_insert on drivevision.support_messages for insert to drivevision_app with check(
 author_id=nullif(current_setting('drivevision.user_id',true),'')::uuid and exists(select 1 from drivevision.support_tickets where id=ticket_id)
 and (not staff or exists(select 1 from drivevision.platform_admins where account_id=author_id))
);
revoke all on drivevision.support_tickets,drivevision.support_messages from public,anon,authenticated;
grant select,insert,update on drivevision.support_tickets to drivevision_app;
grant select,insert on drivevision.support_messages to drivevision_app;
-- Notifications for visitors do not require an account or create a customer.
alter table drivevision.email_outbox alter column owner_id drop not null;
alter table drivevision.billing_accounts add column trial_eligible boolean not null default false,
 add column trial_started_at timestamptz, add column trial_ends_at timestamptz;
alter table drivevision.billing_checkouts add column trial_due_date date;
alter table drivevision.billing_queue add column trial_ends_at timestamptz;
create or replace function drivevision.billing_dispatch() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_table_name='billing_accounts' then
  insert into drivevision.billing_queue(owner_id,subscription_id,paid_until,trial_ends_at,next_reconcile_at) values(new.owner_id,new.subscription_id,new.paid_until,new.trial_ends_at,new.next_reconcile_at)
  on conflict(owner_id) do update set subscription_id=excluded.subscription_id,paid_until=excluded.paid_until,trial_ends_at=excluded.trial_ends_at,next_reconcile_at=excluded.next_reconcile_at;
 else
  insert into drivevision.checkout_queue(id,owner_id,provider_id) values(new.id,new.owner_id,new.provider_id)
  on conflict(id) do update set provider_id=excluded.provider_id;
 end if;
 return new;
end;
$$;
alter policy paid_workspace on drivevision.workspaces
 using(not exists(select 1 from drivevision.billing_accounts b where b.owner_id=workspaces.owner_id and coalesce(greatest(b.paid_until,b.trial_ends_at),'-infinity'::timestamptz)<=now()))
 with check(not exists(select 1 from drivevision.billing_accounts b where b.owner_id=workspaces.owner_id and coalesce(greatest(b.paid_until,b.trial_ends_at),'-infinity'::timestamptz)<=now()));
insert into drivevision.schema_migrations(version) values('20260930235537');
