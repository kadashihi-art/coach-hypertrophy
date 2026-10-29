/**
 * Onboarding por coleta inteligente: LLM conversa → PERFIL estruturado (schema) + ESTRATÉGIA.
 * Motor valida/corrige a estratégia (determinístico) e gera os números. Nada grava aqui.
 * PAR-Q é gate explícito à parte (a LLM nunca libera N2).
 */
import { z } from "zod";
import { ObjetivoSchema, ExperienciaSchema, EquipamentoSchema, GrupoMuscularSchema } from "@/lib/domain/enums";
import type { Perfil } from "@/lib/domain";
import { TOM_COACH } from "@/lib/llm/tom";

const Estilo = z.enum(["auto", "full_body", "upper_lower", "ppl", "hibrido_ppl_ul", "hibrido_fb_ul"]);
export const RESTRICOES_VALIDAS = ["ombro", "lombar", "joelho", "punho"] as const;

export const PerfilColetaSchema = z
  .object({
    objetivo: ObjetivoSchema,
    experiencia: ExperienciaSchema,
    peso_kg: z.number().min(30).max(250),
    altura_cm: z.number().min(120).max(230),
    dias_por_semana: z.number().int().min(2).max(6),
    minutos_por_sessao: z.number().int().min(20).max(180),
    cardio_min_semana: z.number().int().min(0).max(1500),
    equipamentos: z.array(EquipamentoSchema).max(10),
    restricoes: z.array(z.enum(RESTRICOES_VALIDAS)).max(4),
    rotina: z.string().max(300),
    sono_estresse: z.string().max(300),
    preferencias: z.string().max(300),
    nao_gosta: z.string().max(300),
    pontos_fracos: z.array(GrupoMuscularSchema).max(4),
    pontos_fortes: z.array(GrupoMuscularSchema).max(4),
  })
  .partial();
export type PerfilColeta = z.infer<typeof PerfilColetaSchema>;

/** Campos que o motor precisa — sem eles não há proposta. */
export const OBRIGATORIOS = ["objetivo", "experiencia", "peso_kg", "altura_cm", "dias_por_semana", "minutos_por_sessao", "equipamentos", "restricoes"] as const;

export const EstrategiaSchema = z.object({
  estilo_split: Estilo,
  escolha_explicita_usuario: z.boolean().default(false),
  fase2_estilo: Estilo.exclude(["auto"]).nullable().default(null),
  fase1_semanas: z.number().int().min(1).max(16).optional(),
  fase2_semanas: z.number().int().min(1).max(16).optional(),
  dias_descanso_fixos: z.array(z.number().int().min(0).max(6)).max(5).optional(),
  prioridades_musculares: z.array(GrupoMuscularSchema).max(3).default([]),
  porque: z.array(z.string().max(240)).max(5).default([]),
});
export type Estrategia = z.infer<typeof EstrategiaSchema>;

export const RespostaColetaSchema = z.object({
  resposta: z.string().min(1).max(1500),
  chips: z.array(z.string().max(40)).max(5).default([]),
  perfil: z.unknown().optional(),
  estrategia: z.unknown().nullable().optional(),
  pronto: z.boolean().default(false),
});

export function mesclarPerfil(base: PerfilColeta, novo: unknown): PerfilColeta {
  const out: PerfilColeta = { ...base };
  if (novo && typeof novo === "object") {
    for (const [k, v] of Object.entries(novo as Record<string, unknown>)) {
      if (v === null || v === undefined) continue;
      const one = PerfilColetaSchema.safeParse({ [k]: v });
      if (one.success && k in one.data) Object.assign(out, one.data);
    }
  }
  return out;
}

export function faltando(p: PerfilColeta): string[] {
  return OBRIGATORIOS.filter((k) => p[k] === undefined);
}

const PERGUNTA_FALTANTE: Record<(typeof OBRIGATORIOS)[number], { q: string; chips: string[] }> = {
  objetivo: { q: "Antes de fechar: seu foco principal é ganhar massa, força, recomposição ou saúde?", chips: ["Ganhar massa", "Força", "Recomposição", "Saúde"] },
  experiencia: { q: "Há quanto tempo você treina de forma consistente?", chips: ["Começando agora", "1–3 anos", "Mais de 3 anos"] },
  peso_kg: { q: "Quanto você pesa hoje, mais ou menos?", chips: [] },
  altura_cm: { q: "E sua altura?", chips: [] },
  dias_por_semana: { q: "Quantos dias por semana você consegue treinar de verdade, sem forçar a rotina?", chips: ["3 dias", "4 dias", "5 dias", "6 dias"] },
  minutos_por_sessao: { q: "Quanto tempo cabe em cada treino?", chips: ["45 min", "60 min", "75 min", "90 min"] },
  equipamentos: { q: "Onde você treina? Academia completa ou algo mais limitado?", chips: ["Academia completa", "Só halteres", "Em casa, peso corporal"] },
  restricoes: { q: "Tem alguma lesão ou dor que eu precise respeitar? Ombro, lombar, joelho, punho?", chips: ["Nenhuma", "Ombro", "Lombar", "Joelho"] },
};

