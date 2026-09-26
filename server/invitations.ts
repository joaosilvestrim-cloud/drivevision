import { randomUUID } from "node:crypto";
import { transaction } from "./database.ts";
import { newToken, tokenHash } from "./security.ts";
import { credentialsSchema } from "./validation.ts";

// Called only by the operator CLI, never exposed as an unauthenticated API.
// The pending marker cannot pass verifyPassword; activation replaces it atomically.
export async function createAccountInvitation(name: string, email: string) {
  const parsed = credentialsSchema
    .pick({ name: true, email: true })
    .required()
    .parse({ name, email });
  const id = randomUUID(),
    token = newToken(),
    expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
  await transaction(id, async (c) => {
    await c.query(
      "insert into drivevision.accounts (id,email,name,password_hash) values ($1,$2,$3,$4)",
      [
        id,
        parsed.email,
        parsed.name,
        `setup:${tokenHash(token)}:${expiresAt.getTime()}`,
      ],
    );
    await c.query(
      "insert into drivevision.workspaces (id,owner_id,name) values ($1,$2,$3)",
      [randomUUID(), id, "Meu workspace"],
    );
  });
  return { id, name: parsed.name, email: parsed.email, token, expiresAt };
}
