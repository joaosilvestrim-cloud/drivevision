-- Extend only the private DriveVision provider registry. RLS and other apps are unchanged.
alter table drivevision.cloud_connections drop constraint cloud_connections_provider_check;
alter table drivevision.cloud_connections add constraint cloud_connections_provider_check check(provider in ('onedrive','sharepoint','google','omie','contaazul','protheus'));
insert into drivevision.schema_migrations(version) values('20261009192127');
