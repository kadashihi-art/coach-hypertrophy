import { z } from "zod";
import {
  AcaoProgressaoSchema,
  DivisaoSchema,
  EquipamentoSchema,
  EvidenciaSchema,
  ExperienciaSchema,
  FocoMesocicloSchema,
  GrupoMuscularSchema,
  NivelAlertaSchema,
  ObjetivoSchema,
  OrigemCargaSchema,
  PadraoSchema,
  RegraProgressaoSchema,
  StatusSessaoSchema,
  TecnicaSchema,
  TipoSerieSchema,
} from "./enums";

/** Camada A — Modelo de Dados (brief-produto-v1 §4) */

export const PerfilSchema = z.object({
  id: z.string(),
  peso_kg: z.number().positive(),
  altura_cm: z.number().positive(),
  experiencia: ExperienciaSchema,
  dias_por_semana: z.number().int().min(2).max(6),
  minutos_por_sessao: z.number().int().min(20).max(180),
  cardio_min_semana: z.number().int().min(0).default(0),
  equipamentos: z.array(EquipamentoSchema).default([]),
  restricoes: z.array(z.string()).default([]),
  objetivo: ObjetivoSchema.default("hipertrofia"),
  /** Estilo de split escolhido pelo usuário (auto = motor decide). */
  estilo_split: z.enum(["auto", "full_body", "upper_lower", "ppl", "hibrido_ppl_ul", "hibrido_fb_ul"]).optional(),
  /** Fase 2 opcional (periodização): estilo após N semanas da fase 1. */
  fase2_estilo: z.enum(["full_body", "upper_lower", "ppl", "hibrido_ppl_ul", "hibrido_fb_ul"]).nullable().optional(),
  fase1_semanas: z.number().int().min(1).max(16).optional(),
  fase2_semanas: z.number().int().min(1).max(16).optional(),
  /** Descansos fixos: posição no microciclo (0 = dia 1 da semana do plano). */
  dias_descanso_fixos: z.array(z.number().int().min(0).max(6)).max(5).optional(),
  /** Condições/ajustes acordados na negociação do plano (texto curto). */
  acordos_plano: z.array(z.string().max(240)).max(12).optional(),
  onboarding_concluido: z.boolean().default(false),
  /** PAR-Q+ screening (7 perguntas clássicas). Qualquer SIM → parq_liberado=false. */
  parq_respostas: z.array(z.boolean()).optional(),
  parq_liberado: z.boolean().default(false),
  parq_respondido_em: z.string().nullable().optional(),
  criado_em: z.string(),
});
export type Perfil = z.infer<typeof PerfilSchema>;

export const GuiaExecucaoSchema = z.object({
  id: z.string(),
  exercicio_id: z.string(),
  setup: z.array(z.string()).default([]),
  execucao: z.array(z.string()).default([]),
  erros_comuns: z.array(z.string()).default([]),
  cues: z.array(z.string()).default([]),
  amplitude: z.string().optional(),
  respiracao: z.string().optional(),
  contraindicacoes: z.array(z.string()).default([]),
});
export type GuiaExecucao = z.infer<typeof GuiaExecucaoSchema>;

export const ExercicioSchema = z.object({
  id: z.string(),
  nome: z.string(),
  padrao: PadraoSchema,
  grupo_primario: GrupoMuscularSchema,
  grupos_secundarios: z.array(GrupoMuscularSchema).default([]),
  equipamento: EquipamentoSchema,
  composto: z.boolean().default(true),
  unilateral: z.boolean().default(false),
  guia_id: z.string().optional(),
});
export type Exercicio = z.infer<typeof ExercicioSchema>;

export const CargaPrescritaSchema = z.object({
  trabalho_kg: z.number().nonnegative(),
  top_set_kg: z.number().nonnegative().nullable().default(null),
  origem: OrigemCargaSchema,
});
export type CargaPrescrita = z.infer<typeof CargaPrescritaSchema>;

