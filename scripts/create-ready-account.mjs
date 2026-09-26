import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { transaction, closeDatabase } from "../server/database.ts";
import { hashPassword } from "../server/security.ts";
import { credentialsSchema } from "../server/validation.ts";

// Operator-only provisioning; never included in the client or exposed as an API.
process.loadEnvFile(".env.local");
const [name, email] = process.argv.slice(2);
const password = randomBytes(18).toString("base64url");
const account = credentialsSchema.parse({ name, email, password });
const id = randomUUID();
try {
  const hash = await hashPassword(password);
  await transaction(id, async (client) => {
    await client.query(
      "insert into drivevision.accounts (id,email,name,password_hash) values ($1,$2,$3,$4)",
      [id, account.email, account.name, hash],
    );
    await client.query(
      "insert into drivevision.workspaces (id,owner_id,name) values ($1,$2,$3)",
      [randomUUID(), id, "Meu workspace"],
    );
    const directory = resolve("work");
    mkdirSync(directory, { recursive: true });
    // Write before COMMIT: a file error rolls back account creation.
    writeFileSync(
      resolve(directory, `acesso-${id}.json`),
      JSON.stringify({ id, name: account.name, email: account.email, password }, null, 2),
      { mode: 0o600, flag: "wx" },
    );
  });
  console.log(JSON.stringify({ created: true, email: account.email, credentialsFile: resolve("work", `acesso-${id}.json`) }));
} catch (error) {
  console.error(error.code === "23505" ? "A conta já existe. Nenhuma senha foi alterada." : "Falha ao criar a conta. Nenhuma credencial foi publicada.");
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
