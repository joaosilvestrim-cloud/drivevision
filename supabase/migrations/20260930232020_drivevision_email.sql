alter table drivevision.accounts add column email_verified_at timestamptz default now();
create table drivevision.email_tokens (
  token_hash text primary key, owner_id uuid not null references drivevision.accounts(id) on delete cascade,
  purpose text not null check(purpose in ('verify','reset')), expires_at timestamptz not null,
  used_at timestamptz, created_at timestamptz not null default now()
);
create index email_tokens_owner on drivevision.email_tokens(owner_id,purpose);
create table drivevision.email_outbox (
  id uuid primary key, owner_id uuid not null references drivevision.accounts(id) on delete cascade,
  dedupe_key text unique not null, kind text not null, encrypted_payload text,
  state text not null default 'pending' check(state in ('pending','sending','sent','failed')),
  provider_id text, attempts integer not null default 0, last_error text,
  retry_at timestamptz not null default now(), expires_at timestamptz not null,
  created_at timestamptz not null default now(), sent_at timestamptz
);
create index email_outbox_due on drivevision.email_outbox(retry_at) where state in ('pending','sending');
create index email_outbox_owner on drivevision.email_outbox(owner_id,created_at desc);
alter table drivevision.email_tokens enable row level security;
alter table drivevision.email_tokens force row level security;
alter table drivevision.email_outbox enable row level security;
alter table drivevision.email_outbox force row level security;
-- Private authentication infrastructure. No direct browser/Supabase Data API access.
create policy email_tokens_server on drivevision.email_tokens to drivevision_app using(true) with check(true);
create policy email_outbox_server on drivevision.email_outbox to drivevision_app using(true) with check(true);
revoke all on drivevision.email_tokens,drivevision.email_outbox from public,anon,authenticated;
grant select,insert,update,delete on drivevision.email_tokens,drivevision.email_outbox to drivevision_app;
insert into drivevision.schema_migrations(version) values('20260930232020');
