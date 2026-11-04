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
  /** Antebraço: flexão/extensão de punho, rosca inversa e carregadas (pegada). */
  "antebraco_pegada",
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
  "feeder",
  "top_set",
  "back_off",
  "trabalho",
  "drop",
]);
export type TipoSerie = z.infer<typeof TipoSerieSchema>;

/** Séries preparatórias (aquecimento + aproximação/feeder) — nunca contam como volume nem progressão. */
export function ehSeriePreparatoria(t: TipoSerie | string | undefined): boolean {
  return t === "aquecimento" || t === "feeder";
}

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

/**
 * Técnicas avançadas opcionais (lote 4): só na ÚLTIMA série de isoladores/máquinas,
 * ativadas pelo usuário com confirmação. Regras e textos em `engine/tecnicas.ts`.
 */
export const TecnicaFinalSchema = z.enum(["drop_set", "rest_pause", "myo_reps", "bi_set", "parciais"]);
export type TecnicaFinal = z.infer<typeof TecnicaFinalSchema>;

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

/**
 * Faixas de volume semanal efetivo por grupo (diretas + 0,5×indiretas).
 * Padrão 10–20 (VOLUME_MIN/VOLUME_MAX). Abdômen e antebraço são grupos OPCIONAIS
 * e já recebem bastante trabalho indireto (estabilização, pegada em remadas/roscas),
 * então usam faixas conservadoras (docs/volume-abdomen-antebraco.md):
 *  - mínimo 0: nunca gera alerta de "pouco volume";
 *  - máximo 12: acima disso avisa, porque a recuperação de punho/lombar pesa antes.
 */
export const FAIXA_VOLUME_GRUPO: Partial<Record<GrupoMuscular, { min: number; max: number }>> = {
  abdomen: { min: 0, max: 12 },
  antebracos: { min: 0, max: 12 },
};

export function faixaVolume(grupo: string): { min: number; max: number } {
  return FAIXA_VOLUME_GRUPO[grupo as GrupoMuscular] ?? { min: VOLUME_MIN, max: VOLUME_MAX };
}

/** Grupos que o gerador só inclui se o usuário pedir (pontos fracos), em dose leve. */
export const GRUPOS_OPCIONAIS: GrupoMuscular[] = ["abdomen", "antebracos"];

export function incrementoCargaKg(grupoPrimario: GrupoMuscular): number {
  return GRUPOS_SUPERIORES.includes(grupoPrimario) ? 2.5 : 5.0;
}
