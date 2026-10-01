import { ConnectorError } from "./connector-security.ts";
import { Pool, type PoolClient } from "pg";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getCACertificates } from "node:tls";
import { databaseEndpoint } from "./database-endpoint.ts";

let pool: Pool | undefined;
export function databaseConfigured() {
  return Boolean(
    process.env.DRIVEVISION_DATABASE_URL ||
    (process.env.DRIVEVISION_DB_USER && process.env.DRIVEVISION_DB_PASSWORD),
  );
}
export function connectionOptions(admin = false) {
  const raw = admin ? undefined : process.env.DRIVEVISION_DATABASE_URL;
  const uri = raw ? new URL(raw) : null;
  const endpoint = databaseEndpoint(
    uri?.hostname || process.env.DRIVEVISION_DB_HOST,
  );
  const configuredUser = (
    uri
      ? decodeURIComponent(uri.username)
      : process.env[admin ? "DRIVEVISION_DB_ADMIN_USER" : "DRIVEVISION_DB_USER"]
  )?.trim();
  const directProject = /^db\.([a-z\d]+)\.supabase\.co$/i.exec(
    endpoint.host,
  )?.[1];
  // Verified project-specific route: this direct endpoint has no IPv4 DNS record.
  // Other database hosts are unaffected; a future migration uses its own env host.
  const productionPooler =
    process.env.VERCEL &&
    endpoint.host === "db.tqzqtcmlhmkwhhjrexjk.supabase.co"
      ? "aws-1-sa-east-1.pooler.supabase.com"
      : undefined;
  // The project suffix routes shared Supavisor connections, not the dedicated pooler.
  const directUser =
    directProject && configuredUser?.endsWith(`.${directProject}`)
      ? configuredUser.slice(0, -(directProject.length + 1))
      : configuredUser;
  const user =
    productionPooler && directUser
      ? `${directUser}.${directProject}`
      : directUser;
  return {
    host: productionPooler || endpoint.host,
    port: productionPooler
      ? 6543
      : Number(
          uri?.port || endpoint.port || process.env.DRIVEVISION_DB_PORT || 5432,
        ),
    database: uri
      ? decodeURIComponent(uri.pathname.slice(1))
      : process.env.DRIVEVISION_DB_DATABASE || "postgres",
    user,
    password: uri
      ? decodeURIComponent(uri.password)
      : process.env[
          admin ? "DRIVEVISION_DB_ADMIN_PASSWORD" : "DRIVEVISION_DB_PASSWORD"
        ],
    ssl: {
      rejectUnauthorized: true,
      ca: [
        ...getCACertificates("default"),
        process.env.DRIVEVISION_DB_CA?.replace(/\\n/g, "\n") ||
          readFileSync(resolve("server/certs/supabase-ca.crt"), "utf8"),
      ],
    },
    max: 3,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
    query_timeout: 20000,
    application_name: "drivevision",
  };
}
export function database() {
  if (!databaseConfigured()) throw new Error("DATABASE_NOT_CONFIGURED");
  if (!pool) {
    const options = connectionOptions();
    if (options.user === "postgres" || options.user?.startsWith("postgres."))
      throw new Error("RUNTIME_ROLE_REQUIRED");
    pool = new Pool(options);
    pool.on("error", () =>
      console.error("DriveVision: idle database connection closed."),
    );
  }
  return pool;
}
export async function transaction<T>(
  userId: string,
  fn: (client: PoolClient) => Promise<T>,
  options: { allowUnpaid?: boolean } = {},
): Promise<T> {
  const client = await database().connect();
  try {
    await client.query("begin");
    await client.query("set local statement_timeout = '20s'");
    await client.query("select set_config('drivevision.user_id', $1, true)", [
      userId,
    ]);
    if (userId) {
      // Serialize suspension against in-flight customer writes without blocking new registrations.
      const account = await client.query(
        "select disabled_at from drivevision.accounts where id=$1 for share",
        [userId],
      );
      if (account.rows[0]?.disabled_at)
        throw new ConnectorError(
          401,
          "Esta conta está suspensa. Entre em contato com a administração.",
        );
      if (
        !options.allowUnpaid &&
        (
          await client.query(
            "select 1 from drivevision.billing_accounts where owner_id=$1 and coalesce(greatest(paid_until,trial_ends_at),'-infinity'::timestamptz)<=now()",
            [userId],
          )
        ).rowCount
      )
        throw new ConnectorError(
          402,
          "Ative ou regularize sua assinatura em Minha assinatura para acessar o workspace.",
        );
    }
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
export async function closeDatabase() {
  await pool?.end();
  pool = undefined;
}
