-- DriveVision owns only this schema. Do not run a project-wide reset or db push.
create schema drivevision;
revoke all on schema drivevision from public, anon, authenticated;
grant usage on schema drivevision to drivevision_app;

create table drivevision.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
create table drivevision.accounts (
  id uuid primary key,
  email text not null unique check (email=lower(email) and length(email)<=254),
  name text not null check (length(name) between 2 and 100),
  password_hash text not null,
  created_at timestamptz not null default now(),
  disabled_at timestamptz
);
create table drivevision.sessions (
  token_hash text primary key check (length(token_hash)=64),
  user_id uuid not null references drivevision.accounts(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index sessions_user_idx on drivevision.sessions(user_id);
create index sessions_expiry_idx on drivevision.sessions(expires_at);
create table drivevision.workspaces (
  id uuid primary key,
  owner_id uuid not null unique references drivevision.accounts(id),
  name text not null,
  revision bigint not null default 0 check (revision>=0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table drivevision.sources (
  workspace_id uuid not null references drivevision.workspaces(id) on delete cascade,
  id text not null,
  position integer not null default 0,
  payload jsonb not null check (jsonb_typeof(payload)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id,id)
);
create table drivevision.dashboards (
  workspace_id uuid not null references drivevision.workspaces(id) on delete cascade,
  id text not null,
  position integer not null default 0,
  payload jsonb not null check (jsonb_typeof(payload)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id,id)
);
create table drivevision.rate_limits (
  bucket text primary key,
  attempts integer not null,
  expires_at timestamptz not null
);
create index rate_limits_expiry_idx on drivevision.rate_limits(expires_at);

revoke all on all tables in schema drivevision from public, anon, authenticated;
grant select,insert on drivevision.accounts to drivevision_app;
grant select,insert,delete on drivevision.sessions to drivevision_app;
grant select,insert,update on drivevision.workspaces to drivevision_app;
grant select,insert,update,delete on drivevision.sources,drivevision.dashboards,drivevision.rate_limits to drivevision_app;

alter table drivevision.accounts enable row level security;
alter table drivevision.accounts force row level security;
alter table drivevision.sessions enable row level security;
alter table drivevision.sessions force row level security;
alter table drivevision.workspaces enable row level security;
alter table drivevision.workspaces force row level security;
alter table drivevision.sources enable row level security;
alter table drivevision.sources force row level security;
alter table drivevision.dashboards enable row level security;
alter table drivevision.dashboards force row level security;
alter table drivevision.rate_limits enable row level security;
alter table drivevision.rate_limits force row level security;
alter table drivevision.schema_migrations enable row level security;

-- Authentication tables are private to the server role, never exposed to browser roles.
create policy server_accounts on drivevision.accounts to drivevision_app using (true) with check (true);
create policy server_sessions on drivevision.sessions to drivevision_app using (true) with check (true);
create policy server_rate_limits on drivevision.rate_limits to drivevision_app using (true) with check (true);
create policy own_workspace on drivevision.workspaces to drivevision_app
  using (owner_id=nullif(current_setting('drivevision.user_id',true),'')::uuid)
  with check (owner_id=nullif(current_setting('drivevision.user_id',true),'')::uuid);
create policy own_sources on drivevision.sources to drivevision_app
  using (exists(select 1 from drivevision.workspaces w where w.id=workspace_id and w.owner_id=nullif(current_setting('drivevision.user_id',true),'')::uuid))
  with check (exists(select 1 from drivevision.workspaces w where w.id=workspace_id and w.owner_id=nullif(current_setting('drivevision.user_id',true),'')::uuid));
create policy own_dashboards on drivevision.dashboards to drivevision_app
  using (exists(select 1 from drivevision.workspaces w where w.id=workspace_id and w.owner_id=nullif(current_setting('drivevision.user_id',true),'')::uuid))
  with check (exists(select 1 from drivevision.workspaces w where w.id=workspace_id and w.owner_id=nullif(current_setting('drivevision.user_id',true),'')::uuid));
insert into drivevision.schema_migrations(version) values ('20260926002314');
