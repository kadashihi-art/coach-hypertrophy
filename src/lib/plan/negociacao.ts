/**
 * Negociação do plano (onboarding / meu-treino): proposta NÃO salva.
 * LLM (ou heurística) → AjustesPlano (schema) → motor remonta. kg/séries/volume só do motor.
 * P1: nada aqui grava; só o "Confirmar plano" no cliente salva. PAR-Q nunca é tocado.
 */
import { z } from "zod";
import { EquipamentoSchema, type Exercicio, type Perfil, type PlanoRacional } from "@/lib/domain";
import { gerarPlanoFromPerfil, NOME_ESTILO, type EstiloSplit, type PlanoGerado } from "./gerar-plano";
import { parqBloqueiaPrescricao, PARQ_BLOQUEIO_MSG } from "./parq";
import { TOM_COACH } from "@/lib/llm/tom";

const EstiloEnum = z.enum(["auto", "full_body", "upper_lower", "ppl", "hibrido_ppl_ul", "hibrido_fb_ul"]);

export const AjustesPlanoSchema = z
  .object({
    estilo_split: EstiloEnum.optional(),
    dias_por_semana: z.number().int().min(2).max(6).optional(),
    dias_descanso_fixos: z.array(z.number().int().min(0).max(6)).max(5).optional(),
    fase2_estilo: EstiloEnum.exclude(["auto"]).nullable().optional(),
    fase1_semanas: z.number().int().min(1).max(16).optional(),
    fase2_semanas: z.number().int().min(1).max(16).optional(),
    restricoes_adicionar: z.array(z.string().min(2).max(80)).max(6).optional(),
    equipamentos: z.array(EquipamentoSchema).max(10).optional(),
    minutos_por_sessao: z.number().int().min(20).max(180).optional(),
  })
  .strict();
export type AjustesPlano = z.infer<typeof AjustesPlanoSchema>;

export const RespostaNegociacaoSchema = z.object({
  resposta: z.string().min(1).max(2500),
  ajustes: AjustesPlanoSchema.default({}),
  condicoes: z.array(z.string().min(2).max(240)).max(6).default([]),
});
export type RespostaNegociacao = z.infer<typeof RespostaNegociacaoSchema>;

/** Aplica ajustes validados ao perfil-rascunho. Nunca toca PAR-Q/objetivo/experiência. */
export function aplicarAjustes(perfil: Perfil, ajustesIn: unknown, condicoes: string[] = []): Perfil {
  const parsed = AjustesPlanoSchema.safeParse(ajustesIn ?? {});
  const a: AjustesPlano = parsed.success ? parsed.data : {};
  const out: Perfil = { ...perfil };
  if (a.estilo_split) out.estilo_split = a.estilo_split;
  if (a.dias_por_semana) out.dias_por_semana = a.dias_por_semana;
  if (a.dias_descanso_fixos) out.dias_descanso_fixos = a.dias_descanso_fixos;
  if (a.fase2_estilo !== undefined) out.fase2_estilo = a.fase2_estilo;
  if (a.fase1_semanas) out.fase1_semanas = a.fase1_semanas;
  if (a.fase2_semanas) out.fase2_semanas = a.fase2_semanas;
  if (a.restricoes_adicionar?.length) out.restricoes = [...new Set([...(out.restricoes ?? []), ...a.restricoes_adicionar])];
  if (a.equipamentos?.length) out.equipamentos = a.equipamentos;
  if (a.minutos_por_sessao) out.minutos_por_sessao = a.minutos_por_sessao;
  // descansos fixos não podem exceder 7 - dias
  if (out.dias_descanso_fixos?.length) out.dias_descanso_fixos = out.dias_descanso_fixos.slice(0, 7 - out.dias_por_semana);
  if (condicoes.length) out.acordos_plano = [...new Set([...(out.acordos_plano ?? []), ...condicoes])].slice(-12);
  // PAR-Q intocado
  out.parq_liberado = perfil.parq_liberado;
  out.parq_respostas = perfil.parq_respostas;
  out.parq_respondido_em = perfil.parq_respondido_em;
  return out;
}

export type Proposta =
  | { ok: true; gerado: PlanoGerado; racional: PlanoRacional; perfil: Perfil }
  | { ok: false; erro: string };

export function gerarProposta(perfil: Perfil, catalog: Exercicio[]): Proposta {
  if (parqBloqueiaPrescricao(perfil)) return { ok: false, erro: PARQ_BLOQUEIO_MSG };
  try {
    const gerado = gerarPlanoFromPerfil(perfil, catalog);
    return { ok: true, gerado, racional: gerado.plano.racional!, perfil };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "erro ao gerar proposta" };
  }
}

/** Resumo compacto do racional para o LLM. */
export function resumoProposta(r: PlanoRacional, perfil: Perfil) {
  return {
    split: r.split.nome,
    porque: r.split.porque.slice(0, 4),
    fases: r.fases.map((f) => ({ nome: f.nome, semanas: f.semanas, microciclo: f.microciclo, descanso: f.descanso.slice(0, 3) })),
    frequencia: r.frequencia_por_musculo,
    volume: r.volume_semanal.map((v) => ({ grupo: v.grupo, series: v.series_diretas, faixa: v.faixa_alvo })),
    alternativas: r.alternativas.map((a) => a.nome),
    perfil: {
      dias_por_semana: perfil.dias_por_semana,
      minutos_por_sessao: perfil.minutos_por_sessao,
      experiencia: perfil.experiencia,
      objetivo: perfil.objetivo,
      equipamentos: perfil.equipamentos,
      restricoes: perfil.restricoes,
      estilo_split: perfil.estilo_split ?? "auto",
      fase2_estilo: perfil.fase2_estilo ?? null,
      dias_descanso_fixos: perfil.dias_descanso_fixos ?? [],
    },
    acordos: perfil.acordos_plano ?? [],
  };
}

