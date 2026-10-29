import { NextResponse } from "next/server";
import { createUserWithPassword } from "@/lib/auth/blob-adapter";
import { hasBlobCredentials } from "@/lib/blob";


type Body = {
  email?: unknown;
  password?: unknown;
  passwordConfirm?: unknown;
};

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

/**
 * POST /api/auth/register
 * body: { email, password, passwordConfirm? }
 * - novo e-mail → cria user + hash
 * - e-mail magic-link sem senha → anexa hash (mesma conta)
 * - e-mail já com senha → 409
 * Nunca loga nem devolve passwordHash.
 */
export async function POST(req: Request) {
  if (!hasBlobCredentials()) {
    return bad("Cadastro indisponível no momento. Tenta de novo.", 503);
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return bad("Pedido inválido.");
  }

  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const passwordConfirm =
    typeof body.passwordConfirm === "string" ? body.passwordConfirm : undefined;

  if (!email.includes("@") || email.length > 254) {
    return bad("E-mail inválido.");
  }
  if (!password || password.length < 8) {
    return bad("Senha precisa ter pelo menos 8 caracteres.");
  }
  if (passwordConfirm !== undefined && passwordConfirm !== password) {
    return bad("As senhas não batem.");
  }

  try {
    const result = await createUserWithPassword(email, password);
    if (!result.ok) {
      if (result.reason === "exists_with_password") {
        return bad("E-mail já cadastrado. Entra com a senha.", 409);
      }
      return bad("Não deu pra criar a conta.");
    }
    return NextResponse.json({
      ok: true,
      linked: result.linked,
      created: result.created,
    });
  } catch (err) {
    console.error("[register] failed", {
      message: err instanceof Error ? err.message : String(err),
    });
    return bad("Não deu pra criar a conta. Tenta de novo.", 500);
  }
}
