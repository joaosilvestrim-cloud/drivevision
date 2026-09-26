-- Additive migration: private DriveVision schema only.
create table drivevision.cloud_connections (
  id uuid primary key, owner_id uuid not null references drivevision.accounts(id) on delete cascade,
  provider text not null check(provider in ('onedrive','sharepoint','google')),
  label text not null, tokens text not null, expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index cloud_connections_owner on drivevision.cloud_connections(owner_id);
create table drivevision.cloud_oauth_states (
  hash text primary key, owner_id uuid not null references drivevision.accounts(id) on delete cascade,
  provider text not null, verifier text not null, redirect_uri text not null,
  session_hash text not null, expires_at timestamptz not null
);
create index cloud_states_owner on drivevision.cloud_oauth_states(owner_id);
create table drivevision.cloud_bindings (
  id uuid primary key, owner_id uuid not null references drivevision.accounts(id) on delete cascade,
  connection_id uuid not null references drivevision.cloud_connections(id) on delete cascade,
  source_id text not null, name text not null, target jsonb not null, options jsonb not null,
  interval_minutes integer not null check(interval_minutes in(15,60,360,1440)),
  paused boolean not null default false, fingerprint text, columns jsonb,
  last_success_at timestamptz, last_checked_at timestamptz, last_error text,
  created_at timestamptz not null default now(), unique(owner_id,source_id)
);
create index cloud_bindings_owner on drivevision.cloud_bindings(owner_id);
create index cloud_bindings_connection on drivevision.cloud_bindings(connection_id);
create table drivevision.cloud_runs (
  id uuid primary key, binding_id uuid not null references drivevision.cloud_bindings(id) on delete cascade,
  owner_id uuid not null references drivevision.accounts(id) on delete cascade,
  status text not null, message text not null, rows_count integer, created_at timestamptz not null default now()
);
create index cloud_runs_binding on drivevision.cloud_runs(binding_id,created_at desc);
create index cloud_runs_owner on drivevision.cloud_runs(owner_id);
-- Private scheduler metadata contains no OAuth credentials or file data.
create table drivevision.cloud_schedule (
  binding_id uuid primary key references drivevision.cloud_bindings(id) on delete cascade,
  owner_id uuid not null references drivevision.accounts(id) on delete cascade,
  due_at timestamptz not null default now(), lease_until timestamptz, lease_token uuid
);
create index cloud_schedule_due on drivevision.cloud_schedule(due_at);
do $$ declare t text; begin
  foreach t in array array['cloud_connections','cloud_oauth_states','cloud_bindings','cloud_runs'] loop
    execute format('alter table drivevision.%I enable row level security',t);
    execute format('alter table drivevision.%I force row level security',t);
    execute format('create policy owner_access on drivevision.%I to drivevision_app using (owner_id=nullif(current_setting(''drivevision.user_id'',true),'''')::uuid) with check (owner_id=nullif(current_setting(''drivevision.user_id'',true),'''')::uuid)',t);
  end loop;
end $$;
alter table drivevision.cloud_schedule enable row level security;
alter table drivevision.cloud_schedule force row level security;
create policy server_schedule on drivevision.cloud_schedule to drivevision_app using(true) with check(true);
revoke all on drivevision.cloud_connections,drivevision.cloud_oauth_states,drivevision.cloud_bindings,drivevision.cloud_runs,drivevision.cloud_schedule from public,anon,authenticated;
grant select,insert,update,delete on drivevision.cloud_connections,drivevision.cloud_oauth_states,drivevision.cloud_bindings,drivevision.cloud_runs,drivevision.cloud_schedule to drivevision_app;
insert into drivevision.schema_migrations(version) values('20260926133929');
