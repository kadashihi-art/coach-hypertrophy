import type { AppState } from "@/lib/domain";
import { sessaoEditavel } from "@/lib/plan/editar-treino";

/** Próximo treino editável (de preferência com o músculo do alerta) para abrir o Editar treino. */
export function proximoTreinoParaAlerta(state: AppState, grupo?: string): string | null {
  const futuras = state.sessoes
    .filter((s) => (s.status === "planejada" || s.status === "parcial") && sessaoEditavel(state, s.id))
    .sort((a, b) => (a.data ?? "9999").localeCompare(b.data ?? "9999"));
  if (grupo) {
    const hit = futuras.find((s) =>
      s.prescricoes.some((p) => state.exercicios.find((e) => e.id === p.exercicio_id)?.grupo_primario === grupo),
    );
    if (hit) return hit.id;
  }
  return futuras[0]?.id ?? null;
}
