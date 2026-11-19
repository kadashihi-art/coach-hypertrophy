import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { AppStateSchema } from "@/lib/domain";
import { hasBlobCredentials } from "@/lib/blob";
import { validarEdicoesNoEstado } from "@/lib/plan/editar-treino";
import { validarEdicaoAoVivoNoEstado } from "@/lib/treino/editar-durante-treino";
import { validarTecnicasNoEstado } from "@/lib/engine/tecnicas";
import { validarCorrecoesNoEstado } from "@/lib/plan/corrigir-concluida";
import { readUserState, writeUserState } from "@/lib/user-state";
import { validarEntradasNovas } from "@/lib/domain/limites";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasBlobCredentials()) {
    return NextResponse.json(
      { error: "Blob not configured" },
      { status: 503 },
    );
  }
  const stored = await readUserState(session.user.id);
  if (!stored) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(stored);
}

export async function PUT(request: Request) {
  return comMotivo(() => upsert(request));
}

export async function PATCH(request: Request) {
  return comMotivo(() => upsert(request));
}

/**
 * Erro inesperado (ex.: o armazenamento recusou a gravação) volta com o motivo, curto e sem dados
 * do usuário, pra aparecer no aviso do app. Antes era só "500" e não dava pra saber a causa.
 */
async function comMotivo(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    const nome = e instanceof Error ? e.name : "Erro";
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[api/state] falha ao salvar", nome, msg);
    return NextResponse.json(
      { error: "Falha ao salvar", details: `${nome}: ${msg}`.replace(/\s+/g, " ").slice(0, 200) },
      { status: 500 },
    );
  }
}

async function upsert(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasBlobCredentials()) {
    return NextResponse.json(
      { error: "Blob not configured" },
      { status: 503 },
    );
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  // Accept either raw AppState or { state, updated_at }
  const candidate =
    body &&
    typeof body === "object" &&
    "state" in (body as Record<string, unknown>)
      ? (body as { state: unknown }).state
      : body;
  const parsed = AppStateSchema.safeParse(candidate);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid AppState", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const erroEdicao = validarEdicoesNoEstado(parsed.data) ?? validarCorrecoesNoEstado(parsed.data) ?? validarEdicaoAoVivoNoEstado(parsed.data) ?? validarTecnicasNoEstado(parsed.data);
  if (erroEdicao) {
    return NextResponse.json({ error: "Invalid edit", details: erroEdicao }, { status: 400 });
  }
  // Limites só em registros novos/alterados: dados antigos fora dos limites continuam valendo.
  const anterior = await readUserState(session.user.id);
  const erroLimite = validarEntradasNovas(anterior?.state ?? null, parsed.data);
  if (erroLimite) {
    return NextResponse.json({ error: "Invalid input", details: erroLimite }, { status: 400 });
  }
  // Nada mudou desde a última gravação: não grava de novo (cada gravação gasta a cota do armazenamento).
  if (anterior && JSON.stringify(anterior.state) === JSON.stringify(parsed.data)) {
    return NextResponse.json(anterior);
  }
  const stored = await writeUserState(session.user.id, parsed.data);
  return NextResponse.json(stored);
}
