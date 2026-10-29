import type { AppState, Sessao } from "@/lib/domain";
import { faseAtiva } from "./estrutura";

/** Sessões do plano na ordem do mesociclo (só da fase ativa, se houver fases). */
export function sessoesDoPlano(state: AppState, hojeIso?: string | null): Sessao[] {
  const fase = faseAtiva(
    state.plano,
    hojeIso ?? (typeof window !== "undefined" && state.plano?.estrutura?.fases?.length ? hojeIsoSaoPaulo() : null),
  );
  const ids = fase?.sessao_ids?.length ? fase.sessao_ids : state.plano?.sessoes ?? [];
  const ordered: Sessao[] = [];
  for (const id of ids) {
    const s = state.sessoes.find((x) => x.id === id);
    if (s && s.prescricoes.length > 0) ordered.push(s);
  }
  if (ordered.length > 0) return ordered;
  return state.sessoes
    .filter((s) => s.prescricoes.length > 0)
    .sort((a, b) => a.ordem - b.ordem);
}

export function hojeIsoSaoPaulo(now = Date.now()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(now));
  } catch {
    return new Date(now).toISOString().slice(0, 10);
  }
}

/**
 * Próxima sessão do ciclo.
 * Pass `hojeIso` (YYYY-MM-DD) from the client after hydrate to avoid prerender Date().
 */
export function proximaSessao(
  state: AppState,
  hojeIso?: string | null,
): Sessao | undefined {
  const ordered = sessoesDoPlano(state, hojeIso ?? null);
  if (ordered.length === 0) return undefined;

  const active =
    ordered.find((s) => s.id === state.active_sessao_id) ??
    ordered.find((s) => s.status === "em_andamento");
  if (active) return active;

  const elegivel = (s: Sessao) =>
    s.status !== "pulada" &&
    s.status !== "abandonada" &&
    s.prescricoes.length > 0;

  const dataInicio = state.plano?.mesociclo?.data_inicio ?? null;
  const hoje = hojeIso ?? null;

  if (dataInicio && hoje) {
    const upcoming = ordered
      .filter(
        (s) =>
          elegivel(s) &&
          s.status === "planejada" &&
          s.data != null &&
          s.data >= hoje,
      )
      .sort((a, b) => (a.data ?? "").localeCompare(b.data ?? ""));
    if (upcoming[0]) return upcoming[0];

    const planejada = ordered.find(
      (s) => elegivel(s) && s.status === "planejada",
    );
    if (planejada) return planejada;
  }

  const finished = [...ordered]
    .filter((s) => s.finalizada_em && s.status === "concluida")
    .sort((a, b) =>
      (b.finalizada_em ?? "").localeCompare(a.finalizada_em ?? ""),
    );
  const last = finished[0];
  if (last) {
    const idx = ordered.findIndex((s) => s.id === last.id);
    if (idx >= 0) {
      for (let step = 1; step <= ordered.length; step++) {
        const cand = ordered[(idx + step) % ordered.length];
        if (elegivel(cand) && cand.status !== "concluida") return cand;
      }
      return ordered[(idx + 1) % ordered.length];
    }
  }

  return (
    ordered.find((s) => elegivel(s) && s.status === "planejada") ??
    ordered.find((s) => elegivel(s) && s.status !== "concluida") ??
    ordered.find((s) => elegivel(s)) ??
    ordered[0]
  );
}
