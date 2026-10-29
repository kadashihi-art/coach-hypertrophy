/**
 * Camada B — Contrato de resposta do LLM (brief-produto-v1 §5).
 * Válido por segundos. Validado → traduzido → descartado.
 * Nunca é fonte de verdade. Nunca grava direto no "banco".
 */
import { z } from "zod";
import {
  AcaoProgressaoSchema,
  DivisaoSchema,
  EvidenciaSchema,
  FocoMesocicloSchema,
  GrupoMuscularSchema,
  NivelAlertaSchema,
  ObjetivoSchema,
  OrigemCargaSchema,
  PadraoSchema,
  RegraProgressaoSchema,
  TecnicaSchema,
} from "@/lib/domain";

export const CONTRATO_VERSAO = "2.0.0" as const;

export const TipoRespostaSchema = z.enum([
  "plano_gerado",
  "sessao_do_dia",
  "ajuste_progressao",
  "analise_pos_treino",
  "resposta_conversacional",
]);
export type TipoResposta = z.infer<typeof TipoRespostaSchema>;

const AlertaEnvelopeSchema = z.object({
  nivel: NivelAlertaSchema,
  motivo: z.string(),
  recomendacao: z.string(),
});

const CargaEnvelopeSchema = z.object({
  trabalho_kg: z.number(),
  top_set_kg: z.number().nullable().default(null),
  origem: OrigemCargaSchema,
});

const PrescricaoEnvelopeSchema = z.object({
  exercicio_id: z.string(),
  padrao: PadraoSchema,
  ordem: z.number().int(),
  series: z.number().int().positive(),
  faixa_reps: z.tuple([z.number().int(), z.number().int()]),
  rir_alvo: z.number().int(),
  descanso_seg: z.number().int(),
  cadencia: z.string().default("2-0-1-0"),
  tecnica: TecnicaSchema.default("padrao"),
  carga: CargaEnvelopeSchema,
  alternativa_equipamento_ocupado: z.string().nullable().default(null),
  guia_id: z.string().nullable().default(null),
  evidencia: EvidenciaSchema,
});

const SessaoEnvelopeSchema = z.object({
  nome: z.string(),
  ordem: z.number().int(),
  prescricoes: z.array(PrescricaoEnvelopeSchema).default([]),
});

const PlanoEnvelopeSchema = z.object({
  objetivo: ObjetivoSchema,
  divisao: DivisaoSchema,
  dias_por_semana: z.number().int(),
  minutos_por_sessao: z.number().int(),
  mesociclo: z.object({
    total_semanas: z.number().int(),
    semana_atual: z.number().int(),
    foco: FocoMesocicloSchema,
  }),
  justificativa: z.object({
    texto: z.string(),
    evidencia: EvidenciaSchema,
  }),
  sessoes: z.array(SessaoEnvelopeSchema).default([]),
});

const DecisaoEnvelopeSchema = z.object({
  exercicio_id: z.string(),
  regra: RegraProgressaoSchema,
  acao: AcaoProgressaoSchema,
  carga_anterior_kg: z.number(),
  nova_carga_kg: z.number(),
  faixa_reps_reiniciada: z.boolean().default(false),
  motivo: z.string(),
  evidencia: EvidenciaSchema,
});

const VolumeDeltaSchema = z.object({
  grupo: GrupoMuscularSchema,
  planejado: z.number(),
  realizado: z.number(),
  delta: z.number(),
});

const AnalisePosTreinoSchema = z.object({
  volume_realizado_vs_planejado: z.array(VolumeDeltaSchema).default([]),
  pontos_fortes: z.array(z.string()).default([]),
  pontos_fracos: z.array(z.string()).default([]),
  ajustes: z.array(z.string()).default([]),
  alertas_programacao: z.array(z.string()).default([]),
});

export const LlmResponseEnvelopeSchema = z.object({
  contrato_versao: z.literal("2.0.0"),
  tipo_resposta: TipoRespostaSchema,
  alerta_seguranca: AlertaEnvelopeSchema.optional(),
  plano: PlanoEnvelopeSchema.optional(),
  decisoes_progressao: z.array(DecisaoEnvelopeSchema).optional(),
  analise_pos_treino: AnalisePosTreinoSchema.optional(),
  mensagem_usuario: z.string().optional(),
});
export type LlmResponseEnvelope = z.infer<typeof LlmResponseEnvelopeSchema>;

export type ValidationResult =
  | { ok: true; data: LlmResponseEnvelope }
  | { ok: false; errors: string[] };

/** Valida envelope LLM. Nada grava sem passar por aqui. */
export function validarContratoLlm(raw: unknown): ValidationResult {
  const parsed = LlmResponseEnvelopeSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map(
        (i) => `${i.path.join(".")}: ${i.message}`,
      ),
    };
  }
  // Regras de blocos obrigatórios por tipo
  const d = parsed.data;
  const missing: string[] = [];
  if (d.tipo_resposta === "plano_gerado" && !d.plano) {
    missing.push("plano obrigatório para plano_gerado");
  }
  if (d.tipo_resposta === "ajuste_progressao" && !d.decisoes_progressao) {
    missing.push("decisoes_progressao obrigatório para ajuste_progressao");
  }
  if (d.tipo_resposta === "analise_pos_treino" && !d.analise_pos_treino) {
    missing.push("analise_pos_treino obrigatório para analise_pos_treino");
  }
  if (d.tipo_resposta === "sessao_do_dia" && !d.plano) {
    missing.push("plano (com sessões) obrigatório para sessao_do_dia");
  }
  if (
    d.tipo_resposta === "resposta_conversacional" &&
    !d.mensagem_usuario?.trim()
  ) {
    missing.push("mensagem_usuario obrigatória para resposta_conversacional");
  }
  if (missing.length) return { ok: false, errors: missing };
  return { ok: true, data: d };
}
