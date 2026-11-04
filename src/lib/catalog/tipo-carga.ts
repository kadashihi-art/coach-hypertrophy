/**
 * Tipo de carga por exercício: deixa claro se o kg é por halter, total com a barra, total ou por lado
 * (máquinas de anilha) ou na pilha (polia e máquina de pino).
 *
 * Segue o jeito como o app já calcula e grava a carga (sem reinterpretar o histórico):
 * barra = total com a barra; halter = por halter; máquina = o que se coloca/lê nela; polia = pilha.
 * A alternância (total ↔ por lado / por halter ↔ total) é só na tela: o valor gravado não muda.
 */
import type { Exercicio } from "@/lib/domain";

export type TipoCarga =
  | "por_halter"
  | "barra_total"
  | "anilhas_total"
  | "smith_total"
  | "pilha"
  | "por_kettlebell"
  | "corporal"
  | "elastico";

/** Máquinas de anilha (carregadas com anilhas): o kg gravado é o total de anilhas. */
export const MAQUINAS_ANILHA = new Set([
  "leg_press",
  "leg_press_45",
  "leg_press_articulado",
  "leg_press_unilateral",
  "hack_squat",
  "hack_squat_articulado",
  "panturrilha_leg_press",
  "panturrilha_sentado",
  "supino_reto_articulado",
  "puxada_articulada",
  "remada_apoiada_peito",
  "hip_thrust_maquina",
]);

/** Exercícios de barra olímpica (20 kg): dá para ver por lado, sem a barra. */
export const BARRA_OLIMPICA = new Set([
  "agachamento_barra",
  "agachamento_frontal",
  "supino_reto_convencional",
  "supino_inclinado_barra",
  "supino_fechado",
  "remada_curvada",
  "remada_curvada_supinada",
  "stiff_rdl",
  "hip_thrust",
  "desenvolvimento_barra",
  "bom_dia",
]);
export const PESO_BARRA_OLIMPICA_KG = 20;

/** Exercícios com um halter só (o total é o próprio halter: sem alternância). */
export const UM_HALTER = new Set([
  "agachamento_goblet",
  "agachamento_sumo",
  "agachamento_sumo_adutores",
  "triceps_halteres",
  "rosca_concentrada",
  "remada_halteres",
  "rdl_unilateral",
]);

/** Casos em que o padrão depende da academia (avisados no relatório e testados no smoke). */
export const AMBIGUOS: Record<string, string> = {
  leg_press_horizontal: "Leg press horizontal costuma ser de pino (pilha); em algumas academias é de anilha.",
  panturrilha_pe: "Panturrilha em pé costuma ser de pino (pilha); pode ser de anilha.",
  panturrilha_sentado: "Panturrilha sentado costuma ser de anilha; pode ser de pino.",
  remada_apoiada_peito: "Remada apoiada no peito costuma ser de anilha; pode ser de pino.",
  puxada_articulada: "Puxada articulada costuma ser de anilha; pode ser de pino.",
  hip_thrust_maquina: "Hip thrust na máquina pode ser de anilha ou de pino.",
  remada_cavalinho: "Remada cavalinho: total com a barra; algumas pessoas contam só as anilhas.",
  rosca_direta: "Rosca direta: barra reta, W ou fixa (peso da barra varia), sem ver por lado.",
};

type ExCarga = Pick<Exercicio, "id" | "equipamento"> & Partial<Pick<Exercicio, "unilateral">>;

export function tipoCarga(ex: ExCarga): TipoCarga {
  if (MAQUINAS_ANILHA.has(ex.id)) return "anilhas_total";
  if (ex.id.includes("smith")) return "smith_total";
  switch (ex.equipamento) {
    case "halteres":
      return "por_halter";
    case "barra":
      return "barra_total";
    case "cabo":
    case "maquina":
      return "pilha";
    case "kettlebell":
      return "por_kettlebell";
    case "peso_corporal":
      return "corporal";
    case "elastico":
      return "elastico";
    default:
      return "barra_total";
  }
}

const ROTULO: Record<TipoCarga, string> = {
  por_halter: "por halter",
  barra_total: "total com a barra",
  anilhas_total: "total",
  smith_total: "total no Smith",
  pilha: "na pilha",
  por_kettlebell: "por kettlebell",
  corporal: "de carga extra",
  elastico: "",
};

/** Alternativa de exibição (só na tela), quando faz sentido para o exercício. */
export type Alternativa = { rotulo: string; converter: (kg: number) => number | null };

export function alternativaCarga(ex: ExCarga): Alternativa | null {
  const t = tipoCarga(ex);
  if (t === "anilhas_total") return { rotulo: "por lado", converter: (kg) => kg / 2 };
  if (t === "por_halter" && !UM_HALTER.has(ex.id) && !ex.unilateral)
    return { rotulo: "total (2 halteres)", converter: (kg) => kg * 2 };
  if (t === "barra_total" && BARRA_OLIMPICA.has(ex.id))
    return {
      rotulo: `por lado (sem a barra de ${PESO_BARRA_OLIMPICA_KG} kg)`,
      converter: (kg) => (kg >= PESO_BARRA_OLIMPICA_KG ? (kg - PESO_BARRA_OLIMPICA_KG) / 2 : null),
    };
  return null;
}

export const fmtNum = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

/** Rótulo curto do tipo de carga ("por halter", "na pilha"...), no modo de exibição pedido. */
export function rotuloCarga(ex: ExCarga | null | undefined, alternado = false): string {
  if (!ex) return "";
  const alt = alternado ? alternativaCarga(ex) : null;
  return alt ? alt.rotulo : ROTULO[tipoCarga(ex)];
}

/**
 * "40 kg por halter" / "80 kg total com a barra" / "30 kg por lado" (alternado).
 * Sem exercício conhecido: só "40 kg". Gravado nunca muda: só a exibição.
 */
export function textoCarga(kg: number, ex: ExCarga | null | undefined, alternado = false): string {
  if (!ex) return `${fmtNum(kg)} kg`;
  if (tipoCarga(ex) === "corporal" && kg === 0) return "peso do corpo";
  const alt = alternado ? alternativaCarga(ex) : null;
  const v = alt ? alt.converter(kg) : kg;
  if (alt && v != null) return `${fmtNum(v)} kg ${alt.rotulo}`;
  const r = ROTULO[tipoCarga(ex)];
  return r ? `${fmtNum(kg)} kg ${r}` : `${fmtNum(kg)} kg`;
}
