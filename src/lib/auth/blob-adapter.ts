import type {
  Adapter,
  AdapterAccount,
  AdapterUser,
  VerificationToken,
} from "@auth/core/adapters";
import { blobDelete, blobGetJson, blobPutJson } from "@/lib/blob";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

/** scrypt cost params — serverless-friendly, no native addon */
const N_KEYLEN = 64;

/**
 * Hash password → `scrypt$<saltHex>$<hashHex>` (nunca plain text).
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scryptAsync(password, salt, N_KEYLEN)) as Buffer;
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

/** Constant-time verify against stored hash. Aceita só formato scrypt$. */
export async function verifyPasswordHash(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  if (salt.length === 0 || expected.length === 0) return false;
  const derived = (await scryptAsync(password, salt, expected.length)) as Buffer;
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}


type StoredUser = Omit<AdapterUser, "emailVerified"> & {
  emailVerified: string | null;
  /** password hash (scrypt) — never returned via AdapterUser / session */
  passwordHash?: string | null;
};

type StoredToken = {
  identifier: string;
  token: string;
  expires: string;
};

/** Hex SHA-256 — path-safe (sem @ ou % no pathname do Blob). */
async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function userPath(id: string) {
  return `auth/users/${id}.json`;
}

async function emailIndexPath(email: string) {
  const hash = await sha256Hex(email.toLowerCase());
  return `auth/email/${hash}.json`;
}

async function accountPath(provider: string, providerAccountId: string) {
  const hash = await sha256Hex(`${provider}\n${providerAccountId}`);
  return `auth/accounts/${hash}.json`;
}

/**
 * Auth.js já hasheia o token (createHash(`${token}${secret}`)) antes de
 * create/useVerificationToken — usamos exatamente o `token` que ele passa.
 */
async function tokenPath(identifier: string, token: string) {
  const hash = await sha256Hex(`${identifier.toLowerCase()}\n${token}`);
  return `auth/verification/${hash}.json`;
}

function truncateToken(token: string) {
  if (token.length <= 12) return token;
  return `${token.slice(0, 8)}…${token.slice(-4)}`;
}

/** Strip passwordHash before handing to Auth.js. */
function toUser(raw: StoredUser): AdapterUser {
  return {
    id: raw.id,
    name: raw.name ?? null,
    email: raw.email,
    emailVerified: raw.emailVerified ? new Date(raw.emailVerified) : null,
    image: raw.image ?? null,
  };
}

function fromUser(
  user: AdapterUser,
  passwordHash: string | null | undefined = null,
): StoredUser {
  return {
    id: user.id,
    name: user.name ?? null,
    email: user.email,
    emailVerified: user.emailVerified
      ? user.emailVerified.toISOString()
      : null,
    image: user.image ?? null,
    passwordHash: passwordHash ?? null,
  };
}

async function readStoredByEmail(
  email: string,
): Promise<StoredUser | null> {
  const idx = await blobGetJson<{ userId: string }>(
    await emailIndexPath(email),
  );
  if (!idx?.userId) return null;
  return blobGetJson<StoredUser>(userPath(idx.userId));
}

/**
 * Cria usuário com senha OU anexa hash a conta magic-link existente (mesmo e-mail).
 * Retorna { ok, userId, linked } ou { ok:false, reason }.
 * Nunca loga a senha.
 */
export async function createUserWithPassword(
  email: string,
  password: string,
): Promise<
  | { ok: true; userId: string; linked: boolean; created: boolean }
  | { ok: false; reason: "exists_with_password" | "invalid" }
> {
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes("@") || password.length < 8) {
    return { ok: false, reason: "invalid" };
  }
  const hash = await hashPassword(password);
  const existing = await readStoredByEmail(normalized);
  if (existing) {
    if (existing.passwordHash) {
      return { ok: false, reason: "exists_with_password" };
    }
    // Magic-link account: enable password, keep same user id (state paths stable)
    const next: StoredUser = {
      ...existing,
      email: normalized,
      passwordHash: hash,
    };
    await blobPutJson(userPath(existing.id), next);
    return { ok: true, userId: existing.id, linked: true, created: false };
  }
  const id = crypto.randomUUID();
  const created: StoredUser = {
    id,
    name: null,
    email: normalized,
    emailVerified: null,
    image: null,
    passwordHash: hash,
  };
  await blobPutJson(userPath(id), created);
  await blobPutJson(await emailIndexPath(normalized), { userId: id });
  return { ok: true, userId: id, linked: false, created: true };
}