const ESTILO_KW: Array<[RegExp, EstiloSplit]> = [
  [/h[ií]brido.*(fb|full)|(fb|full).*\+.*(ul|upper)/i, "hibrido_fb_ul"],
  [/h[ií]brido|ppl\s*\+.*(ul|upper)/i, "hibrido_ppl_ul"],
  [/\bul\b|upper\s*\/?\s*lower|superior.*inferior/i, "upper_lower"],
  [/\bppl\b|push.*pull|empurrar.*puxar/i, "ppl"],
  [/full\s*-?\s*body|corpo (todo|inteiro)|\bfb\b/i, "full_body"],
];

/** Fallback determinístico (sem LLM): extrai ajustes óbvios do texto. */
export function interpretarFeedbackHeuristico(texto: string): RespostaNegociacao {
  const t = texto.toLowerCase();
  const ajustes: AjustesPlano = {};
  const condicoes: string[] = [];
  for (const [re, e] of ESTILO_KW) {
    if (re.test(t)) { ajustes.estilo_split = e; condicoes.push(`Preferência de estilo: ${NOME_ESTILO[e]}.`); break; }
  }
  const dm = t.match(/(\d)\s*(x|vezes|dias|treinos)/);
  if (dm) {
    const n = Number(dm[1]);
    if (n >= 2 && n <= 6) { ajustes.dias_por_semana = n; condicoes.push(`Disponibilidade real: ${n} dias/semana.`); }
  }
  if (ajustes.estilo_split === "hibrido_ppl_ul" && !ajustes.dias_por_semana) {
    ajustes.dias_por_semana = 5;
    ajustes.dias_descanso_fixos = [3, 6];
    condicoes.push("Semana: Push, Pull, Legs, descanso, Upper, Lower, descanso.");
  }
  const mm = t.match(/(\d{2,3})\s*(min|minutos)/);
  if (mm) {
    const m = Math.min(180, Math.max(20, Number(mm[1])));
    ajustes.minutos_por_sessao = m; condicoes.push(`Sessões de até ${m} min.`);
  } else if (/pouco tempo|corrid|sem tempo/.test(t)) {
    ajustes.minutos_por_sessao = 45; condicoes.push("Pouco tempo: sessões de ~45 min.");
  }
  const les: string[] = [];
  for (const k of ["ombro", "lombar", "joelho", "punho"]) if (t.includes(k)) les.push(k);
  if (les.length && /les[aã]o|dor|machuc|cirurgia|tendin/.test(t)) {
    ajustes.restricoes_adicionar = les.map((k) => `lesão/dor ${k}`);
    condicoes.push(`Restrição: ${les.join(", ")} (troco exercícios de risco).`);
  }
  const mudou = Object.keys(ajustes).length > 0;
  const resposta = mudou
    ? `Entendi. Ajustei a proposta: ${condicoes.join(" ")} Remontei a divisão, a frequência e os descansos — dá uma olhada abaixo. Ficou bom?`
    : /les[aã]o|dor/.test(t)
      ? "Me diz qual região (ombro, lombar, joelho ou punho) que eu troco os exercícios de risco."
      : "Não peguei um ajuste concreto. Pode trocar o estilo ou os dias aqui embaixo, ou me dizer algo tipo \"prefiro UL, 4 dias\".";
  return { resposta, ajustes, condicoes };
}

export const NEGOCIAR_SYSTEM = [
  "Você é o coach PhD em hipertrofia natural. Você acabou de montar uma PROPOSTA de plano pra essa pessoa e está conversando com ela antes de salvar.",
  TOM_COACH,
  "Você recebe o racional da proposta (split, fases, descansos, frequência, volume) e a mensagem da pessoa.",
  "Responda SOMENTE um JSON: {\"resposta\": string, \"ajustes\": {...}, \"condicoes\": string[]}. A resposta segue o TOM acima (sem a linha [[sugestao]]).",
  "ajustes só pode ter: estilo_split (auto|full_body|upper_lower|ppl|hibrido_ppl_ul|hibrido_fb_ul), dias_por_semana (2-6), dias_descanso_fixos (posições 0-6; 0 = dia 1 da semana do plano), fase2_estilo (full_body|upper_lower|ppl|hibrido_ppl_ul|hibrido_fb_ul|null), fase1_semanas, fase2_semanas (1-16), restricoes_adicionar (use ombro/lombar/joelho/punho), equipamentos (barra|halteres|maquina|cabo|kettlebell|peso_corporal|banco|rack|elastico|outros — lista COMPLETA), minutos_por_sessao (20-180).",
  "hibrido_ppl_ul = Push, Pull, Legs, descanso, Upper, Lower (pernas e grandes grupos 2×/semana com 5 dias). É só mais um estilo: nunca sugira por padrão; use apenas se a pessoa pedir ou se o perfil dela justificar claramente.",
  "Nunca invente kg, séries ou volume: diga que você remonta e os números aparecem na proposta.",
  "Nunca mexa em PAR-Q nem libere intensidade alta; dor/lesão vira restricoes_adicionar e, se for séria, recomende avaliação profissional.",
  "Se a pessoa só pedir explicação, ajustes = {}. Se o pedido for ruim pra hipertrofia, explique o trade-off com honestidade, proponha o melhor caminho e respeite a escolha.",
  "condicoes: frases curtas do que ficou combinado (ex. \"Prefere Upper/Lower\", \"Trabalha em turnos: no máximo 4 dias\").",
  "Modo apresentar (mensagem vazia): apresente a proposta em 2–4 frases (o porquê do split e dos descansos) e pergunte se quer ajustar algo.",
].join("\n");
