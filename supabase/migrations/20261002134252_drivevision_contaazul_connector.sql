-- Private DriveVision tables only. No changes to DriveAzul or other applications.
alter table drivevision.cloud_connections drop constraint cloud_connections_provider_check;
alter table drivevision.cloud_connections add constraint cloud_connections_provider_check check(provider in ('onedrive','sharepoint','google','omie','contaazul'));
create table drivevision.contaazul_jobs (
 binding_id uuid primary key references drivevision.cloud_bindings(id) on delete cascade,
 owner_id uuid not null references drivevision.accounts(id) on delete cascade,
 payload text not null, completed integer not null, total integer not null, rows_count integer not null,
 updated_at timestamptz not null default now()
);
create index contaazul_jobs_owner on drivevision.contaazul_jobs(owner_id);
alter table drivevision.contaazul_jobs enable row level security;
alter table drivevision.contaazul_jobs force row level security;
create policy owner_access on drivevision.contaazul_jobs to drivevision_app
 using(owner_id=nullif(current_setting('drivevision.user_id',true),'')::uuid)
 with check(owner_id=nullif(current_setting('drivevision.user_id',true),'')::uuid);
revoke all on drivevision.contaazul_jobs from public,anon,authenticated;
grant select,insert,update,delete on drivevision.contaazul_jobs to drivevision_app;
insert into drivevision.schema_migrations(version) values('20261002134252');
