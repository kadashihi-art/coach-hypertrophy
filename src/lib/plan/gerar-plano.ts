/**
 * Motor determinístico de geração de plano a partir do Perfil (P1).
 * Números vêm daqui; IA só explica. Brief T1/F1 · volume 10–20.
 * research-brief: volume semanal norte (Schoenfeld 10+); split = meio.
 * research-jayme C1/C5: ~8–14→10–20; padrões H/V + joelho/quadril.
 */
import type {
  Divisao,
  Equipamento,
  EstadoExercicio,
  Exercicio,
  GrupoMuscular,
  Objetivo,
  Padrao,
  Perfil,
  Plano,
  Prescricao,
  Sessao,
  VolumeSemanal,
  TipoDia,
  FasePlano,
} from "@/lib/domain";
import { posicionarDescanso, microcicloTexto } from "./estrutura";
import { derivarRacional } from "./racional";
import { findAlt } from "./alternativa";
import { PARQ_BLOQUEIO_MSG, parqBloqueiaPrescricao } from "./parq";

export type PlanoGerado = {
  plano: Plano;
  sessoes: Sessao[];
  estados: EstadoExercicio[];
  volumes_semanais: VolumeSemanal[];
};

export type RestricaoKey = "ombro" | "lombar" | "joelho" | "punho";

type Slot = {
  padrao: Padrao;
  composto?: boolean;
  /** Prefer these ids when available & allowed */
  prefer?: string[];
  /** Soft priority: higher first among same padrao */
  preferEquip?: Equipamento[];
};

type SessaoTemplate = {
  id: string;
  nome: string;
  slots: Slot[];
};

type ObjetivoParams = {
  setsMajor: number; // weekly target for major groups
  setsMinor: number;
  faixaComp: [number, number];
  faixaIso: [number, number];
  rir: number;
  descansoComp: number;
  descansoIso: number;
};

export function parseRestricoes(restricoes: string[]): Set<RestricaoKey> {
  const out = new Set<RestricaoKey>();
  const keys: RestricaoKey[] = ["ombro", "lombar", "joelho", "punho"];
  for (const raw of restricoes) {
    const s = raw.toLowerCase();
    for (const k of keys) {
      if (s.includes(k)) out.add(k);
    }
  }
  return out;
}

function objetivoParams(obj: Objetivo): ObjetivoParams {
  switch (obj) {
    case "forca":
      return {
        setsMajor: 10,
        setsMinor: 8,
        faixaComp: [3, 6],
        faixaIso: [6, 10],
        rir: 1,
        descansoComp: 180,
        descansoIso: 120,
      };
    case "recomposicao":
      return {
        setsMajor: 12,
        setsMinor: 10,
        faixaComp: [6, 12],
        faixaIso: [8, 12],
        rir: 2,
        descansoComp: 150,
        descansoIso: 90,
      };
    case "saude":
      return {
        setsMajor: 10,
        setsMinor: 8,
        faixaComp: [8, 15],
        faixaIso: [10, 15],
        rir: 3,
        descansoComp: 120,
        descansoIso: 75,
      };
    case "hipertrofia":
    default:
      return {
        setsMajor: 14,
        setsMinor: 12,
        faixaComp: [8, 12],
        faixaIso: [10, 15],
        rir: 2,
        descansoComp: 150,
        descansoIso: 90,
      };
  }
}

function escolherDivisao(dias: number): { divisao: Divisao; templates: SessaoTemplate[]; why: string } {
  if (dias <= 2) {
    return {
      divisao: "full_body",
      why: "2 dias → Full Body (A/B) para frequências altas com pouco tempo de semana",
      templates: [
        { id: "sess-fb-a", nome: "Full Body A", slots: fbSlots("a") },
        { id: "sess-fb-b", nome: "Full Body B", slots: fbSlots("b") },
      ],
    };
  }
  if (dias === 3) {
    return {
      divisao: "full_body",
      why: "3 dias → Full Body (A/B/C) para ~2–3× frequência por grupo",
      templates: [
        { id: "sess-fb-a", nome: "Full Body A", slots: fbSlots("a") },
        { id: "sess-fb-b", nome: "Full Body B", slots: fbSlots("b") },
        { id: "sess-fb-c", nome: "Full Body C", slots: fbSlots("c") },
      ],
    };
  }
  if (dias === 4) {
    return {
      divisao: "upper_lower",
      why: "4 dias → Upper/Lower (Upper A/Lower A/Upper B/Lower B) com frequência 2×",
      templates: [
        { id: "sess-upper-a", nome: "Upper A", slots: upperSlots("a") },
        { id: "sess-lower-a", nome: "Lower A", slots: lowerSlots("a") },
        { id: "sess-upper-b", nome: "Upper B", slots: upperSlots("b") },
        { id: "sess-lower-b", nome: "Lower B", slots: lowerSlots("b") },
      ],
    };
  }
  if (dias === 5) {
    return {
      divisao: "ppl",
      why: "5 dias → Push/Pull/Legs (Push/Pull/Legs/Push/Pull) para volume semanal na faixa sem sessões longas",
      templates: [
        { id: "sess-push-a", nome: "Push A", slots: pushSlots("a") },
        { id: "sess-pull-a", nome: "Pull A", slots: pullSlots("a") },
        { id: "sess-legs-a", nome: "Legs A", slots: legsSlots("a") },
        { id: "sess-push-b", nome: "Push B", slots: pushSlots("b") },
        { id: "sess-pull-b", nome: "Pull B", slots: pullSlots("b") },
      ],
    };
  }
  return {
    divisao: "ppl",
    why: "6 dias → Push/Pull/Legs ×2 para frequência alta e volume distribuído",
    templates: [
      { id: "sess-push-a", nome: "Push A", slots: pushSlots("a") },
      { id: "sess-pull-a", nome: "Pull A", slots: pullSlots("a") },
      { id: "sess-legs-a", nome: "Legs A", slots: legsSlots("a") },
      { id: "sess-push-b", nome: "Push B", slots: pushSlots("b") },
      { id: "sess-pull-b", nome: "Pull B", slots: pullSlots("b") },
      { id: "sess-legs-b", nome: "Legs B", slots: legsSlots("b") },
    ],
  };
}


