// Offline operator command. Never invoked by a public HTTP endpoint.
import { Client } from "pg";
import { connectionOptions } from "../server/database.ts";
process.loadEnvFile(".env.local");
const email = process.argv[2]?.trim().toLowerCase();
if (!email || !email.includes("@"))
  throw new Error(
    "Usage: node scripts/grant-superadmin.mjs exact-account-email",
  );
const c = new Client(connectionOptions(true));
try {
  await c.connect();
  await c.query("begin");
  const account = (
    await c.query(
      "select id from drivevision.accounts where email=$1 and disabled_at is null for update",
      [email],
    )
  ).rows[0];
  if (!account) throw new Error("Active account not found");
  await c.query(
    "insert into drivevision.platform_admins(account_id) values($1) on conflict do nothing",
    [account.id],
  );
  await c.query("commit");
  console.log(
    "Superadministrator enabled for the specified account. Refresh the session.",
  );
} catch (e) {
  await c.query("rollback").catch(() => {});
  console.error(e.code || e.message);
  process.exitCode = 1;
} finally {
  await c.end();
}
