import { algumaIaConfigurada, chamarCadeia, extrairJson } from "@/lib/llm/cadeia";
import { mensagemApiValida } from "@/lib/chat-input";
/**
 * POST /api/onboarding/coleta — coleta inteligente (read-only, nunca grava).
 * LLM (COACH_LLM_PLAN_MODEL) conduz a conversa e devolve perfil parcial + estratégia (schema);
 * servidor mescla, checa obrigatórios e valida a estratégia no motor. Falha → {fallback:true} (formulário).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { comAberturaSincera, limparSaidaCoach } from "@/lib/llm/tom";
import { COLETA_SYSTEM, PerfilColetaSchema, RespostaColetaSchema, faltando, mesclarPerfil, perguntaFaltante, validarEstrategia } from "@/lib/plan/coleta";

export const maxDuration = 90;

const BodySchema = z.object({
  // vazio = abertura; 1 caractere (ex.: "C" acidental) é rejeitado
  mensagem: z.string().max(2000).default("").refine((t) => mensagemApiValida(t, true), "mensagem muito curta"),
  perfil: z.unknown().optional(),
  historico: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).max(40).default([]),
});

export async function POST(req: Request) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ erro: "payload inválido" }, { status: 400 });
  const { mensagem, historico } = parsed.data;
  // 1ª mensagem do coach: convida a discordar e promete sinceridade
  const abertura = !mensagem.trim() && historico.length === 0;
  const base = PerfilColetaSchema.safeParse(parsed.data.perfil ?? {});
  const perfilAtual = base.success ? base.data : {};
  if (!algumaIaConfigurada()) return NextResponse.json({ fallback: true, motivo: "llm_indisponivel" });

  try {
    const r = await chamarCadeia({
      ponto: "onboarding/coleta",
      json: true,
      temperature: 0.4,
      max_tokens: 2000,
      timeoutTokiaMs: 40_000,
      modeloTokia: process.env.COACH_LLM_PLAN_MODEL?.trim() || process.env.COACH_LLM_MODEL?.trim() || undefined,
      messages: [
        { role: "system", content: `${COLETA_SYSTEM}\n\nPERFIL JÁ COLETADO: ${JSON.stringify(perfilAtual)}\nOBRIGATÓRIOS FALTANDO: ${JSON.stringify(faltando(perfilAtual))}\nResponda apenas com o objeto JSON, sem texto fora dele.` },
        ...historico.slice(-20),
        ...(mensagem.trim() ? [{ role: "user" as const, content: mensagem }] : [{ role: "user" as const, content: "(início da conversa)" }]),
      ],
      validar: (t) => RespostaColetaSchema.safeParse(extrairJson(t)).success,
    });
    if (!r) return NextResponse.json({ fallback: true, motivo: "llm_indisponivel" });
    const out = { json: extrairJson(r.texto) };
    const v = RespostaColetaSchema.safeParse(out.json);
    if (!v.success) return NextResponse.json({ fallback: true, motivo: "schema" });
    const perfil = mesclarPerfil(perfilAtual, v.data.perfil);
    const falta = faltando(perfil);
    let resposta = limparSaidaCoach(v.data.resposta).texto;
    if (abertura) resposta = comAberturaSincera(resposta);
    let chips = v.data.chips;
    let pronto = v.data.pronto && falta.length === 0;
    if (v.data.pronto && falta.length) {
      const pf = perguntaFaltante(perfil)!;
      resposta = `${resposta}\n\n${pf.q}`;
      chips = pf.chips;
    }
    const validacao = pronto ? validarEstrategia(perfil, v.data.estrategia) : null;
    if (pronto && !v.data.estrategia) pronto = true; // estratégia ausente → auto pelo motor
    return NextResponse.json({ resposta, chips, perfil, faltando: falta, pronto, ...(validacao ? validacao : {}), fonte: "llm" });
  } catch (e) {
    return NextResponse.json({ fallback: true, motivo: e instanceof Error ? e.name : "erro" });
  }
}
