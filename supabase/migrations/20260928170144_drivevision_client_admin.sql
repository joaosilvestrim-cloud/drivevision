-- Private SaaS administration. No changes to public or other applications.
create table drivevision.platform_admins (
  account_id uuid primary key references drivevision.accounts(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table drivevision.clients (
  id uuid primary key,
  owner_id uuid not null unique references drivevision.accounts(id) on delete cascade,
  name text not null check(length(name) between 2 and 120),
  plan text not null default 'Manual' check(length(plan) between 1 and 80),
  revision integer not null default 0 check(revision>=0),
  billing_provider text,
  billing_customer_id text,
  billing_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index clients_billing_customer_idx on drivevision.clients(billing_provider,billing_customer_id);
create unique index clients_billing_subscription_idx on drivevision.clients(billing_provider,billing_subscription_id);
create index clients_created_idx on drivevision.clients(created_at desc,id);
create table drivevision.admin_audit (
  id uuid primary key,
  actor_id uuid references drivevision.accounts(id) on delete set null,
  client_id uuid not null references drivevision.clients(id) on delete cascade,
  action text not null,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index admin_audit_client_idx on drivevision.admin_audit(client_id,created_at desc);
create index admin_audit_actor_idx on drivevision.admin_audit(actor_id);
revoke all on drivevision.platform_admins,drivevision.clients,drivevision.admin_audit from public,anon,authenticated;
grant select on drivevision.platform_admins to drivevision_app;
grant select,insert on drivevision.clients to drivevision_app;
grant update(name,plan,revision,updated_at) on drivevision.clients to drivevision_app;
grant select,insert on drivevision.admin_audit to drivevision_app;
grant update(disabled_at) on drivevision.accounts to drivevision_app;
alter table drivevision.platform_admins enable row level security;
alter table drivevision.platform_admins force row level security;
alter table drivevision.clients enable row level security;
alter table drivevision.clients force row level security;
alter table drivevision.admin_audit enable row level security;
alter table drivevision.admin_audit force row level security;
create policy own_admin_role on drivevision.platform_admins for select to drivevision_app
  using(true); -- Registry is server-only; authorization always matches the acting account.
create policy client_read on drivevision.clients for select to drivevision_app
  using(owner_id=nullif(current_setting('drivevision.user_id',true),'')::uuid or exists(select 1 from drivevision.platform_admins where account_id=nullif(current_setting('drivevision.user_id',true),'')::uuid));
create policy client_insert on drivevision.clients for insert to drivevision_app
  with check(owner_id=nullif(current_setting('drivevision.user_id',true),'')::uuid or exists(select 1 from drivevision.platform_admins where account_id=nullif(current_setting('drivevision.user_id',true),'')::uuid));
create policy client_update on drivevision.clients for update to drivevision_app
  using(exists(select 1 from drivevision.platform_admins where account_id=nullif(current_setting('drivevision.user_id',true),'')::uuid)) with check(exists(select 1 from drivevision.platform_admins where account_id=nullif(current_setting('drivevision.user_id',true),'')::uuid));
create policy audit_read on drivevision.admin_audit for select to drivevision_app
  using(exists(select 1 from drivevision.platform_admins where account_id=nullif(current_setting('drivevision.user_id',true),'')::uuid));
create policy audit_insert on drivevision.admin_audit for insert to drivevision_app
  with check(actor_id=nullif(current_setting('drivevision.user_id',true),'')::uuid and exists(select 1 from drivevision.platform_admins where account_id=nullif(current_setting('drivevision.user_id',true),'')::uuid));
insert into drivevision.clients(id,owner_id,name) select id,id,name from drivevision.accounts;
-- Invoker rights: account creation, including existing registration/CLI, is atomic.
create function drivevision.provision_client() returns trigger language plpgsql
  security invoker set search_path='' as $$
begin
  insert into drivevision.clients(id,owner_id,name) values(new.id,new.id,new.name);
  return new;
end;
$$;
revoke all on function drivevision.provision_client() from public,anon,authenticated;
create trigger account_client after insert on drivevision.accounts for each row execute function drivevision.provision_client();
-- Suspended customers cannot read or mutate their workspace even through the runtime role.
create policy active_workspace on drivevision.workspaces as restrictive to drivevision_app
  using(exists(select 1 from drivevision.accounts a where a.id=owner_id and a.disabled_at is null))
  with check(exists(select 1 from drivevision.accounts a where a.id=owner_id and a.disabled_at is null));
insert into drivevision.schema_migrations(version) values('20260928170144');
