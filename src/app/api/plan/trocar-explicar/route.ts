/**
 * POST /api/plan/trocar-explicar — read-only. Só devolve texto curto por alternativa.
 * Nunca grava estado. Sem LLM (ou falha) → { explicacoes: {}, fonte: "regra" } e o app usa o texto por regra.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { explicarComLlm } from "@/lib/plan/trocar-explicar-llm";

const Body = z.object({
  de: z.string().min(1).max(80),
  restricoes: z.array(z.string().max(120)).max(8).default([]),
  itens: z
    .array(z.object({ id: z.string().max(60), nome: z.string().max(80), equipamento: z.string().max(30), texto_base: z.string().max(400) }))
    .min(1)
    .max(8),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const p = Body.safeParse(raw);
  if (!p.success) return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  const r = await explicarComLlm(p.data);
  return NextResponse.json({ explicacoes: r.explicacoes, fonte: r.fonte });
}
