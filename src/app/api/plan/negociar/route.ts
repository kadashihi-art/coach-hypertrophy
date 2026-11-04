import { algumaIaConfigurada, chamarCadeia, extrairJson } from "@/lib/llm/cadeia";
import { mensagemApiValida } from "@/lib/chat-input";
/**
 * POST /api/plan/negociar — negociação da proposta (read-only, nunca grava).
 * LLM (COACH_LLM_PLAN_MODEL) → JSON validado por schema; falha → heurística determinística.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { comAberturaSincera, limparSaidaCoach } from "@/lib/llm/tom";
import { NEGOCIAR_SYSTEM, RespostaNegociacaoSchema, interpretarFeedbackHeuristico } from "@/lib/plan/negociacao";

export const maxDuration = 90;

const BodySchema = z.object({
  mensagem: z.string().max(2000).default(""),
  proposta: z.unknown().optional(),
  parq_bloqueado: z.boolean().optional(),
  historico: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).max(16).default([]),
});

function apresentarStub(proposta: unknown): string {
  const p = proposta as { split?: string; porque?: string[]; fases?: Array<{ microciclo?: string }> } | null;
  const linhas = [
    `Montei pra você um ${p?.split ?? "plano"}.`,
    ...(p?.porque ?? []).slice(0, 1),
    p?.fases?.[0]?.microciclo ? `Sua semana fica ${p.fases[0].microciclo}.` : "",
    "Quer ajustar algo? Lesão, dias que você realmente consegue, tempo por sessão ou preferência de divisão — me conta.",
  ];
  return linhas.filter(Boolean).join("\n");
}

export async function POST(req: Request) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ erro: "payload inválido" }, { status: 400 });
  const { mensagem, proposta, historico } = parsed.data;
  if (parsed.data.parq_bloqueado) return NextResponse.json({ erro: "PAR-Q bloqueia prescrição" }, { status: 403 });
  // vazio = abertura; 1 caractere (ex.: "C" acidental) é rejeitado — depois do gate PAR-Q
  if (!mensagemApiValida(mensagem, true)) return NextResponse.json({ erro: "mensagem muito curta" }, { status: 400 });

  const heur = mensagem.trim() ? interpretarFeedbackHeuristico(mensagem) : { resposta: comAberturaSincera(apresentarStub(proposta)), ajustes: {}, condicoes: [] };
  const model = process.env.COACH_LLM_PLAN_MODEL?.trim() || process.env.COACH_LLM_MODEL?.trim() || "openrouter/anthropic/claude-opus-5";
  if (!algumaIaConfigurada()) return NextResponse.json({ ...heur, fonte: "heuristica", sem_ia: true });

  const r = await chamarCadeia({
    ponto: "plan/negociar",
    json: true,
    temperature: 0.2,
    max_tokens: 1200,
    modeloTokia: model,
    timeoutTokiaMs: 45_000,
    messages: [
      { role: "system", content: NEGOCIAR_SYSTEM },
      ...historico.slice(-10),
      { role: "user", content: JSON.stringify({ modo: mensagem.trim() ? "feedback" : "apresentar", proposta, mensagem }) },
    ],
    validar: (t) => RespostaNegociacaoSchema.safeParse(extrairJson(t)).success,
  });
  if (!r) return NextResponse.json({ ...heur, fonte: "heuristica", sem_ia: true });
  const v = RespostaNegociacaoSchema.parse(extrairJson(r.texto));
  return NextResponse.json({ ...v, resposta: mensagem.trim() ? limparSaidaCoach(v.resposta).texto : comAberturaSincera(limparSaidaCoach(v.resposta).texto), fonte: "llm" });
}