export type EstiloSplit = "auto" | "full_body" | "upper_lower" | "ppl" | "hibrido_ppl_ul" | "hibrido_fb_ul";

export const NOME_ESTILO: Record<EstiloSplit, string> = {
  auto: "Coach escolhe",
  full_body: "Full Body",
  upper_lower: "Upper/Lower",
  ppl: "Push/Pull/Legs",
  hibrido_ppl_ul: "Híbrido PPL + Upper/Lower",
  hibrido_fb_ul: "Híbrido Full Body + Upper/Lower",
};

function tipoDoTemplate(id: string): TipoDia {
  if (id.includes("-push")) return "push";
  if (id.includes("-pull")) return "pull";
  if (id.includes("-legs")) return "legs";
  if (id.includes("-upper")) return "upper";
  if (id.includes("-lower")) return "lower";
  return "full";
}

function mkTpl(kind: "fb" | "upper" | "lower" | "push" | "pull" | "legs", n: number): SessaoTemplate {
  const v = (["a", "b", "c"] as const)[kind === "fb" ? n % 3 : n % 2];
  const rep = kind === "fb" ? Math.floor(n / 3) : Math.floor(n / 2);
  const suffix = rep > 0 ? String(rep + 1) : "";
  const label = { fb: "Full Body", upper: "Upper", lower: "Lower", push: "Push", pull: "Pull", legs: "Legs" }[kind];
  const slots =
    kind === "fb" ? fbSlots(v) :
    kind === "upper" ? upperSlots(v as "a" | "b") :
    kind === "lower" ? lowerSlots(v as "a" | "b") :
    kind === "push" ? pushSlots(v as "a" | "b") :
    kind === "pull" ? pullSlots(v as "a" | "b") : legsSlots(v as "a" | "b");
  return { id: `sess-${kind}-${v}${suffix}`, nome: `${label} ${v.toUpperCase()}${suffix}`, slots };
}

function seq(kinds: Array<"fb" | "upper" | "lower" | "push" | "pull" | "legs">): SessaoTemplate[] {
  const count: Record<string, number> = {};
  return kinds.map((k) => {
    const n = count[k] ?? 0;
    count[k] = n + 1;
    return mkTpl(k, n);
  });
}

/** Templates por estilo escolhido (auto = escolherDivisao legado). Determinístico. */
export function templatesPorEstilo(
  estilo: EstiloSplit,
  diasPerfil: number,
): { divisao: Divisao; templates: SessaoTemplate[]; why: string; estilo: EstiloSplit } {
  const dias = Math.min(6, Math.max(2, diasPerfil));
  if (estilo === "auto") {
    const r = escolherDivisao(dias);
    const e: EstiloSplit = r.divisao === "full_body" ? "full_body" : r.divisao === "upper_lower" ? "upper_lower" : "ppl";
    return { ...r, estilo: e };
  }
  if (estilo === "full_body") {
    const k = Array.from({ length: dias }, () => "fb" as const);
    return { divisao: "full_body", estilo, templates: seq(k), why: `escolha do usuário: Full Body em ${dias} dias (cada grupo ~${dias}×/semana, volume diluído por sessão)` };
  }
  if (estilo === "upper_lower") {
    const k = Array.from({ length: dias }, (_, i) => (i % 2 === 0 ? "upper" : "lower") as "upper" | "lower");
    return { divisao: "upper_lower", estilo, templates: seq(k), why: `escolha do usuário: Upper/Lower em ${dias} dias (cada grupo ~${Math.floor(dias / 2)}–${Math.ceil(dias / 2)}×/semana)` };
  }
  if (estilo === "ppl") {
    const n = Math.max(3, dias);
    const base = ["push", "pull", "legs"] as const;
    const k = Array.from({ length: n }, (_, i) => base[i % 3]);
    return { divisao: "ppl", estilo, templates: seq([...k]), why: `escolha do usuário: PPL em ${n} dias${n < 6 ? " (alguns grupos só 1×/semana — PPL rende mais com 6 dias)" : " (PPL ×2 = cada grupo 2×/semana)"}` };
  }
  if (estilo === "hibrido_ppl_ul") {
    const k: Array<"fb" | "upper" | "lower" | "push" | "pull" | "legs"> = ["push", "pull", "legs", "upper", "lower"];
    if (dias >= 6) k.push("fb");
    return {
      divisao: "ppl_upper_lower",
      estilo,
      templates: seq(k),
      why: `escolha do usuário: híbrido PPL (3 dias) + Upper/Lower (2 dias)${dias >= 6 ? " + Full Body" : ""} — cada grande grupo ~2×/semana com sessões curtas e foco em PPL no início da semana${dias < 5 ? ` (precisa de ${k.length} treinos; perfil tinha ${dias} dias)` : ""}`,
    };
  }
  // hibrido_fb_ul
  const k = (["fb", "upper", "lower", "fb", "upper", "lower"] as const).slice(0, Math.max(3, dias));
  return {
    divisao: "hibrido",
    estilo,
    templates: seq([...k]),
    why: `escolha do usuário: híbrido Full Body + Upper/Lower em ${k.length} dias — frequência ~2×/semana por grupo com variação de estímulo`,
  };
}

