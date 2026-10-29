/**
 * Âncora de aquecimento → recalcula cargas das séries restantes.
 * brief-produto-v1 R8 / top_set_backoff (back-off 85–90% do top)
 * research-brief: top set ancora progressão; back-off entrega volume.
 */
import type { GrupoMuscular, Prescricao, Tecnica } from "@/lib/domain";
import { incrementoCargaKg } from "@/lib/domain";

export function roundToStep(kg: number, step: number): number {
  if (step <= 0) return Math.round(kg * 10) / 10;
  return Math.round(kg / step) * step;
}

export type AncoraResult = {
  trabalho_kg: number;
  top_set_kg: number | null;
  back_off_kg: number | null;
  /** Prescrição com carga atualizada (não muta input) */
  prescricao: Prescricao;
};

/**
 * Usuário afirmou carga C no aquecimento → C vira âncora do trabalho/top do dia.
 * Não toca séries já registradas (só a sugestão na prescrição).
 */
export function ancorarCargaDeAquecimento(args: {
  cargaKg: number;
  tecnica: Tecnica | string;
  grupo: GrupoMuscular;
  prescricoesPendentes: Prescricao; // a prescrição atual
}): AncoraResult {
  const step = incrementoCargaKg(args.grupo);
  const C = roundToStep(args.cargaKg, step);
  const isTopBack =
    args.tecnica === "top_set_backoff" ||
    args.tecnica === "top_set" ||
    false;

  const back_off_kg = isTopBack
    ? roundToStep(C * 0.875, step) // midpoint 85–90%
    : null;
  const top_set_kg = isTopBack ? C : null;

  const prescricao: Prescricao = {
    ...args.prescricoesPendentes,
    carga: {
      ...args.prescricoesPendentes.carga,
      trabalho_kg: C,
      top_set_kg,
      origem: "usuario",
    },
  };

  return { trabalho_kg: C, top_set_kg, back_off_kg, prescricao };
}
