import type { Exercicio } from "@/lib/domain";
import { CATALOG_EXERCICIOS } from "./exercicios";

/**
 * Imagens de demonstração dos exercícios (duas posições: início e fim do movimento).
 * Fonte: Free Exercise DB (github.com/yuhonas/free-exercise-db), Unlicense / domínio público.
 * Arquivos baixados e otimizados em public/exercicios/ (sem hotlink). Origem de cada um: docs/imagens-exercicios.md.
 * Variação sem imagem própria usa a do exercício-base; sem nenhuma, a tela mostra um placeholder neutro.
 */
export const IMAGEM_ORIGEM: Record<string, string> = {
  abdominal_cabo: "Cable_Crunch",
  afundo_bulgaro: "Split_Squat_with_Dumbbells",
  agachamento_barra: "Barbell_Full_Squat",
  agachamento_frontal: "Front_Barbell_Squat",
  agachamento_goblet: "Goblet_Squat",
  agachamento_smith: "Smith_Machine_Squat",
  agachamento_sumo: "Plie_Dumbbell_Squat",
  agachamento_sumo_adutores: "Plie_Dumbbell_Squat",
  aducao_quadril_polia: "Cable_Hip_Adduction",
  cadeira_abdutora: "Thigh_Abductor",
  cadeira_adutora: "Thigh_Adductor",
  monster_walk: "Monster_Walk",
  barra_fixixa: "Pullups",
  bom_dia: "Good_Morning",
  cadeira_extensora: "Leg_Extensions",
  cadeira_extensora_unilateral: "Single-Leg_Leg_Extension",
  cadeira_flexora_sentada: "Seated_Leg_Curl",
  coice_cabo: "One-Legged_Cable_Kickback",
  crossover_polia_baixa: "Low_Cable_Crossover",
  crucifixo_cabo: "Cable_Crossover",
  crucifixo_halteres: "Dumbbell_Flyes",
  crucifixo_inverso: "Reverse_Flyes",
  crunch_maquina: "Ab_Crunch_Machine",
  desenvolvimento_arnold: "Arnold_Dumbbell_Press",
  desenvolvimento_barra: "Standing_Military_Press",
  desenvolvimento_halteres: "Dumbbell_Shoulder_Press",
  desenvolvimento_maquina: "Machine_Shoulder_Military_Press",
  desenvolvimento_smith: "Smith_Machine_Overhead_Shoulder_Press",
  elevacao_lateral: "Side_Lateral_Raise",
  elevacao_lateral_cabo: "Standing_Low-Pulley_Deltoid_Raise",
  elevacao_lateral_unilateral: "One-Arm_Side_Laterals",
  elevacao_pernas: "Flat_Bench_Lying_Leg_Raise",
  elevacao_pernas_barra: "Hanging_Leg_Raise",
  face_pull: "Face_Pull",
  farmer_walk: "Farmers_Walk",
  flexao_solo: "Pushups",
  hack_squat: "Hack_Squat",
  hip_thrust: "Barbell_Hip_Thrust",
  leg_press: "Leg_Press",
  mergulho_paralelas: "Dips_-_Triceps_Version",
  mesa_flexora: "Lying_Leg_Curls",
  pallof_press: "Pallof_Press",
  panturrilha_leg_press: "Calf_Press_On_The_Leg_Press_Machine",
  panturrilha_pe: "Standing_Calf_Raises",
  panturrilha_sentado: "Seated_Calf_Raise",
  panturrilha_smith: "Smith_Machine_Calf_Raise",
  passada_caminhando: "Dumbbell_Lunges",
  pec_deck: "Butterfly",
  ponte_gluteo: "Butt_Lift_Bridge",
  prancha: "Plank",
  prancha_lateral: "Side_Bridge",
  pullover_cabo: "Straight-Arm_Pulldown",
  puxada_frontal: "Wide-Grip_Lat_Pulldown",
  puxada_neutra: "V-Bar_Pulldown",
  puxada_supinada: "Underhand_Cable_Pulldowns",
  puxada_unilateral_cabo: "One_Arm_Lat_Pulldown",
  rdl_halteres: "Stiff-Legged_Dumbbell_Deadlift",
  remada_apoiada_peito: "Dumbbell_Incline_Row",
  remada_cabo: "Seated_Cable_Rows",
  remada_cavalinho: "T-Bar_Row_with_Handle",
  remada_curvada: "Bent_Over_Barbell_Row",
  remada_curvada_supinada: "Reverse_Grip_Bent-Over_Rows",
  remada_halteres: "One-Arm_Dumbbell_Row",
  remada_invertida: "Inverted_Row",
  remada_maquina: "Leverage_Iso_Row",
  remada_unilateral_cabo: "Seated_One-arm_Cable_Pulley_Rows",
  rosca_alternada: "Dumbbell_Alternate_Bicep_Curl",
  rosca_barra_w: "EZ-Bar_Curl",
  rosca_cabo: "Standing_Biceps_Cable_Curl",
  rosca_concentrada: "Concentration_Curls",
  rosca_direta: "Barbell_Curl",
  rosca_inclinada: "Incline_Dumbbell_Curl",
  rosca_inversa: "Reverse_Barbell_Curl",
  rosca_inversa_cabo: "Reverse_Cable_Curl",
  rosca_martelo: "Hammer_Curls",
  rosca_punho: "Seated_Dumbbell_Palms-Up_Wrist_Curl",
  rosca_punho_barra: "Palms-Up_Barbell_Wrist_Curl_Over_A_Bench",
  rosca_punho_cabo: "Seated_Two-Arm_Palms-Up_Low-Pulley_Wrist_Curl",
  rosca_punho_invertida: "Seated_Dumbbell_Palms-Down_Wrist_Curl",
  rosca_scott: "Preacher_Curl",
  step_up: "Dumbbell_Step_Ups",
  stiff_rdl: "Romanian_Deadlift",
  stiff_smith: "Smith_Machine_Stiff-Legged_Deadlift",
  supino_fechado: "Close-Grip_Barbell_Bench_Press",
  supino_halteres: "Dumbbell_Bench_Press",
  supino_inclinado_barra: "Barbell_Incline_Bench_Press_-_Medium_Grip",
  supino_inclinado_halteres: "Incline_Dumbbell_Press",
  supino_inclinado_maquina: "Leverage_Incline_Chest_Press",
  supino_inclinado_smith: "Smith_Machine_Incline_Bench_Press",
  supino_maquina: "Machine_Bench_Press",
  supino_reto_articulado: "Leverage_Chest_Press",
  supino_reto_convencional: "Barbell_Bench_Press_-_Medium_Grip",
  supino_reto_smith: "Smith_Machine_Bench_Press",
  triceps_barra_v: "Triceps_Pushdown_-_V-Bar_Attachment",
  triceps_corda: "Triceps_Pushdown_-_Rope_Attachment",
  triceps_halteres: "Tricep_Dumbbell_Kickback",
  triceps_maquina: "Machine_Triceps_Extension",
  triceps_overhead_cabo: "Cable_Rope_Overhead_Triceps_Extension",
  triceps_pulley: "Triceps_Pushdown",
  triceps_testa: "EZ-Bar_Skullcrusher",
};

export const IMAGEM_CREDITO = "Imagem: Free Exercise DB (domínio público)";

export function arquivoImagem(id: string): string {
  return `/exercicios/${id.replace(/_/g, "-")}.webp`;
}

export type ImagemExercicio = { src: string; alt: string; origem: "propria" | "base" } | null;

export function imagemDoExercicio(
  ref: string | Pick<Exercicio, "id" | "nome" | "base_id">,
  catalog: Pick<Exercicio, "id" | "nome" | "base_id">[] = CATALOG_EXERCICIOS,
): ImagemExercicio {
  const ex = typeof ref === "string" ? catalog.find((e) => e.id === ref) ?? CATALOG_EXERCICIOS.find((e) => e.id === ref) : ref;
  if (!ex) return null;
  const alt = `Como fazer: ${ex.nome} (posição inicial e final)`;
  if (IMAGEM_ORIGEM[ex.id]) return { src: arquivoImagem(ex.id), alt, origem: "propria" };
  const baseId = ex.base_id ?? CATALOG_EXERCICIOS.find((e) => e.id === ex.id)?.base_id;
  if (baseId && IMAGEM_ORIGEM[baseId]) return { src: arquivoImagem(baseId), alt, origem: "base" };
  return null;
}
