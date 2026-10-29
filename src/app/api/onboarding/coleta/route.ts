/**
 * POST /api/onboarding/coleta — coleta inteligente (read-only, nunca grava).
 * LLM (COACH_LLM_PLAN_MODEL) conduz a conversa e devolve perfil parcial + estratégia (schema);
 * servidor mescla, checa obrigatórios e valida a estratégia no motor. Falha → {fallback:true} (formulário).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { limparSaidaCoach } from "@/lib/llm/tom";
import { COLETA_SYSTEM, PerfilColetaSchema, RespostaColetaSchema, faltando, mesclarPerfil, perguntaFaltante, validarEstrategia } from "@/lib/plan/coleta";

export const maxDuration = 90;

const BodySchema = z.object({
  mensagem: z.string().max(2000).default(""),
  perfil: z.unknown().optional(),
  historico: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).max(40).default([]),
});

export async function POST(req: Request) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ erro: "payload inválido" }, { status: 400 });
  const { mensagem, historico } = parsed.data;
  const base = PerfilColetaSchema.safeParse(parsed.data.perfil ?? {});
  const perfilAtual = base.success ? base.data : {};
  const apiKey = process.env.COACH_LLM_API_KEY?.trim();
  const baseUrl = process.env.COACH_LLM_BASE_URL?.trim();
  const model = process.env.COACH_LLM_PLAN_MODEL?.trim() || process.env.COACH_LLM_MODEL?.trim() || "openrouter/anthropic/claude-opus-5";
  if (!apiKey || !baseUrl) return NextResponse.json({ fallback: true, motivo: "llm_indisponivel" });

  const pedir = async () => {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        max_tokens: 2000,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: `${COLETA_SYSTEM}\n\nPERFIL JÁ COLETADO: ${JSON.stringify(perfilAtual)}\nOBRIGATÓRIOS FALTANDO: ${JSON.stringify(faltando(perfilAtual))}\nResponda apenas com o objeto JSON, sem texto fora dele.` },
          ...historico.slice(-20),
          ...(mensagem.trim() ? [{ role: "user" as const, content: mensagem }] : [{ role: "user" as const, content: "(início da conversa)" }]),
        ],
      }),
      signal: AbortSignal.timeout(40_000),
    });
    if (!res.ok) return { erro: `llm_${res.status}` } as const;
    const corpo = await res.text();
    let j: { choices?: Array<{ message?: { content?: string } }> };
    try {
      j = JSON.parse(corpo);
    } catch {
      return { erro: `gateway_nao_json:${corpo.slice(0, 160)}` } as const;
    }
    const txt = j.choices?.[0]?.message?.content ?? "";
    const a = txt.indexOf("{");
    const b = txt.lastIndexOf("}");
    try {
      return { json: JSON.parse(a >= 0 && b > a ? txt.slice(a, b + 1) : txt) as unknown } as const;
    } catch {
      return { erro: `json_invalido:${txt.slice(0, 1500)}` } as const;
    }
  };

  try {
    let out = await pedir();
    if ("erro" in out && String(out.erro).startsWith("json_invalido")) out = await pedir();
    if ("erro" in out && String(out.erro).startsWith("json_invalido")) {
      // LLM respondeu em texto puro: usa como fala do turno, sem mexer no perfil
      const txt = String(out.erro).slice("json_invalido:".length);
      const pf = perguntaFaltante(perfilAtual);
      return NextResponse.json({ resposta: limparSaidaCoach(txt).texto || pf?.q || "Me conta mais um pouco?", chips: pf?.chips ?? [], perfil: perfilAtual, faltando: faltando(perfilAtual), pronto: false, fonte: "llm_texto", modelo: model });
    }
    if ("erro" in out) return NextResponse.json({ fallback: true, motivo: out.erro });
    const v = RespostaColetaSchema.safeParse(out.json);
    if (!v.success) return NextResponse.json({ fallback: true, motivo: "schema" });
    const perfil = mesclarPerfil(perfilAtual, v.data.perfil);
    const falta = faltando(perfil);
    let resposta = limparSaidaCoach(v.data.resposta).texto;
    let chips = v.data.chips;
    let pronto = v.data.pronto && falta.length === 0;
    if (v.data.pronto && falta.length) {
      const pf = perguntaFaltante(perfil)!;
      resposta = `${resposta}\n\n${pf.q}`;
      chips = pf.chips;
    }
    const validacao = pronto ? validarEstrategia(perfil, v.data.estrategia) : null;
    if (pronto && !v.data.estrategia) pronto = true; // estratégia ausente → auto pelo motor
    return NextResponse.json({ resposta, chips, perfil, faltando: falta, pronto, ...(validacao ? validacao : {}), fonte: "llm", modelo: model });
  } catch (e) {
    return NextResponse.json({ fallback: true, motivo: e instanceof Error ? e.name : "erro" });
  }
}
