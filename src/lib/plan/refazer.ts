/**
 * Refazer onboarding (decisão do iury, 29/10/2026): conversa nova com o coach,
 * mas NADA é gravado até "Confirmar plano". Cancelar/sair = estado intacto.
 * Na confirmação, o perfil novo passa pelo mesmo remount do Ajustar
 * (preserva EstadoExercicio dos exercícios mantidos e o histórico de séries).
 */
import type { AppState, Perfil } from "@/lib/domain";
import { parqBloqueiaPrescricao } from "./parq";

export const REFAZER_PARAM = "refazer";
export const REFAZER_HREF = "/onboarding?refazer=1";

/** Modo refazer só existe para quem já tem onboarding concluído. */
export function emModoRefazer(search: string | URLSearchParams | null, perfil: Perfil | null | undefined): boolean {
  if (!perfil?.onboarding_concluido) return false;
  const q = typeof search === "string" ? new URLSearchParams(search) : search;
  return q?.get(REFAZER_PARAM) === "1";
}

/** Cancelar o refazer não muda nada: devolve o MESMO estado (sem perfil parcial, sem reset). */
export function cancelarRefazer(state: AppState): AppState {
  return state;
}

/** Patch aplicado só no "Confirmar plano" do refazer. PAR-Q continua valendo. */
export function patchConfirmarRefazer(rascunho: Perfil): { ok: true; patch: Partial<Perfil> } | { ok: false; motivo: "parq" } {
  if (parqBloqueiaPrescricao(rascunho)) return { ok: false, motivo: "parq" };
  const { id: _id, ...resto } = rascunho;
  void _id;
  return { ok: true, patch: { ...resto, onboarding_concluido: true } };
}
