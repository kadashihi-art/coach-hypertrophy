/**
 * Domínio Coach Hypertrophy — Camada A (brief-produto-v1.txt)
 * Persistência MVP: localStorage. IA NÃO grava direto — só via contrato validado.
 */

export * from "./enums";
export * from "./entities";
export * from "./sono";

import { z } from "zod";
import {
  AlertaSegurancaSchema,
  CardioSchema,
  FeedbackMusculoSchema,
  CheckinSchema,
  DecisaoProgressaoSchema,
  EstadoExercicioSchema,
  ExercicioSchema,
  GuiaExecucaoSchema,
  PerfilSchema,
  PlanoSchema,
  PrescricaoSchema,
  RegistroSerieSchema,
  SessaoSchema,
  VolumeSemanalSchema,
} from "./entities";
import { GrupoMuscularSchema } from "./enums";

export const SnapshotSessaoSchema = z.object({
  data: z.string().nullable(),
  grupos: z.array(GrupoMuscularSchema).default([]),
  duracao_estimada_min: z.number().int().positive().default(60),
  prescricoes: z.array(PrescricaoSchema),
});
export type SnapshotSessao = z.infer<typeof SnapshotSessaoSchema>;

export const EdicaoSessaoSchema = z.object({
  sessao_id: z.string(),
  /** Sessão como o Coach gerou (gravada na 1ª edição). */
  original: SnapshotSessaoSchema,
  /** Estado imediatamente antes da última edição (null depois de desfazer). */
  anterior: SnapshotSessaoSchema.nullable().default(null),
  editado_em: z.string(),
});
export type EdicaoSessao = z.infer<typeof EdicaoSessaoSchema>;

/** Correção de sessão concluída: versão anterior (para Desfazer exato). */
export const CorrecaoConcluidaSchema = z.object({
  sessao_id: z.string(),
  corrigido_em: z.string(),
  com_recalculo: z.boolean(),
  anterior: z.object({
    sessoes: z.array(SessaoSchema),
    registros_sessao: z.array(RegistroSerieSchema),
    estados: z.array(EstadoExercicioSchema),
    volumes_semanais: z.array(VolumeSemanalSchema),
    decisoes: z.array(DecisaoProgressaoSchema),
  }),
});
export type CorrecaoConcluida = z.infer<typeof CorrecaoConcluidaSchema>;

/** Editar durante o treino: versão anterior (para Desfazer enquanto nada novo foi registrado). */
export const EdicaoAoVivoSchema = z.object({
  sessao_id: z.string(),
  editado_em: z.string(),
  /** Prescrições da sessão antes da edição. */
  prescricoes: z.array(PrescricaoSchema),
  logger_prescricao_id: z.string().nullable().default(null),
  /** Estados criados pela edição (exercício nunca feito); saem ao desfazer. */
  estados_criados: z.array(z.string()).default([]),
  /** Nº de registros da sessão no momento da edição: Desfazer só vale enquanto não muda. */
  registros_n: z.number().int().nonnegative(),
  resumo: z.array(z.string()).default([]),
});
export type EdicaoAoVivo = z.infer<typeof EdicaoAoVivoSchema>;

export const AppStateSchema = z.object({
  perfil: PerfilSchema.nullable(),
  exercicios: z.array(ExercicioSchema).default([]),
  guias: z.array(GuiaExecucaoSchema).default([]),
  plano: PlanoSchema.nullable(),
  sessoes: z.array(SessaoSchema).default([]),
  registros: z.array(RegistroSerieSchema).default([]),
  estados: z.array(EstadoExercicioSchema).default([]),
  checkins: z.array(CheckinSchema).default([]),
  /** Cardio avulso: minutos por dia, contados contra o ideal semanal do perfil. */
  cardios: z.array(CardioSchema).optional(),
  alertas: z.array(AlertaSegurancaSchema).default([]),
  decisoes: z.array(DecisaoProgressaoSchema).default([]),
  volumes_semanais: z.array(VolumeSemanalSchema).default([]),
  active_sessao_id: z.string().nullable().default(null),
  logger_prescricao_id: z.string().nullable().default(null),
  /** Editar treino: snapshots por sessão (original do Coach + anterior p/ desfazer). */
  edicoes_sessao: z.array(EdicaoSessaoSchema).optional(),
  /** Corrigir registro de treino concluído: última versão anterior por sessão. */
  correcoes_concluidas: z.array(CorrecaoConcluidaSchema).optional(),
  /** Última edição feita durante o treino (para Desfazer). */
  edicao_ao_vivo: EdicaoAoVivoSchema.nullable().optional(),
  /** Dias que o usuário limpou no calendário (YYYY-MM-DD): a agenda não põe treino neles. */
  dias_limpos: z.array(z.string()).optional(),
  /** Feedback por músculo (estímulo, articulação, recuperação) que regula o volume do dia. */
  feedbacks_musculo: z.array(FeedbackMusculoSchema).optional(),
});
export type AppState = z.infer<typeof AppStateSchema>;
