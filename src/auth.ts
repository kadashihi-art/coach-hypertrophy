import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import Credentials from "next-auth/providers/credentials";
import type { Adapter } from "@auth/core/adapters";
import {
  BlobAuthAdapter,
  verifyPassword,
} from "@/lib/auth/blob-adapter";
import { hasBlobCredentials } from "@/lib/blob";

/**
 * Auth.js v5 — magic link via Resend + e-mail/senha (Credentials).
 * JWT sessions 30d; Blob adapter for verification tokens + users.
 * Password hash vive só no Blob (nunca no JWT/session).
 *
 * E-mail NÃO aponta pro callback direto (prefetch do Gmail/Outlook queima o
 * token one-time). Link vai pra /auth/confirm; o clique do user consome o token.
 */
const resendKey =
  process.env.AUTH_RESEND_KEY ?? process.env.RESEND_API_KEY ?? "";
const emailFrom =
  process.env.EMAIL_FROM ??
  "Coach Hypertrophy <onboarding@resend.dev>";

function buildAdapter(): Adapter | undefined {
  // Lazily require Blob only when credentials exist so `next build` is fine.
  if (!hasBlobCredentials()) return undefined;
  return BlobAuthAdapter();
}

function emailHtml(confirmUrl: string, host: string) {
  const escaped = confirmUrl
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
  return `<!DOCTYPE html>
<html lang="pt-BR">
<body style="background:#0a0a0a;color:#f5f5f0;font-family:system-ui,sans-serif;padding:32px 16px;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr><td align="center">
      <table width="100%" style="max-width:420px;background:#141414;border:1px solid #2a2a2a;border-radius:16px;padding:28px;" cellpadding="0" cellspacing="0">
        <tr><td align="center" style="padding-bottom:16px;">
          <div style="width:56px;height:56px;border-radius:14px;background:#B8FF3C;color:#0a0a0a;font-weight:700;font-size:18px;line-height:56px;text-align:center;">CH</div>
        </td></tr>
        <tr><td align="center" style="padding-bottom:8px;">
          <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.18em;color:#B8FF3C;">COACH HYPERTROPHY</p>
        </td></tr>
        <tr><td align="center" style="padding-bottom:12px;">
          <h1 style="margin:0;font-size:22px;font-weight:700;color:#f5f5f0;">Seu link de acesso</h1>
        </td></tr>
        <tr><td align="center" style="padding-bottom:24px;">
          <p style="margin:0;font-size:14px;line-height:1.5;color:#a3a39a;">Clique no botão abaixo para entrar. O link só vale uma vez — não compartilhe.</p>
        </td></tr>
        <tr><td align="center" style="padding-bottom:24px;">
          <a href="${escaped}" style="display:inline-block;background:#B8FF3C;color:#0a0a0a;font-weight:700;font-size:16px;text-decoration:none;padding:14px 28px;border-radius:14px;">Entrar no Coach</a>
        </td></tr>
        <tr><td align="center">
          <p style="margin:0;font-size:11px;line-height:1.4;color:#6b6b63;">Se o botão não funcionar, abre este link:<br/><a href="${escaped}" style="color:#B8FF3C;word-break:break-all;">${escaped}</a></p>
          <p style="margin:12px 0 0;font-size:11px;color:#6b6b63;">${host}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function emailText(confirmUrl: string, host: string) {
  return `Coach Hypertrophy — seu link de acesso

Abra este link para entrar (vale uma vez):
${confirmUrl}

${host}`;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  secret: process.env.AUTH_SECRET,
  session: {
    strategy: "jwt",
    // Persistência 30 dias — evita pedir magic link a cada visita
    maxAge: 30 * 24 * 60 * 60,
  },
  jwt: {
    maxAge: 30 * 24 * 60 * 60,
  },
  adapter: buildAdapter(),
  providers: [
    Resend({
      apiKey: resendKey || "missing-resend-key",
      from: emailFrom,
      async sendVerificationRequest({ identifier, url, provider }) {
        const u = new URL(url);
        const token = u.searchParams.get("token");
        if (!token) throw new Error("Missing verification token in Auth.js url");
        const email = u.searchParams.get("email") ?? identifier;
        const callbackUrl = u.searchParams.get("callbackUrl") ?? "/";
        const confirm = new URL("/auth/confirm", u.origin);
        confirm.searchParams.set("email", email);
        confirm.searchParams.set("token", token);
        confirm.searchParams.set("callbackUrl", callbackUrl);
        const host = u.host;
        const confirmUrl = confirm.toString();

        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${provider.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: provider.from,
            to: identifier,
            subject: "Seu link do Coach Hypertrophy",
            html: emailHtml(confirmUrl, host),
            text: emailText(confirmUrl, host),
          }),
        });
        if (!res.ok) {
          throw new Error(
            "Resend error: " + JSON.stringify(await res.json()),
          );
        }
      },
    }),
    Credentials({
      id: "credentials",
      name: "E-mail e senha",
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        const email =
          typeof credentials?.email === "string"
            ? credentials.email.trim().toLowerCase()
            : "";
        const password =
          typeof credentials?.password === "string"
            ? credentials.password
            : "";
        if (!email.includes("@") || !password) return null;
        if (!hasBlobCredentials()) return null;
        const user = await verifyPassword(email, password);
        if (!user) return null;
        // Mesmo id do Blob → state/${userId}.json estável
        return { id: user.id, email: user.email };
      },
    }),
  ],
  pages: {
    signIn: "/",
    verifyRequest: "/",
    error: "/",
    newUser: "/onboarding",
  },
  callbacks: {
    async jwt({ token, user }) {
      // No primeiro login o adapter / credentials traz user.id; se faltar, preserva/gera sub.
      if (user) {
        token.sub = user.id || token.sub || crypto.randomUUID();
        if (user.email) token.email = user.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const id = (token.sub as string) || "";
        session.user.id = id;
        if (token.email) session.user.email = token.email as string;
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      try {
        const parsed = new URL(url);
        if (parsed.origin === baseUrl) return url;
      } catch {
        /* ignore */
      }
      return baseUrl;
    },
  },
});