function fbSlots(variant: "a" | "b" | "c"): Slot[] {
  if (variant === "a") {
    return [
      { padrao: "agachamento", composto: true, prefer: ["agachamento_barra", "hack_squat", "leg_press", "agachamento_goblet", "afundo_bulgaro"] },
      { padrao: "empurrar_horizontal", composto: true, prefer: ["supino_reto_convencional", "supino_halteres", "supino_maquina"] },
      { padrao: "puxar_horizontal", composto: true, prefer: ["remada_curvada", "remada_maquina", "remada_halteres", "remada_cabo"] },
      { padrao: "dobradica_quadril", composto: true, prefer: ["stiff_rdl", "rdl_halteres", "hip_thrust", "hip_thrust_maquina", "mesa_flexora"] },
      { padrao: "abducao_ombro", prefer: ["elevacao_lateral", "elevacao_lateral_cabo", "face_pull"] },
      { padrao: "flexao_cotovelo", prefer: ["rosca_direta", "rosca_martelo", "rosca_cabo"] },
      { padrao: "extensao_cotovelo", prefer: ["triceps_corda", "triceps_maquina", "triceps_halteres", "triceps_testa"] },
    ];
  }
  if (variant === "b") {
    return [
      { padrao: "agachamento", composto: true, prefer: ["hack_squat", "leg_press", "agachamento_goblet", "afundo_bulgaro", "agachamento_barra"] },
      { padrao: "puxar_vertical", composto: true, prefer: ["puxada_frontal", "puxada_neutra", "barra_fixixa"] },
      { padrao: "empurrar_inclinado", composto: true, prefer: ["supino_inclinado_halteres", "supino_halteres"] },
      { padrao: "dobradica_quadril", composto: true, prefer: ["hip_thrust", "hip_thrust_maquina", "rdl_halteres", "stiff_rdl", "ponte_gluteo", "mesa_flexora"] },
      { padrao: "empurrar_vertical", composto: true, prefer: ["desenvolvimento_maquina", "desenvolvimento_halteres"] },
      { padrao: "flexao_joelho", prefer: ["mesa_flexora"] },
      { padrao: "flexao_plantar", prefer: ["panturrilha_pe", "panturrilha_sentado"] },
    ];
  }
  return [
    { padrao: "agachamento", composto: true, prefer: ["agachamento_goblet", "afundo_bulgaro", "hack_squat", "leg_press", "agachamento_barra"] },
    { padrao: "empurrar_horizontal", composto: true, prefer: ["supino_halteres", "supino_maquina", "supino_reto_convencional", "flexao_solo"] },
    { padrao: "puxar_horizontal", composto: true, prefer: ["remada_maquina", "remada_halteres", "remada_cabo", "remada_curvada"] },
    { padrao: "extensao_joelho", prefer: ["cadeira_extensora"] },
    { padrao: "puxar_vertical", composto: true, prefer: ["puxada_neutra", "puxada_frontal", "barra_fixixa"] },
    { padrao: "abducao_ombro", prefer: ["elevacao_lateral", "elevacao_lateral_cabo", "face_pull"] },
    { padrao: "extensao_cotovelo", prefer: ["triceps_halteres", "triceps_maquina", "triceps_testa", "triceps_corda"] },
  ];
}