export const PrescricaoSchema = z.object({
  id: z.string(),
  sessao_id: z.string(),
  exercicio_id: z.string(),
  padrao: PadraoSchema,
  ordem: z.number().int().nonnegative(),
  series: z.number().int().positive(),
  faixa_reps: z.tuple([z.number().int(), z.number().int()]),
  rir_alvo: z.number().int().min(0).max(5),
  descanso_seg: z.number().int().positive(),
  cadencia: z.string().default("2-0-1-0"),
  tecnica: TecnicaSchema.default("padrao"),
  carga: CargaPrescritaSchema,
  alternativa_equipamento_ocupado: z.string().nullable().default(null),
  guia_id: z.string().nullable().default(null),
  evidencia: EvidenciaSchema.default("moderado"),
});
export type Prescricao = z.infer<typeof PrescricaoSchema>;

export const VolumePorGrupoSchema = z.object({
  grupo: GrupoMuscularSchema,
  planejado: z.number().nonnegative(),
  realizado: z.number().nonnegative().default(0),
});
export type VolumePorGrupo = z.infer<typeof VolumePorGrupoSchema>;

export const RestTimerSchema = z.object({
  status: z.enum(["idle", "running", "done"]),
  segundos_totais: z.number().int().nonnegative(),
  segundos_restantes: z.number().int().nonnegative(),
  iniciado_em: z.string().optional(),
});
export type RestTimer = z.infer<typeof RestTimerSchema>;

export const SessaoSchema = z.object({
  id: z.string(),
  plano_id: z.string(),
  nome: z.string(),
  ordem: z.number().int().nonnegative(),
  data: z.string().nullable().default(null),
  status: StatusSessaoSchema.default("planejada"),
  grupos: z.array(GrupoMuscularSchema).default([]),
  prescricoes: z.array(PrescricaoSchema).default([]),
  volume_por_grupo: z.array(VolumePorGrupoSchema).default([]),
  duracao_estimada_min: z.number().int().positive().default(60),
  duracao_real_min: z.number().int().nonnegative().nullable().default(null),
  rest_timer: RestTimerSchema.optional(),
  iniciada_em: z.string().optional(),
  finalizada_em: z.string().optional(),
});
export type Sessao = z.infer<typeof SessaoSchema>;

export const MesocicloSchema = z.object({
  total_semanas: z.number().int().min(3).max(12),
  semana_atual: z.number().int().min(1),
  foco: FocoMesocicloSchema,
  /** ISO date YYYY-MM-DD when the mesocycle starts; null = not scheduled */
  data_inicio: z.string().nullable().default(null),
});
export type Mesociclo = z.infer<typeof MesocicloSchema>;

export const JustificativaSchema = z.object({
  texto: z.string(),
  evidencia: EvidenciaSchema,
});
export type Justificativa = z.infer<typeof JustificativaSchema>;

export const TipoDiaSchema = z.enum(["push", "pull", "legs", "upper", "lower", "full", "descanso"]);
export type TipoDia = z.infer<typeof TipoDiaSchema>;

export const FasePlanoSchema = z.object({
  id: z.string(),
  nome: z.string(),
  estilo: z.string(),
  semana_inicio: z.number().int().min(1),
  semanas: z.number().int().min(1),
  /** 7 dias do microciclo a partir do dia de início (dia 0 = data_inicio da fase) */
  microciclo: z.array(z.object({ dia: z.number().int().min(0).max(6), tipo: TipoDiaSchema, sessao_id: z.string().nullable() })),
  sessao_ids: z.array(z.string()).default([]),
  descanso_porque: z.array(z.string()).default([]),
});
export type FasePlano = z.infer<typeof FasePlanoSchema>;

export const EstruturaPlanoSchema = z.object({ fases: z.array(FasePlanoSchema).min(1) });
export type EstruturaPlano = z.infer<typeof EstruturaPlanoSchema>;

