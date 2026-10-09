import { Client } from 'pg';
import { readFileSync } from 'node:fs';
import { connectionOptions } from '../server/database.ts';
process.loadEnvFile('.env.local');
const c = new Client(connectionOptions(true));
try {
  await c.connect();
  await c.query('begin');
  await c.query("set local lock_timeout='5s'");
  await c.query("select pg_advisory_xact_lock(hashtext('drivevision.shared_workspaces_setup'))");
  if (!(await c.query("select 1 from drivevision.schema_migrations where version='20261009174435'")).rowCount)
    await c.query(readFileSync(new URL('../supabase/migrations/20261009174435_drivevision_shared_workspaces.sql',import.meta.url),'utf8'));
  const check = (await c.query("select has_table_privilege('anon','drivevision.workspace_members','SELECT') exposed,has_table_privilege('drivevision_app','drivevision.workspace_members','UPDATE') mutable")).rows[0];
  if (check.exposed || check.mutable) throw new Error('Unexpected membership privileges');
  await c.query('commit');
  console.log('Shared workspace migration applied and private privileges verified.');
} catch(e) {
  await c.query('rollback').catch(()=>{});
  console.error('Shared workspace setup failed:',e.code || e.message); process.exitCode=1;
} finally { await c.end(); }