function upperSlots(variant: "a" | "b"): Slot[] {
  if (variant === "a") {
    return [
      { padrao: "empurrar_horizontal", composto: true, prefer: ["supino_reto_convencional", "supino_halteres", "supino_maquina"] },
      { padrao: "puxar_horizontal", composto: true, prefer: ["remada_curvada", "remada_maquina", "remada_halteres", "remada_cabo"] },
      { padrao: "puxar_vertical", composto: true, prefer: ["puxada_frontal", "puxada_neutra", "barra_fixixa"] },
      { padrao: "empurrar_horizontal", prefer: ["crucifixo_cabo", "pec_deck", "supino_halteres"] },
      { padrao: "abducao_ombro", prefer: ["elevacao_lateral", "elevacao_lateral_cabo", "face_pull"] },
      { padrao: "extensao_cotovelo", prefer: ["triceps_corda", "triceps_maquina", "triceps_halteres", "triceps_testa"] },
      { padrao: "flexao_cotovelo", prefer: ["rosca_direta", "rosca_martelo", "rosca_cabo"] },
    ];
  }
  return [
    { padrao: "empurrar_inclinado", composto: true, prefer: ["supino_inclinado_halteres", "supino_halteres"] },
    { padrao: "puxar_vertical", composto: true, prefer: ["puxada_neutra", "puxada_frontal", "barra_fixixa"] },
    { padrao: "puxar_horizontal", composto: true, prefer: ["remada_maquina", "remada_halteres", "remada_cabo", "remada_curvada"] },
    { padrao: "empurrar_vertical", composto: true, prefer: ["desenvolvimento_maquina", "desenvolvimento_halteres"] },
    { padrao: "abducao_ombro", prefer: ["elevacao_lateral", "elevacao_lateral_cabo", "face_pull"] },
    { padrao: "flexao_cotovelo", prefer: ["rosca_martelo", "rosca_cabo", "rosca_direta"] },
    { padrao: "extensao_cotovelo", prefer: ["triceps_halteres", "triceps_maquina", "triceps_testa", "triceps_corda"] },
  ];
}

function lowerSlots(variant: "a" | "b"): Slot[] {
  if (variant === "a") {
    return [
      { padrao: "agachamento", composto: true, prefer: ["agachamento_barra", "hack_squat", "leg_press", "agachamento_goblet", "afundo_bulgaro"] },
      { padrao: "dobradica_quadril", composto: true, prefer: ["stiff_rdl", "rdl_halteres", "hip_thrust", "hip_thrust_maquina", "mesa_flexora"] },
      { padrao: "extensao_joelho", prefer: ["cadeira_extensora"] },
      { padrao: "flexao_joelho", prefer: ["mesa_flexora"] },
      { padrao: "flexao_plantar", prefer: ["panturrilha_pe", "panturrilha_sentado"] },
    ];
  }
  return [
    { padrao: "agachamento", composto: true, prefer: ["hack_squat", "leg_press", "agachamento_goblet", "afundo_bulgaro", "agachamento_barra"] },
    { padrao: "dobradica_quadril", composto: true, prefer: ["hip_thrust", "hip_thrust_maquina", "rdl_halteres", "stiff_rdl", "ponte_gluteo", "mesa_flexora"] },
    { padrao: "agachamento", composto: true, prefer: ["agachamento_goblet", "afundo_bulgaro", "leg_press"] },
    { padrao: "flexao_joelho", prefer: ["mesa_flexora"] },
    { padrao: "flexao_plantar", prefer: ["panturrilha_sentado", "panturrilha_pe"] },
  ];
}

function pushSlots(variant: "a" | "b"): Slot[] {
  if (variant === "a") {
    return [
      { padrao: "empurrar_horizontal", composto: true, prefer: ["supino_reto_convencional", "supino_halteres", "supino_maquina"] },
      { padrao: "empurrar_inclinado", composto: true, prefer: ["supino_inclinado_halteres"] },
      { padrao: "empurrar_vertical", composto: true, prefer: ["desenvolvimento_maquina", "desenvolvimento_halteres"] },
      { padrao: "abducao_ombro", prefer: ["elevacao_lateral", "elevacao_lateral_cabo", "face_pull"] },
      { padrao: "extensao_cotovelo", prefer: ["triceps_corda", "triceps_maquina", "triceps_halteres", "triceps_testa"] },
      { padrao: "empurrar_horizontal", prefer: ["crucifixo_cabo", "pec_deck", "supino_halteres"] },
    ];
  }
  return [
    { padrao: "empurrar_inclinado", composto: true, prefer: ["supino_inclinado_halteres", "supino_halteres"] },
    { padrao: "empurrar_horizontal", composto: true, prefer: ["supino_halteres", "supino_maquina", "supino_reto_convencional", "flexao_solo"] },
    { padrao: "abducao_ombro", prefer: ["elevacao_lateral", "elevacao_lateral_cabo", "face_pull"] },
    { padrao: "extensao_cotovelo", prefer: ["triceps_halteres", "triceps_maquina", "triceps_testa", "triceps_corda"] },
    { padrao: "empurrar_vertical", composto: true, prefer: ["desenvolvimento_maquina", "desenvolvimento_halteres"] },
  ];
}

function pullSlots(variant: "a" | "b"): Slot[] {
  if (variant === "a") {
    return [
      { padrao: "puxar_vertical", composto: true, prefer: ["puxada_frontal", "puxada_neutra", "barra_fixixa"] },
      { padrao: "puxar_horizontal", composto: true, prefer: ["remada_curvada", "remada_maquina", "remada_halteres", "remada_cabo"] },
      { padrao: "puxar_horizontal", composto: true, prefer: ["remada_maquina", "remada_halteres", "remada_cabo", "remada_curvada"] },
      { padrao: "flexao_cotovelo", prefer: ["rosca_direta", "rosca_martelo", "rosca_cabo"] },
      { padrao: "flexao_cotovelo", prefer: ["rosca_martelo", "rosca_cabo", "rosca_direta"] },
    ];
  }
  return [
    { padrao: "puxar_horizontal", composto: true, prefer: ["remada_maquina", "remada_halteres", "remada_cabo", "remada_curvada"] },
    { padrao: "puxar_vertical", composto: true, prefer: ["puxada_neutra", "puxada_frontal", "barra_fixixa"] },
    { padrao: "puxar_vertical", composto: true, prefer: ["puxada_frontal", "puxada_neutra", "barra_fixixa"] },
    { padrao: "flexao_cotovelo", prefer: ["rosca_martelo", "rosca_cabo", "rosca_direta"] },
  ];
}

