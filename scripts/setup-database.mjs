import { Client } from "pg";
import { randomBytes, createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { connectionOptions } from "../server/database.ts";
process.loadEnvFile(".env.local");
const client = new Client(connectionOptions(true));
const fingerprintSql = `select table_schema,table_name,column_name,ordinal_position,data_type,is_nullable,column_default
  from information_schema.columns where table_schema not in ('drivevision','pg_catalog','information_schema') order by 1,2,4`;
const fingerprint = (rows) =>
  createHash("sha256").update(JSON.stringify(rows)).digest("hex");
try {
  await client.connect();
  await client.query("begin");
  await client.query(
    "select pg_advisory_xact_lock(hashtext('drivevision.initial_setup'))",
  );
  await client.query("set local lock_timeout='5s'");
  if (
    (
      await client.query(
        "select 1 from pg_namespace where nspname='drivevision'",
      )
    ).rowCount
  )
    throw new Error(
      "Schema drivevision already exists; setup stopped without changing it.",
    );
  if (
    (
      await client.query(
        "select 1 from pg_roles where rolname='drivevision_app'",
      )
    ).rowCount
  )
    throw new Error("Role drivevision_app already exists; setup stopped.");
  const before = fingerprint((await client.query(fingerprintSql)).rows);
  const password = randomBytes(36).toString("base64url");
  // Generated base64url only; never interpolate user-supplied text into DDL.
  if (!/^[A-Za-z0-9_-]+$/.test(password))
    throw new Error("Invalid generated password");
  await client.query(
    `create role drivevision_app login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls connection limit 10 password '${password}'`,
  );
  const migration = readFileSync(
    new URL(
      "../supabase/migrations/20260926002314_drivevision_isolated_workspace.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await client.query(migration);
  const after = fingerprint((await client.query(fingerprintSql)).rows);
  if (before !== after)
    throw new Error("Existing table definitions changed; rolling back.");
  const env = readFileSync(".env.local", "utf8").replace(
    /^DRIVEVISION_DB_(USER|PASSWORD)=.*\r?\n?/gm,
    "",
  );
  writeFileSync(
    ".env.local",
    `${env.trim()}\nDRIVEVISION_DB_USER=drivevision_app\nDRIVEVISION_DB_PASSWORD="${password}"\n`,
  );
  await client.query("commit");
  console.log(
    JSON.stringify({
      createdSchema: "drivevision",
      runtimeRole: "drivevision_app",
      existingColumnsUnchanged: true,
      existingColumnsFingerprint: before,
      tables: 7,
    }),
  );
} catch (error) {
  await client.query("rollback").catch(() => {});
  console.error("Setup stopped:", error.code || error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
