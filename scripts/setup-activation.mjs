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
    "select pg_advisory_xact_lock(hashtext('drivevision.activation_setup'))",
  );
  const already = await client.query(
    "select 1 from drivevision.schema_migrations where version='20260926020000'",
  );
  if (!already.rowCount)
    await client.query(
      readFileSync(
        new URL(
          "../supabase/migrations/20260926020000_drivevision_account_activation.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
  const check = await client.query(
    "select has_column_privilege('drivevision_app','drivevision.accounts','password_hash','update') as credential, has_column_privilege('drivevision_app','drivevision.accounts','email','update') as email, has_schema_privilege('anon','drivevision','usage') as anon",
  );
  if (!check.rows[0].credential || check.rows[0].email || check.rows[0].anon)
    throw new Error("Unexpected privileges");
  await client.query("commit");
  console.log(
    "Account activation ready. Only password_hash UPDATE was granted to the private runtime role.",
  );
} catch (e) {
  await client.query("rollback").catch(() => {});
  console.error("Activation setup stopped:", e.code || e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