function legsSlots(variant: "a" | "b"): Slot[] {
  if (variant === "a") {
    return [
      { padrao: "agachamento", composto: true, prefer: ["agachamento_barra", "hack_squat", "leg_press", "agachamento_goblet", "afundo_bulgaro"] },
      { padrao: "dobradica_quadril", composto: true, prefer: ["stiff_rdl", "rdl_halteres", "hip_thrust", "hip_thrust_maquina", "mesa_flexora"] },
      { padrao: "extensao_joelho", prefer: ["cadeira_extensora"] },
      { padrao: "flexao_joelho", prefer: ["mesa_flexora"] },
      { padrao: "flexao_plantar", prefer: ["panturrilha_pe", "panturrilha_sentado"] },
    ];
  }
  return [
    { padrao: "agachamento", composto: true, prefer: ["hack_squat", "leg_press", "agachamento_goblet", "afundo_bulgaro"] },
    { padrao: "dobradica_quadril", composto: true, prefer: ["hip_thrust", "hip_thrust_maquina", "rdl_halteres", "stiff_rdl", "ponte_gluteo", "mesa_flexora"] },
    { padrao: "agachamento", prefer: ["agachamento_goblet", "afundo_bulgaro", "leg_press"] },
    { padrao: "flexao_plantar", prefer: ["panturrilha_sentado", "panturrilha_pe"] },
  ];
}

/** Exercises banned outright for a restriction (id match). */
const BAN_IDS: Record<RestricaoKey, string[]> = {
  ombro: [],
  lombar: ["remada_curvada", "stiff_rdl", "rdl_halteres", "agachamento_barra"],
  joelho: ["agachamento_barra", "afundo_bulgaro"],
  punho: [],
};

/** Patterns skipped / demoted under restriction */
export function patternBlocked(padrao: Padrao, r: Set<RestricaoKey>): boolean {
  if (r.has("ombro") && (padrao === "empurrar_vertical" || padrao === "flexao_ombro")) {
    return true; // skip vertical press for shoulder injury
  }
  return false;
}

export function exerciseAllowed(
  ex: Exercicio,
  equips: Set<string>,
  restr: Set<RestricaoKey>,
): boolean {
  if (!equips.has(ex.equipamento)) return false;
  for (const k of restr) {
    if (BAN_IDS[k].includes(ex.id)) return false;
  }
  // ombro: skip aggressive lateral? keep light elevacao_lateral but demote vertical
  if (restr.has("ombro") && ex.padrao === "empurrar_vertical") return false;
  // punho: prefer máquina/cabo — soft filter applied in scoring, still allow
  return true;
}

function scoreExercise(
  ex: Exercicio,
  slot: Slot,
  equips: Set<string>,
  restr: Set<RestricaoKey>,
  used: Set<string>,
): number {
  if (used.has(ex.id)) return -1000;
  if (!exerciseAllowed(ex, equips, restr)) return -1000;
  if (ex.padrao !== slot.padrao) return -1000;
  if (patternBlocked(ex.padrao, restr)) return -1000;

  let score = 10;
  if (slot.prefer) {
    const idx = slot.prefer.indexOf(ex.id);
    if (idx >= 0) score += 50 - idx * 5;
  }
  if (slot.composto != null) {
    if (ex.composto === slot.composto) score += 5;
  }
  // Equipment preference order
  const prefOrder: Equipamento[] = slot.preferEquip ?? [
    "maquina",
    "halteres",
    "cabo",
    "barra",
    "peso_corporal",
  ];
  if (restr.has("punho")) {
    // prefer máquina/cabo over barra
    if (ex.equipamento === "maquina" || ex.equipamento === "cabo") score += 15;
    if (ex.equipamento === "barra") score -= 20;
  }
  if (restr.has("ombro") && ex.padrao === "abducao_ombro") {
    score -= 5; // keep but not prioritize volume
  }
  if (restr.has("lombar") && ex.id === "hip_thrust") score += 20;
  if (restr.has("lombar") && ex.id === "leg_press") score += 15;
  if (restr.has("joelho") && (ex.id === "leg_press" || ex.id === "cadeira_extensora")) score += 20;

  const ei = prefOrder.indexOf(ex.equipamento);
  if (ei >= 0) score += (prefOrder.length - ei);

  return score;
}

const FALLBACK_PADROES: Partial<Record<Padrao, Padrao[]>> = {
  dobradica_quadril: ["flexao_joelho"],
  agachamento: ["extensao_joelho"],
  empurrar_vertical: ["abducao_ombro"],
  puxar_vertical: ["puxar_horizontal"],
  empurrar_inclinado: ["empurrar_horizontal"],
  extensao_cotovelo: [],
  flexao_cotovelo: [],
};

