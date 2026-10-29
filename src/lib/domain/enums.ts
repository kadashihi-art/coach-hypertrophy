import { z } from "zod";

/** brief-produto-v1 · enums fechados */

export const ObjetivoSchema = z.enum([
  "hipertrofia",
  "forca",
  "recomposicao",
  "saude",
]);
export type Objetivo = z.infer<typeof ObjetivoSchema>;

export const DivisaoSchema = z.enum([
  "full_body",
  "upper_lower",
  "ppl",
  "ppl_upper_lower",
  "push_pull",
  "bro_split",
  "hibrido",
]);
export type Divisao = z.infer<typeof DivisaoSchema>;

export const FocoMesocicloSchema = z.enum([
  "acumulo",
  "intensificacao",
  "realizacao",
  "deload",
]);
export type FocoMesociclo = z.infer<typeof FocoMesocicloSchema>;

export const PadraoSchema = z.enum([
  "empurrar_horizontal",
  "empurrar_inclinado",
  "empurrar_vertical",
  "puxar_horizontal",
  "puxar_vertical",
  "agachamento",
  "dobradica_quadril",
  "extensao_joelho",
  "flexao_joelho",
  "flexao_plantar",
  "abducao_ombro",
  "flexao_cotovelo",
  "extensao_cotovelo",
  "flexao_ombro",
  "rotacao_externa",
  "core_antiextensao",
  "core_antirotacao",
]);
export type Padrao = z.infer<typeof PadraoSchema>;

export const EvidenciaSchema = z.enum([
  "forte",
  "moderado",
  "contextual",
  "pratica",
]);
export type Evidencia = z.infer<typeof EvidenciaSchema>;

export const AcaoProgressaoSchema = z.enum([
  "subir_carga",
  "manter_carga",
  "manter_e_checar",
  "reduzir_carga",
  "suspender",
  "deload",
]);
export type AcaoProgressao = z.infer<typeof AcaoProgressaoSchema>;

export const NivelAlertaSchema = z.enum(["N0", "N1", "N2"]);
export type NivelAlerta = z.infer<typeof NivelAlertaSchema>;

export const OrigemCargaSchema = z.enum([
  "historico",
  "estimativa_conservadora",
  "usuario",
  "calibracao",
]);
export type OrigemCarga = z.infer<typeof OrigemCargaSchema>;

export const StatusSessaoSchema = z.enum([
  "planejada",
  "em_andamento",
  "concluida",
  "parcial",
  "abandonada",
  "pulada",
]);
export type StatusSessao = z.infer<typeof StatusSessaoSchema>;

export const ExperienciaSchema = z.enum([
  "iniciante",
  "intermediario",
  "avancado",
]);
export type Experiencia = z.infer<typeof ExperienciaSchema>;

export const TipoSerieSchema = z.enum([
  "aquecimento",
  "top_set",
  "back_off",
  "trabalho",
  "drop",
]);
export type TipoSerie = z.infer<typeof TipoSerieSchema>;

export const RegraProgressaoSchema = z.enum([
  "R1",
  "R2",
  "R3",
  "R4",
  "R5",
  "R6",
  "R7",
  "R8",
  "R9",
  "R10",
  "R11",
  "R12",
]);
export type RegraProgressao = z.infer<typeof RegraProgressaoSchema>;

export const TecnicaSchema = z.enum([
  "padrao",
  "top_set_backoff",
  "rest_pause",
  "drop_set",
  "myo_reps",
  "cluster",
  "lengthened_partials",
  "pause",
  "tempo",
]);
export type Tecnica = z.infer<typeof TecnicaSchema>;

export const GrupoMuscularSchema = z.enum([
  "peito",
  "costas",
  "ombros",
  "biceps",
  "triceps",
  "quadriceps",
  "isquiotibiais",
  "gluteos",
  "panturrilhas",
  "abdomen",
  "antebracos",
  "trapezio",
]);
export type GrupoMuscular = z.infer<typeof GrupoMuscularSchema>;

export const EquipamentoSchema = z.enum([
  "barra",
  "halteres",
  "maquina",
  "cabo",
  "kettlebell",
  "peso_corporal",
  "banco",
  "rack",
  "elastico",
  "outros",
]);
export type Equipamento = z.infer<typeof EquipamentoSchema>;

/** Incremento de carga: 2,5 kg superior / 5 kg inferior (R1) */
export const GRUPOS_SUPERIORES: GrupoMuscular[] = [
  "peito",
  "costas",
  "ombros",
  "biceps",
  "triceps",
  "antebracos",
  "trapezio",
];

export const VOLUME_MIN = 10;
export const VOLUME_MAX = 20;

export function incrementoCargaKg(grupoPrimario: GrupoMuscular): number {
  return GRUPOS_SUPERIORES.includes(grupoPrimario) ? 2.5 : 5.0;
}