export function perguntaFaltante(p: PerfilColeta) {
  const f = faltando(p)[0] as (typeof OBRIGATORIOS)[number] | undefined;
  return f ? PERGUNTA_FALTANTE[f] : null;
}

/** Validação determinística da estratégia da LLM (R1–R12 de frequência/viabilidade). */
export function validarEstrategia(p: PerfilColeta, estrategiaIn: unknown): { estrategia: Estrategia; correcoes: string[] } {
  const parsed = EstrategiaSchema.safeParse(estrategiaIn ?? {});
  const correcoes: string[] = [];
  let e: Estrategia;
  if (parsed.success) e = { ...parsed.data };
  else {
    // leniente: aproveita campo a campo o que for válido
    const raw = (estrategiaIn && typeof estrategiaIn === "object" ? estrategiaIn : {}) as Record<string, unknown>;
    const ok: Record<string, unknown> = { estilo_split: "auto" };
    for (const [k, v] of Object.entries(raw)) {
      const t = EstrategiaSchema.safeParse({ ...ok, [k]: v });
      if (t.success) ok[k] = v;
      else if (Array.isArray(v)) {
        const arr = v.filter((x) => EstrategiaSchema.safeParse({ ...ok, [k]: [x] }).success).slice(0, k === "porque" ? 5 : 3);
        if (arr.length) ok[k] = arr;
      }
    }
    e = EstrategiaSchema.parse(ok);
    if (e.estilo_split === "auto") correcoes.push("Estratégia fora do formato: deixei a divisão no automático.");
  }
  const dias = p.dias_por_semana ?? 4;
  const fallback = (): Estrategia["estilo_split"] => (dias <= 3 ? "full_body" : "upper_lower");
  const check = (estilo: Estrategia["estilo_split"], label: string): Estrategia["estilo_split"] => {
    if (estilo === "hibrido_ppl_ul" && dias < 5) { correcoes.push(`${label}: híbrido PPL+UL precisa de 5 dias; com ${dias} troquei por ${fallback()}.`); return fallback(); }
    if (estilo === "ppl" && dias < 3) { correcoes.push(`${label}: PPL precisa de ≥3 dias; troquei por ${fallback()}.`); return fallback(); }
    if (estilo === "ppl" && dias < 6 && !e.escolha_explicita_usuario) { correcoes.push(`${label}: PPL em ${dias} dias deixa grupos 1×/semana (regra ≥2×); troquei por ${fallback()}.`); return fallback(); }
    if (estilo === "hibrido_fb_ul" && dias < 3) { correcoes.push(`${label}: híbrido FB+UL precisa de ≥3 dias; troquei por full_body.`); return "full_body"; }
    return estilo;
  };
  e.estilo_split = check(e.estilo_split, "Fase 1");
  if (e.fase2_estilo) {
    const f2 = check(e.fase2_estilo, "Fase 2");
    e.fase2_estilo = f2 === "auto" ? null : f2;
    if (p.experiencia === "iniciante" && (e.fase1_semanas ?? 6) < 6) { e.fase1_semanas = 6; correcoes.push("Iniciante: fase 1 com no mínimo 6 semanas antes de trocar."); }
  }
  if (e.dias_descanso_fixos) {
    const max = 7 - dias;
    const fixos = [...new Set(e.dias_descanso_fixos)].slice(0, max);
    if (fixos.length !== e.dias_descanso_fixos.length) correcoes.push(`Descansos fixos ajustados para caber em ${dias} treinos.`);
    e.dias_descanso_fixos = fixos;
  }
  return { estrategia: e, correcoes };
}

