import { Client } from "pg";
import { readFileSync } from "node:fs";
import { connectionOptions } from "../server/database.ts";
process.loadEnvFile(".env.local");
const client = new Client(connectionOptions(true));
try {
  await client.connect();
  await client.query("begin");
  await client.query("set local lock_timeout='5s'");
  await client.query(
    "select pg_advisory_xact_lock(hashtext('drivevision.connectors_setup'))",
  );
  const exists = await client.query(
    "select 1 from drivevision.schema_migrations where version='20260926133929'",
  );
  if (!exists.rowCount)
    await client.query(
      readFileSync(
        new URL(
          "../supabase/migrations/20260926133929_drivevision_remote_sources.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
  await client.query("commit");
  console.log("Private cloud connector tables and owner RLS ready.");
} catch (e) {
  await client.query("rollback").catch(() => {});
  console.error("Connector setup failed:", e.code || e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
