-- Additive, private DriveVision schema only. No changes to public or other applications.
create table drivevision.source_versions (
  id uuid primary key,
  sequence bigint generated always as identity,
  workspace_id uuid not null,
  source_id text not null,
  payload bytea not null,
  bytes integer not null check(bytes=octet_length(payload) and bytes>0),
  metadata jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  foreign key(workspace_id,source_id) references drivevision.sources(workspace_id,id) on delete cascade
);
create index source_versions_lookup on drivevision.source_versions(workspace_id,source_id,created_at desc,sequence desc);
alter table drivevision.source_versions enable row level security;
alter table drivevision.source_versions force row level security;
revoke all on drivevision.source_versions from public,anon,authenticated;
grant select,insert,delete on drivevision.source_versions to drivevision_app;
grant usage on sequence drivevision.source_versions_sequence_seq to drivevision_app;
create policy own_source_versions on drivevision.source_versions to drivevision_app
using (exists(select 1 from drivevision.workspaces w where w.id=workspace_id and w.owner_id=(select nullif(current_setting('drivevision.user_id',true),'')::uuid)))
with check (exists(select 1 from drivevision.workspaces w where w.id=workspace_id and w.owner_id=(select nullif(current_setting('drivevision.user_id',true),'')::uuid)));
insert into drivevision.schema_migrations(version) values('20260928143942');
