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
  CheckinSchema,
  DecisaoProgressaoSchema,
  EstadoExercicioSchema,
  ExercicioSchema,
  GuiaExecucaoSchema,
  PerfilSchema,
  PlanoSchema,
  RegistroSerieSchema,
  SessaoSchema,
  VolumeSemanalSchema,
} from "./entities";

export const AppStateSchema = z.object({
  perfil: PerfilSchema.nullable(),
  exercicios: z.array(ExercicioSchema).default([]),
  guias: z.array(GuiaExecucaoSchema).default([]),
  plano: PlanoSchema.nullable(),
  sessoes: z.array(SessaoSchema).default([]),
  registros: z.array(RegistroSerieSchema).default([]),
  estados: z.array(EstadoExercicioSchema).default([]),
  checkins: z.array(CheckinSchema).default([]),
  alertas: z.array(AlertaSegurancaSchema).default([]),
  decisoes: z.array(DecisaoProgressaoSchema).default([]),
  volumes_semanais: z.array(VolumeSemanalSchema).default([]),
  active_sessao_id: z.string().nullable().default(null),
  logger_prescricao_id: z.string().nullable().default(null),
});
export type AppState = z.infer<typeof AppStateSchema>;
