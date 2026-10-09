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
  if (
    !(
      await client.query(
        "select 1 from drivevision.schema_migrations where version='20261009192127'",
      )
    ).rowCount
  )
    await client.query(
      readFileSync(
        new URL(
          "../supabase/migrations/20261009192127_drivevision_protheus_connector.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
  await client.query("commit");
  const check = await client.query(
    "select relrowsecurity,relforcerowsecurity from pg_class where oid='drivevision.cloud_connections'::regclass",
  );
  if (!check.rows[0]?.relrowsecurity || !check.rows[0]?.relforcerowsecurity)
    throw new Error("Owner RLS must remain enabled");
  console.log(
    "Protheus schema ready; existing DriveVision ownership RLS remains forced.",
  );
} catch (e) {
  await client.query("rollback").catch(() => {});
  console.error("Protheus migration failed:", e.code || "CHECK_FAILED");
  process.exitCode = 1;
} finally {
  await client.end();
}