/** Racional determinístico do motor (por que esse split/volume/frequência). */
export const PlanoRacionalSchema = z.object({
  versao: z.string().default("1"),
  fonte: z.enum(["motor", "derivado"]).default("motor"),
  split: z.object({
    divisao: z.string(),
    nome: z.string(),
    porque: z.array(z.string()).default([]),
  }),
  entradas: z.object({
    dias_por_semana: z.number(),
    experiencia: z.string().optional(),
    objetivo: z.string(),
    minutos_por_sessao: z.number(),
    cardio_min_semana: z.number().optional(),
    restricoes: z.array(z.string()).default([]),
  }),
  alternativas: z
    .array(z.object({ divisao: z.string(), nome: z.string(), por_que_nao: z.string(), quando_faria_sentido: z.string() }))
    .default([]),
  frequencia_por_musculo: z.array(z.object({ grupo: z.string(), vezes_semana: z.number() })).default([]),
  volume_semanal: z
    .array(z.object({ grupo: z.string(), series_diretas: z.number(), faixa_alvo: z.tuple([z.number(), z.number()]), status: z.string() }))
    .default([]),
  parametros: z.object({ faixa_reps_compostos: z.tuple([z.number(), z.number()]).optional(), faixa_reps_isolados: z.tuple([z.number(), z.number()]).optional(), rir_alvo: z.number().optional() }).default({}),
  recuperacao: z.array(z.string()).default([]),
  fases: z
    .array(z.object({ id: z.string(), nome: z.string(), estilo: z.string(), semanas: z.string(), porque: z.array(z.string()).default([]), descanso: z.array(z.string()).default([]), microciclo: z.string(), troca: z.string().optional() }))
    .default([]),
  narrativa_llm: z.string().optional(),
  acordos: z.array(z.string()).default([]),
  gerado_em: z.string(),
});
export type PlanoRacional = z.infer<typeof PlanoRacionalSchema>;

export const PlanoSchema = z.object({
  id: z.string(),
  perfil_id: z.string(),
  objetivo: ObjetivoSchema,
  divisao: DivisaoSchema,
  dias_por_semana: z.number().int().min(2).max(6),
  minutos_por_sessao: z.number().int().positive(),
  mesociclo: MesocicloSchema,
  justificativa: JustificativaSchema,
  racional: PlanoRacionalSchema.optional(),
  estrutura: EstruturaPlanoSchema.optional(),
  sessoes: z.array(z.string()).default([]), // ids
  bloqueado: z.boolean().default(false),
  criado_em: z.string(),
  schema_version: z.string().default("1.0.0"),
});
export type Plano = z.infer<typeof PlanoSchema>;

export const RegistroSerieSchema = z.object({
  id: z.string(),
  sessao_id: z.string(),
  prescricao_id: z.string(),
  exercicio_id: z.string(),
  numero: z.number().int().positive(),
  tipo_serie: TipoSerieSchema,
  carga_kg: z.number().nonnegative(),
  reps: z.number().int().nonnegative(),
  rir_percebido: z.number().int().min(0).max(5),
  dor: z.boolean().default(false),
  observacao: z.string().optional(),
  executado_em: z.string(),
});
export type RegistroSerie = z.infer<typeof RegistroSerieSchema>;

export const AlvoProximaSessaoSchema = z.object({
  carga_kg: z.number().nonnegative(),
  faixa_reps: z.tuple([z.number().int(), z.number().int()]),
  rir_alvo: z.number().int().min(0).max(5),
});
export type AlvoProximaSessao = z.infer<typeof AlvoProximaSessaoSchema>;

