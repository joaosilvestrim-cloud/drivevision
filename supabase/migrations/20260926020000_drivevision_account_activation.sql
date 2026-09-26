-- Only the DriveVision server can replace a pending credential after a one-use activation.
-- No access is granted to browser roles or to other applications.
grant update(password_hash) on drivevision.accounts to drivevision_app;
insert into drivevision.schema_migrations(version) values ('20260926020000');
