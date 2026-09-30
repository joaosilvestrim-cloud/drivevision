import { Client } from "pg";
import { readFileSync } from "node:fs";
import { connectionOptions } from "../server/database.ts";
process.loadEnvFile(".env.local");
const c = new Client(connectionOptions(true));
try {
  await c.connect();
  await c.query("begin");
  await c.query("set local lock_timeout='5s'");
  await c.query(
    "select pg_advisory_xact_lock(hashtext('drivevision.billing_setup'))",
  );
  const version = "20260930224230";
  if (
    !(
      await c.query(
        "select 1 from drivevision.schema_migrations where version=$1",
        [version],
      )
    ).rowCount
  )
    await c.query(
      readFileSync(
        new URL(
          `../supabase/migrations/${version}_drivevision_billing.sql`,
          import.meta.url,
        ),
        "utf8",
      ),
    );
  const privileges = (
    await c.query(
      "select has_table_privilege('drivevision_app','drivevision.platform_admins','INSERT') as promote,has_schema_privilege('anon','drivevision','USAGE') as public_access",
    )
  ).rows[0];
  if (privileges.promote || privileges.public_access)
    throw new Error("Unexpected privilege escalation");
  await c.query("commit");
  console.log(
    "Private billing migration applied. Existing manual access preserved.",
  );
} catch (e) {
  await c.query("rollback").catch(() => {});
  console.error("Billing setup failed:", e.code || e.message);
  process.exitCode = 1;
} finally {
  await c.end();
}
