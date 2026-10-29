import { hashPassword, verifyPasswordHash } from "../src/lib/auth/password";

async function main() {
  const password = "test-senha-123";
  const hash = await hashPassword(password);
  if (!hash.startsWith("scrypt$")) throw new Error("bad hash prefix");
  const ok = await verifyPasswordHash(password, hash);
  const bad = await verifyPasswordHash("outra", hash);
  if (!ok) throw new Error("compare should pass");
  if (bad) throw new Error("compare should fail");
  if (hash.includes(password)) throw new Error("hash leaked password");
  console.log("smoke-password OK", { format: "scrypt", hashLen: hash.length });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
