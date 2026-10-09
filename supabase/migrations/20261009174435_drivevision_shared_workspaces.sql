-- Memberships are created only by platform administrators; existing tenants are unchanged.
create table drivevision.workspace_members (
  account_id uuid primary key references drivevision.accounts(id) on delete cascade,
  workspace_owner_id uuid not null references drivevision.accounts(id) on delete cascade,
  granted_by uuid references drivevision.accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  check(account_id <> workspace_owner_id)
);
create index workspace_members_owner on drivevision.workspace_members(workspace_owner_id);
revoke all on drivevision.workspace_members from public,anon,authenticated;
grant select,insert on drivevision.workspace_members to drivevision_app;
alter table drivevision.workspace_members enable row level security;
alter table drivevision.workspace_members force row level security;
create policy membership_read on drivevision.workspace_members for select to drivevision_app
  using(account_id=nullif(current_setting('drivevision.user_id',true),'')::uuid
    or exists(select 1 from drivevision.platform_admins p where p.account_id=nullif(current_setting('drivevision.user_id',true),'')::uuid));
create policy membership_create on drivevision.workspace_members for insert to drivevision_app
  with check(granted_by=nullif(current_setting('drivevision.user_id',true),'')::uuid
    and exists(select 1 from drivevision.platform_admins p where p.account_id=nullif(current_setting('drivevision.user_id',true),'')::uuid));
insert into drivevision.schema_migrations(version) values('20261009174435');
