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
  const endpoint = databaseEndpoint(uri?.hostname || process.env.DRIVEVISION_DB_HOST);
  return {
    host: endpoint.host,
    port: Number(uri?.port || endpoint.port || process.env.DRIVEVISION_DB_PORT || 5432),
    database: uri
      ? decodeURIComponent(uri.pathname.slice(1))
      : process.env.DRIVEVISION_DB_DATABASE || "postgres",
    user: (uri
      ? decodeURIComponent(uri.username)
      : process.env[
          admin ? "DRIVEVISION_DB_ADMIN_USER" : "DRIVEVISION_DB_USER"
        ])?.trim(),
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
    statement_timeout: 20000,
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
): Promise<T> {
  const client = await database().connect();
  try {
    await client.query("begin");
    await client.query("select set_config('drivevision.user_id', $1, true)", [
      userId,
    ]);
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
