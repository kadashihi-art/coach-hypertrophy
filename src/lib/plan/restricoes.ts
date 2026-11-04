/**
 * Restrições articulares → o que o motor pode prescrever.
 *
 * Fica separado do gerador para que troca, edição e a alternativa de
 * "equipamento ocupado" usem exatamente a mesma régua do plano salvo.
 */
import type { Exercicio, Padrao } from "@/lib/domain";

export type RestricaoKey = "ombro" | "lombar" | "joelho" | "punho";

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

/** Exercises banned outright for a restriction (id match). */
export const BAN_IDS: Record<RestricaoKey, string[]> = {
  ombro: ["mergulho_paralelas"],
  lombar: [
    "remada_curvada",
    "stiff_rdl",
    "rdl_halteres",
    "rdl_unilateral",
    "bom_dia",
    "agachamento_barra",
  ],
  joelho: ["agachamento_barra", "afundo_bulgaro", "passada_caminhando", "step_up"],
  punho: [],
};

/** Patterns skipped / demoted under restriction */
export function patternBlocked(padrao: Padrao, r: Set<RestricaoKey>): boolean {
  if (r.has("ombro") && (padrao === "empurrar_vertical" || padrao === "flexao_ombro")) {
    return true; // skip vertical press for shoulder injury
  }
  return false;
}

/** `true` quando a restrição bane o exercício (id ou padrão). */
export function restricaoBane(
  ex: Pick<Exercicio, "id" | "padrao">,
  restr: Set<RestricaoKey>,
): boolean {
  if (restr.size === 0) return false;
  if (patternBlocked(ex.padrao, restr)) return true;
  for (const k of restr) {
    if (BAN_IDS[k].includes(ex.id)) return true;
  }
  return false;
}

export function exerciseAllowed(
  ex: Exercicio,
  equips: Set<string>,
  restr: Set<RestricaoKey>,
): boolean {
  if (!equips.has(ex.equipamento)) return false;
  // punho: prefer máquina/cabo — soft filter applied in scoring, still allow
  return !restricaoBane(ex, restr);
}