/** MEMÓRIA principal do app */
export const EstadoExercicioSchema = z.object({
  exercicio_id: z.string(),
  carga_atual_kg: z.number().nonnegative(),
  faixa_reps: z.tuple([z.number().int(), z.number().int()]),
  rir_alvo: z.number().int().min(0).max(5),
  alvo_proxima_sessao: AlvoProximaSessaoSchema,
  sessoes_sem_progresso: z.number().int().nonnegative().default(0),
  ultima_progressao_em: z.string().nullable().default(null),
  e1rm_estimado_kg: z.number().nonnegative().default(0),
  pr_carga_kg: z.number().nonnegative().default(0),
  pr_reps: z.number().int().nonnegative().default(0),
  origem_carga: OrigemCargaSchema.default("historico"),
  primeira_sessao: z.boolean().default(false),
  /** Memória da última sessão (defaults p/ Blob antigo) */
  ultimo_top_kg: z.number().nonnegative().nullable().default(null),
  ultimo_back_off_kg: z.number().nonnegative().nullable().default(null),
  ultimo_rir: z.number().int().min(0).max(5).nullable().default(null),
  ultima_sessao_em: z.string().nullable().default(null),
  atualizado_em: z.string(),
});
export type EstadoExercicio = z.infer<typeof EstadoExercicioSchema>;

export const DorRegiaoSchema = z.object({
  regiao: z.string(),
  intensidade: z.number().int().min(0).max(10).optional(),
});
export type DorRegiao = z.infer<typeof DorRegiaoSchema>;

export const CheckinSchema = z.object({
  id: z.string(),
  data: z.string(),
  /** Duração calculada em horas decimais (alimenta R9 <6). Derivada de inicio/fim quando houver. */
  sono_h: z.number().min(0).max(24),
  /** Hora que foi dormir — `HH:MM` 24h. Opcional p/ check-ins antigos. */
  sono_inicio: z.string().optional(),
  /** Hora que acordou — `HH:MM` 24h. Opcional p/ check-ins antigos. */
  sono_fim: z.string().optional(),
  prontidao: z.number().int().min(1).max(5),
  estresse: z.number().int().min(1).max(5).optional(),
  peso_kg: z.number().positive().optional(),
  agua_ml: z.number().nonnegative().optional(),
  proteina_g: z.number().nonnegative().optional(),
  dor: z.array(DorRegiaoSchema).default([]),
  observacao: z.string().optional(),
});
export type Checkin = z.infer<typeof CheckinSchema>;

export const AlertaSegurancaSchema = z.object({
  id: z.string(),
  data: z.string(),
  nivel: NivelAlertaSchema,
  motivo: z.string(),
  recomendacao: z.string(),
  origem_sessao_id: z.string().nullable().default(null),
  resolvido: z.boolean().default(false),
});
export type AlertaSeguranca = z.infer<typeof AlertaSegurancaSchema>;

export const DecisaoProgressaoSchema = z.object({
  id: z.string(),
  data: z.string(),
  exercicio_id: z.string(),
  sessao_id: z.string(),
  regra: RegraProgressaoSchema,
  acao: AcaoProgressaoSchema,
  carga_anterior_kg: z.number().nonnegative(),
  nova_carga_kg: z.number().nonnegative(),
  faixa_reps_reiniciada: z.boolean().default(false),
  motivo: z.string(),
  evidencia: EvidenciaSchema,
});
export type DecisaoProgressao = z.infer<typeof DecisaoProgressaoSchema>;

/** Volume semanal efetivo por grupo (diretas + 0,5×indiretas) */
export const VolumeSemanalSchema = z.object({
  semana_iso: z.string(),
  grupo: GrupoMuscularSchema,
  series_diretas: z.number().nonnegative().default(0),
  series_indiretas: z.number().nonnegative().default(0),
  series_efetivas: z.number().nonnegative().default(0),
});
export type VolumeSemanal = z.infer<typeof VolumeSemanalSchema>;

export function volumeEfetivo(
  diretas: number,
  indiretas: number,
): number {
  return diretas + 0.5 * indiretas;
}