/** Perfil completo (ainda sem PAR-Q) para o motor. */
export function paraPerfil(base: Perfil, c: PerfilColeta, e: Estrategia, correcoes: string[] = []): Perfil {
  const acordos = [
    ...(c.rotina ? [`Rotina: ${c.rotina}`] : []),
    ...(c.sono_estresse ? [`Sono/estresse: ${c.sono_estresse}`] : []),
    ...(c.preferencias ? [`Curte: ${c.preferencias}`] : []),
    ...(c.nao_gosta ? [`Evitar: ${c.nao_gosta}`] : []),
    ...(e.prioridades_musculares.length ? [`Prioridade: ${e.prioridades_musculares.join(", ")}`] : []),
    ...correcoes.map((x) => `Ajuste técnico: ${x}`),
  ].map((s) => s.slice(0, 240)).slice(0, 12);
  return {
    ...base,
    objetivo: c.objetivo ?? base.objetivo,
    experiencia: c.experiencia ?? base.experiencia,
    peso_kg: c.peso_kg ?? base.peso_kg,
    altura_cm: c.altura_cm ?? base.altura_cm,
    dias_por_semana: c.dias_por_semana ?? base.dias_por_semana,
    minutos_por_sessao: c.minutos_por_sessao ?? base.minutos_por_sessao,
    cardio_min_semana: c.cardio_min_semana ?? base.cardio_min_semana ?? 0,
    equipamentos: c.equipamentos?.length ? c.equipamentos : base.equipamentos,
    restricoes: (c.restricoes ?? []).map((r) => r),
    estilo_split: e.estilo_split,
    fase2_estilo: e.fase2_estilo,
    ...(e.fase1_semanas ? { fase1_semanas: e.fase1_semanas } : {}),
    ...(e.fase2_semanas ? { fase2_semanas: e.fase2_semanas } : {}),
    ...(e.dias_descanso_fixos?.length ? { dias_descanso_fixos: e.dias_descanso_fixos } : {}),
    acordos_plano: acordos,
  };
}

export const COLETA_SYSTEM = [
  "Você é o coach PhD em hipertrofia natural conhecendo uma pessoa nova pra montar o plano dela. É uma conversa, não um formulário.",
  TOM_COACH,
  "Faça UMA ou DUAS perguntas por vez, adaptando ao que a pessoa já disse (follow-ups). Cubra: objetivo, histórico/nível, dias e tempo REAIS, rotina/trabalho, sono e estresse, equipamento, lesões/limitações, o que curte e odeia, pontos fracos e fortes, cardio. Não repita o que já sabe.",
  "Responda SOMENTE JSON: {\"resposta\": string, \"chips\": string[] (até 5 respostas rápidas curtas para a sua pergunta), \"perfil\": {...só campos novos ou corrigidos}, \"estrategia\": {...}|null, \"pronto\": boolean}.",
  "perfil (use exatamente estes nomes/valores): objetivo (hipertrofia|forca|recomposicao|saude), experiencia (iniciante|intermediario|avancado), peso_kg, altura_cm, dias_por_semana (2-6), minutos_por_sessao (20-180), cardio_min_semana, equipamentos (barra|halteres|maquina|cabo|kettlebell|peso_corporal|banco|rack|elastico|outros; academia completa = barra,halteres,maquina,cabo,banco,rack), restricoes (lista de ombro|lombar|joelho|punho; [] se não tem), rotina, sono_estresse, preferencias, nao_gosta (textos curtos), pontos_fracos, pontos_fortes (grupos: peito|costas|ombros|biceps|triceps|quadriceps|isquiotibiais|gluteos|panturrilhas|abdomen|antebracos|trapezio).",
  "Quando tiver o essencial (objetivo, experiência, peso, altura, dias, minutos, equipamento, lesões) e um pouco de contexto, proponha a estratégia e marque pronto=true. Não arraste além de ~8 perguntas.",
  "NUNCA proponha híbridos (hibrido_*) por conta própria nem mencione que vai migrar pra híbrido; só use se a pessoa pedir explicitamente. Use estilo_split exatamente com um dos valores listados e prioridades_musculares com nomes de grupos válidos (ou []).",
  "estrategia: {estilo_split (full_body|upper_lower|ppl|hibrido_ppl_ul|hibrido_fb_ul), escolha_explicita_usuario (true só se a pessoa pediu esse estilo), fase2_estilo (ou null), fase1_semanas, fase2_semanas, dias_descanso_fixos (posições 0-6, opcional), prioridades_musculares (até 3 grupos), porque (2-4 frases curtas)}.",
  "Nenhum estilo é padrão: escolha pelo indivíduo (frequência ≥2×/semana por grupo, tempo, recuperação, nível, lesões, preferência). Não invente kg, séries ou volume — eu (o plano) calculo depois.",
  "Nunca pergunte nem decida sobre liberação médica: a triagem PAR-Q vem logo depois, à parte. Se a pessoa citar dor forte, sintoma cardíaco etc., registre e recomende avaliação profissional.",
  "Na resposta com pronto=true, resuma em 2–3 frases o que você entendeu e a ideia de divisão, e diga que antes de mostrar o plano tem uma triagem rápida de saúde.",
  "Primeira mensagem (historico vazio): se apresente em uma frase e pergunte o objetivo e há quanto tempo treina.",
].join("\n");