/**
 * Verifica e-mail + senha contra o Blob.
 * Retorna user id+email se ok; null se inválido.
 */
export async function verifyPassword(
  email: string,
  password: string,
): Promise<{ id: string; email: string } | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !password) return null;
  const stored = await readStoredByEmail(normalized);
  if (!stored?.passwordHash) return null;
  const match = await verifyPasswordHash(password, stored.passwordHash);
  if (!match) return null;
  return { id: stored.id, email: stored.email };
}

/** Minimal Auth.js adapter backed by private Vercel Blob (email magic link + JWT). */
export function BlobAuthAdapter(): Adapter {
  return {
    async createUser(user) {
      const id = user.id ?? crypto.randomUUID();
      const created: AdapterUser = {
        id,
        name: user.name ?? null,
        email: user.email,
        emailVerified: user.emailVerified ?? null,
        image: user.image ?? null,
      };
      // Preserve hash if somehow already set (e.g. race with register)
      const existing = await blobGetJson<StoredUser>(userPath(id));
      await blobPutJson(
        userPath(id),
        fromUser(created, existing?.passwordHash ?? null),
      );
      await blobPutJson(await emailIndexPath(created.email), { userId: id });
      return created;
    },

    async getUser(id) {
      const raw = await blobGetJson<StoredUser>(userPath(id));
      return raw ? toUser(raw) : null;
    },

    async getUserByEmail(email) {
      const raw = await readStoredByEmail(email);
      return raw ? toUser(raw) : null;
    },

    async getUserByAccount({ provider, providerAccountId }) {
      const acc = await blobGetJson<AdapterAccount>(
        await accountPath(provider, providerAccountId),
      );
      if (!acc?.userId) return null;
      const raw = await blobGetJson<StoredUser>(userPath(acc.userId));
      return raw ? toUser(raw) : null;
    },

    async updateUser(user) {
      const existing = await blobGetJson<StoredUser>(userPath(user.id));
      if (!existing) throw new Error(`User ${user.id} not found`);
      const prev = toUser(existing);
      const next: AdapterUser = {
        id: user.id,
        name: user.name !== undefined ? user.name : prev.name,
        email: user.email ?? prev.email,
        emailVerified:
          user.emailVerified !== undefined
            ? user.emailVerified
            : prev.emailVerified,
        image: user.image !== undefined ? user.image : prev.image,
      };
      // Preserve passwordHash across Auth.js updates (magic link verify, etc.)
      await blobPutJson(
        userPath(next.id),
        fromUser(next, existing.passwordHash ?? null),
      );
      if (next.email.toLowerCase() !== existing.email.toLowerCase()) {
        await blobPutJson(await emailIndexPath(next.email), {
          userId: next.id,
        });
      }
      return next;
    },

    async linkAccount(account) {
      await blobPutJson(
        await accountPath(account.provider, account.providerAccountId),
        account,
      );
      return account;
    },

    async createVerificationToken(verificationToken) {
      const path = await tokenPath(
        verificationToken.identifier,
        verificationToken.token,
      );
      const stored: StoredToken = {
        identifier: verificationToken.identifier,
        token: verificationToken.token,
        expires: verificationToken.expires.toISOString(),
      };
      try {
        await blobPutJson(path, stored);
      } catch (err) {
        console.error("[blob-adapter] createVerificationToken failed", {
          path,
          token: truncateToken(verificationToken.token),
          message: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
      return verificationToken;
    },

    async useVerificationToken({ identifier, token }) {
      const path = await tokenPath(identifier, token);
      let stored: StoredToken | null = null;
      try {
        stored = await blobGetJson<StoredToken>(path);
      } catch (err) {
        console.error("[blob-adapter] useVerificationToken get failed", {
          path,
          token: truncateToken(token),
          message: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
      // Soft-fail: null → Auth.js trata como Verification error
      if (!stored) return null;
      try {
        await blobDelete(path);
      } catch (err) {
        console.error("[blob-adapter] useVerificationToken delete failed", {
          path,
          token: truncateToken(token),
          message: err instanceof Error ? err.message : String(err),
        });
        /* best-effort — ainda retornamos o token para a sessão criar */
      }
      return {
        identifier: stored.identifier,
        token: stored.token,
        expires: new Date(stored.expires),
      } satisfies VerificationToken;
    },
  };
}