function pickForSlot(
  slot: Slot,
  catalog: Exercicio[],
  equips: Set<string>,
  restr: Set<RestricaoKey>,
  used: Set<string>,
): Exercicio | null {
  const tryPadroes: Padrao[] = [slot.padrao, ...(FALLBACK_PADROES[slot.padrao] ?? [])];
  for (const padrao of tryPadroes) {
    if (patternBlocked(padrao, restr)) continue;
    const trySlot: Slot = { ...slot, padrao };
    let best: Exercicio | null = null;
    let bestScore = 0;
    for (const ex of catalog) {
      const s = scoreExercise(ex, trySlot, equips, restr, used);
      if (s > bestScore) {
        bestScore = s;
        best = ex;
      }
    }
    if (best) return best;
  }
  return null;
}

function targetExercisesPerSession(minutos: number, experiencia: Perfil["experiencia"]): number {
  let n: number;
  if (minutos <= 40) n = 5;
  else if (minutos <= 50) n = 6;
  else if (minutos <= 70) n = 7;
  else n = 8;
  if (experiencia === "iniciante") n = Math.max(4, n - 1);
  if (experiencia === "avancado" && minutos >= 75) n = Math.min(9, n + 1);
  return n;
}

function setsPerExercise(
  obj: ObjetivoParams,
  composto: boolean,
  dias: number,
  experiencia: Perfil["experiencia"],
  cardioHigh: boolean,
): number {
  // Aim for weekly major ~obj.setsMajor across frequency
  const freq = Math.max(1, Math.round(dias / (dias <= 3 ? 1 : 2))); // rough
  const weekly = composto ? obj.setsMajor : obj.setsMinor;
  let per = Math.round(weekly / Math.max(2, Math.min(freq + 1, dias)));
  per = Math.max(2, Math.min(4, per));
  if (experiencia === "iniciante") per = Math.max(2, per - (composto ? 0 : 1));
  if (cardioHigh) per = Math.max(2, per - (composto ? 0 : 1));
  if (obj.setsMajor <= 10 && composto) per = Math.min(per, 3);
  return per;
}

/** R12-ish conservative load from bodyweight × pattern × experience */
export function estimarCargaKg(
  peso_kg: number,
  experiencia: Perfil["experiencia"],
  padrao: Padrao,
  composto: boolean,
  equipamento: Equipamento,
): number {
  const expMul =
    experiencia === "iniciante" ? 0.55 : experiencia === "avancado" ? 0.85 : 0.7;

  const patternFactor: Partial<Record<Padrao, number>> = {
    agachamento: 0.9,
    dobradica_quadril: 0.75,
    empurrar_horizontal: 0.55,
    empurrar_inclinado: 0.45,
    empurrar_vertical: 0.35,
    puxar_horizontal: 0.55,
    puxar_vertical: 0.5,
    extensao_joelho: 0.4,
    flexao_joelho: 0.35,
    flexao_plantar: 0.55,
    abducao_ombro: 0.12,
    flexao_cotovelo: 0.22,
    extensao_cotovelo: 0.2,
  };

  let f = patternFactor[padrao] ?? (composto ? 0.4 : 0.2);
  if (equipamento === "halteres" && composto) f *= 0.45; // per dumbbell approx
  if (equipamento === "maquina" && padrao === "agachamento") f *= 1.6; // leg press stack
  if (equipamento === "cabo" && !composto) f *= 0.9;

  let kg = peso_kg * f * expMul;
  // Round to 2.5
  kg = Math.round(kg / 2.5) * 2.5;
  return Math.max(2.5, kg);
}


function estimateDurationMin(prescs: Prescricao[]): number {
  let sec = 0;
  for (const p of prescs) {
    sec += p.series * (p.descanso_seg + 45);
  }
  return Math.max(20, Math.round(sec / 60));
}

function buildJustificativa(args: {
  whyDiv: string;
  divisao: Divisao;
  dias: number;
  objetivo: Objetivo;
  params: ObjetivoParams;
  equips: string[];
  restr: Set<RestricaoKey>;
  omitted: string[];
  cardio: number;
  experiencia: string;
}): string {
  const parts: string[] = [];
  parts.push(
    `${args.divisao.replace(/_/g, " ")} em ${args.dias} dias: ${args.whyDiv}.`,
  );
  parts.push(
    `Objetivo ${args.objetivo}: alvo ~${args.params.setsMajor} séries/semana nos grupos principais (faixa 10–20), reps ${args.params.faixaComp[0]}–${args.params.faixaComp[1]} (compostos) / ${args.params.faixaIso[0]}–${args.params.faixaIso[1]} (isolamentos), RIR ${args.params.rir}.`,
  );
  parts.push(
    `Equipamentos filtrados: ${args.equips.length ? args.equips.join(", ") : "nenhum marcado"} — só exercícios compatíveis.`,
  );
  if (args.restr.size) {
    const r = [...args.restr].join(", ");
    parts.push(
      `Restrições (${r}): padrões/exercícios omitidos ou substituídos${
        args.omitted.length ? ` (${args.omitted.slice(0, 6).join(", ")}${args.omitted.length > 6 ? "…" : ""})` : ""
      }.`,
    );
  } else {
    parts.push("Sem restrições articulares marcadas.");
  }
  if (args.cardio > 120) {
    parts.push(
      `Cardio ${args.cardio} min/semana (>120): volume de força levemente reduzido para caber recuperação.`,
    );
  }
  parts.push(
    `Experiência ${args.experiencia}: cargas iniciais conservadoras (estimativa) e primeira_sessao=true para calibrar.`,
  );
  return parts.join(" ");
}

