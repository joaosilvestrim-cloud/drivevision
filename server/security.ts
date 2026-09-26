import { randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto";
export const tokenHash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");
export async function hashPassword(
  password: string,
  salt = randomBytes(16).toString("hex"),
) {
  const hash = await new Promise<Buffer>((resolve, reject) =>
    scrypt(
      password,
      salt,
      64,
      { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );
  return `scrypt:${salt}:${hash.toString("hex")}`;
}
export async function verifyPassword(password: string, stored: string) {
  const parts = stored.split(":");
  if (
    parts.length !== 3 ||
    parts[0] !== "scrypt" ||
    !/^[a-f0-9]{32}$/.test(parts[1]) ||
    !/^[a-f0-9]{128}$/.test(parts[2])
  )
    return false;
  const actual = (await hashPassword(password, parts[1])).split(":")[2];
  return timingSafeEqual(
    Buffer.from(actual, "hex"),
    Buffer.from(parts[2], "hex"),
  );
}
