-- Additive changes only to DriveVision; existing ownership RLS remains in force.
alter table drivevision.cloud_connections drop constraint cloud_connections_provider_check;
alter table drivevision.cloud_connections add constraint cloud_connections_provider_check check(provider in ('onedrive','sharepoint','google','omie'));
alter table drivevision.cloud_connections add column credential_ref text;
alter table drivevision.cloud_connections add column api_cache text;
alter table drivevision.cloud_connections add column cache_key text;
alter table drivevision.cloud_connections add column cache_until timestamptz;
create unique index cloud_connections_credential on drivevision.cloud_connections(owner_id,provider,credential_ref) where credential_ref is not null;
insert into drivevision.schema_migrations(version) values('20261002123122');