/**
 * Gera plano + sessões + estados + volumes projetados a partir do perfil.
 * Determinístico para o mesmo perfil+catálogo (exceto id do plano com Date.now).
 */
export function gerarPlanoFromPerfil(
  perfil: Perfil,
  catalog: Exercicio[],
): PlanoGerado {
  if (parqBloqueiaPrescricao(perfil)) {
    throw new Error(PARQ_BLOQUEIO_MSG);
  }
  const agora = new Date().toISOString();
  const diasPerfil = Math.min(6, Math.max(2, perfil.dias_por_semana));
  const estilo1: EstiloSplit = perfil.estilo_split ?? "auto";
  const fase1 = templatesPorEstilo(estilo1, diasPerfil);
  const fase2 = perfil.fase2_estilo ? templatesPorEstilo(perfil.fase2_estilo, diasPerfil) : null;
  const sem1 = fase2 ? perfil.fase1_semanas ?? 4 : 6;
  const sem2 = fase2 ? perfil.fase2_semanas ?? 4 : 0;
  const { divisao, templates: templates1, why } = fase1;
  const dias = templates1.length;
  const faseDefs = [
    { id: "fase-1", prefix: "", nomePrefix: "", def: fase1, semana_inicio: 1, semanas: sem1 },
    ...(fase2 ? [{ id: "fase-2", prefix: "f2-", nomePrefix: "F2 · ", def: fase2, semana_inicio: sem1 + 1, semanas: sem2 }] : []),
  ];
  const templates: Array<SessaoTemplate & { diasFase: number }> = faseDefs.flatMap((f) =>
    f.def.templates.map((t) => ({ ...t, id: `${f.prefix}${t.id}`, nome: `${f.nomePrefix}${t.nome}`, diasFase: f.def.templates.length })),
  );
  const params = objetivoParams(perfil.objetivo);
  const restr = parseRestricoes(perfil.restricoes ?? []);
  const equipsArr = [...(perfil.equipamentos ?? [])];
  // Always allow peso_corporal soft? No — stick to listed. If empty, fall back to common gym.
  const equips = new Set<string>(
    equipsArr.length
      ? equipsArr
      : ["halteres", "maquina", "cabo", "barra", "peso_corporal"],
  );
  const cardioHigh = (perfil.cardio_min_semana ?? 0) > 120;
  const targetN = targetExercisesPerSession(
    perfil.minutos_por_sessao,
    perfil.experiencia,
  );

  // RIR bump for beginners
  let rir = params.rir;
  if (perfil.experiencia === "iniciante") rir = Math.min(4, rir + 1);

  const omittedNotes: string[] = [];
  if (restr.has("ombro")) omittedNotes.push("press vertical / militar");
  if (restr.has("lombar")) omittedNotes.push("remada_curvada, stiff, agachamento_barra");
  if (restr.has("joelho")) omittedNotes.push("agachamento_barra, afundo_bulgaro");
  if (!equips.has("barra")) omittedNotes.push("qualquer exercício de barra");

  const planoId = `plano-${Date.now()}`;
  const sessoes: Sessao[] = [];
  const estadosMap = new Map<string, EstadoExercicio>();
  const weeklyDirect = new Map<GrupoMuscular, number>();
  const weeklyIndirect = new Map<GrupoMuscular, number>();

  templates.forEach((tpl, idx) => {
    const used = new Set<string>();
    const prescricoes: Prescricao[] = [];
    let ordem = 1;

    for (const slot of tpl.slots) {
      if (prescricoes.length >= targetN) break;
      const ex = pickForSlot(slot, catalog, equips, restr, used);
      if (!ex) {
        if (slot.prefer?.[0]) omittedNotes.push(`sem sub para ${slot.prefer[0]}`);
        continue;
      }
      used.add(ex.id);

      const series = setsPerExercise(
        params,
        ex.composto,
        tpl.diasFase,
        perfil.experiencia,
        cardioHigh,
      );
      const faixa = ex.composto ? params.faixaComp : params.faixaIso;
      const descanso = ex.composto ? params.descansoComp : params.descansoIso;
      const carga = estimarCargaKg(
        perfil.peso_kg,
        perfil.experiencia,
        ex.padrao,
        ex.composto,
        ex.equipamento,
      );
      const alt = findAlt(catalog, ex.padrao, equips, ex.id);

      const pid = `presc-${tpl.id}-${ex.id}`;
      prescricoes.push({
        id: pid,
        sessao_id: tpl.id,
        exercicio_id: ex.id,
        padrao: ex.padrao,
        ordem: ordem++,
        series,
        faixa_reps: faixa,
        rir_alvo: rir,
        descanso_seg: descanso,
        cadencia: "2-0-1-0",
        tecnica: ex.composto && perfil.objetivo === "forca" ? "top_set_backoff" : "padrao",
        carga: {
          trabalho_kg: carga,
          top_set_kg: null,
          origem: "estimativa_conservadora",
        },
        alternativa_equipamento_ocupado: alt,
        guia_id: ex.guia_id ?? null,
        evidencia: ex.composto ? "forte" : "moderado",
      });

      if (!estadosMap.has(ex.id)) {
        estadosMap.set(ex.id, {
          exercicio_id: ex.id,
          carga_atual_kg: carga,
          faixa_reps: faixa,
          rir_alvo: rir,
          alvo_proxima_sessao: {
            carga_kg: carga,
            faixa_reps: faixa,
            rir_alvo: rir,
          },
          sessoes_sem_progresso: 0,
          ultima_progressao_em: null,
          e1rm_estimado_kg: Math.round(carga * (1 + faixa[1] / 30) * 10) / 10,
          pr_carga_kg: carga,
          pr_reps: 0,
          origem_carga: "estimativa_conservadora",
          primeira_sessao: true,
          ultimo_top_kg: null,
          ultimo_back_off_kg: null,
          ultimo_rir: null,
          ultima_sessao_em: null,
          atualizado_em: agora,
        });
      }

      weeklyDirect.set(
        ex.grupo_primario,
        (weeklyDirect.get(ex.grupo_primario) ?? 0) + series,
      );
      for (const g of ex.grupos_secundarios) {
        weeklyIndirect.set(g, (weeklyIndirect.get(g) ?? 0) + series);
      }
    }

    const volMap = new Map<GrupoMuscular, number>();
    for (const p of prescricoes) {
      const ex = catalog.find((e) => e.id === p.exercicio_id);
      if (!ex) continue;
      volMap.set(ex.grupo_primario, (volMap.get(ex.grupo_primario) ?? 0) + p.series);
    }

    const grupos = [...volMap.keys()];
    sessoes.push({
      id: tpl.id,
      plano_id: planoId,
      nome: tpl.nome,
      ordem: idx + 1,
      data: null,
      status: "planejada",
      grupos,
      prescricoes,
      volume_por_grupo: [...volMap.entries()].map(([grupo, planejado]) => ({
        grupo,
        planejado,
        realizado: 0,
      })),
      duracao_estimada_min: estimateDurationMin(prescricoes),
      duracao_real_min: null,
    });
  });

  const uniqueOmitted = [...new Set(omittedNotes)];
  const justificativaTexto = buildJustificativa({
    whyDiv: why,
    divisao,
    dias,
    objetivo: perfil.objetivo,
    params,
    equips: equipsArr,
    restr,
    omitted: uniqueOmitted,
    cardio: perfil.cardio_min_semana ?? 0,
    experiencia: perfil.experiencia,
  });

  const plano: Plano = {
    id: planoId,
    perfil_id: perfil.id,
    objetivo: perfil.objetivo,
    divisao,
    dias_por_semana: dias,
    minutos_por_sessao: perfil.minutos_por_sessao,
    mesociclo: {
      total_semanas: sem1 + sem2,
      semana_atual: 1,
      foco: "acumulo",
      data_inicio: null,
    },
    justificativa: {
      texto: justificativaTexto,
      evidencia: "moderado",
    },
    sessoes: sessoes.map((s) => s.id),
    bloqueado: false,
    criado_em: agora,
    schema_version: "1.1.0",
  };

  // Estrutura por fase: microciclo 7 dias com descanso inteligente (determinístico)
  const fases: FasePlano[] = faseDefs.map((f) => {
    const ids = f.def.templates.map((t) => `${f.prefix}${t.id}`);
    const tipos = f.def.templates.map((t) => tipoDoTemplate(t.id));
    const { dias: micro, porque } = posicionarDescanso(tipos, perfil.dias_descanso_fixos ?? []);
    let k = 0;
    return {
      id: f.id,
      nome: faseDefs.length > 1 ? `Fase ${f.id.slice(-1)} · ${NOME_ESTILO[f.def.estilo]}` : NOME_ESTILO[f.def.estilo],
      estilo: f.def.estilo,
      semana_inicio: f.semana_inicio,
      semanas: f.semanas,
      microciclo: micro.map((tipo, dia) => ({ dia, tipo, sessao_id: tipo === "descanso" ? null : ids[k++] ?? null })),
      sessao_ids: ids,
      descanso_porque: [...porque, `Microciclo: ${microcicloTexto(micro)}.`],
    };
  });
  plano.estrutura = { fases };
  plano.racional = derivarRacional({ plano, sessoes, perfil, catalog, whyPorFase: faseDefs.map((f) => f.def.why), fonte: "motor" });

  // Progresso só sobe com registros reais (acumularVolumeSemanal no finishSession).
  void weeklyDirect;
  void weeklyIndirect;

  return {
    plano,
    sessoes,
    estados: [...estadosMap.values()],
    volumes_semanais: [],
  };
}