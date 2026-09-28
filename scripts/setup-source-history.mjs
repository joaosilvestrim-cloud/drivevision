import { Client } from "pg";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { connectionOptions } from "../server/database.ts";
process.loadEnvFile(".env.local");
const options = connectionOptions(true),
  client = new Client(options);
try {
  await client.connect();
  const exists = await client.query(
    "select 1 from drivevision.schema_migrations where version='20260928143942'",
  );
  if (!exists.rowCount) {
    if (!process.env.SUPABASE_CLI)
      throw new Error("Set SUPABASE_CLI to the installed Supabase executable.");
    const url = new URL("postgresql://localhost");
    url.hostname = options.host;
    url.port = String(options.port);
    url.username = options.user;
    url.password = options.password;
    url.pathname = "/" + options.database;
    url.searchParams.set("sslmode", "verify-full");
    url.searchParams.set(
      "sslrootcert",
      resolve("server/certs/supabase-ca.crt"),
    );
    mkdirSync("work", { recursive: true });
    writeFileSync(
      "work/source-history-setup.sql",
      "do $install$ begin set local lock_timeout='5s'; perform pg_advisory_xact_lock(hashtext('drivevision.history_setup')); if not exists(select 1 from drivevision.schema_migrations where version='20260928143942') then\n" +
        readFileSync(
          "supabase/migrations/20260928143942_drivevision_source_history.sql",
          "utf8",
        ) +
        "\nend if; end $install$;",
    );
    const result = spawnSync(
      process.env.SUPABASE_CLI,
      [
        "db",
        "query",
        "--db-url",
        url.href,
        "--file",
        resolve("work/source-history-setup.sql"),
      ],
      { encoding: "utf8", timeout: 60000, windowsHide: true },
    );
    if (result.status !== 0) {
      const diagnostic = (
        [result.stdout, result.stderr, result.error?.message]
          .filter(Boolean)
          .join("\n") || "No diagnostic"
      )
        .replaceAll(url.href, "[database]")
        .replaceAll(options.password, "[redacted]")
        .replace(/postgres(?:ql)?:\/\/\S+/g, "[database]")
        .slice(-1500);
      throw new Error("Supabase CLI migration failed: " + diagnostic);
    }
  }
  const result = await client.query(
    "select relrowsecurity,relforcerowsecurity from pg_class where oid='drivevision.source_versions'::regclass",
  );
  if (!result.rows[0]?.relrowsecurity || !result.rows[0]?.relforcerowsecurity)
    throw new Error("History RLS verification failed.");
  console.log(
    "Private source history schema installed; RLS enabled and forced.",
  );
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
