/**
 * Trocar o treino de hoje (determinístico, só com confirmação na tela).
 *
 * - Treino aberto hoje sem nenhuma série feita (tocou em Começar e voltou) é fechado e volta pra
 *   fila; antes ele tinha prioridade e a troca não aparecia no Hoje nem no calendário.
 * - Treino aberto com série registrada não é trocado (as séries ficariam sem dono).
 * - O escolhido fica fixo hoje no calendário; o que estava hoje volta pra fila.
 */
import type { AppState } from "@/lib/domain";
import { marcarDia } from "./calendario";
import { agendaEfetiva } from "./pendente";

export type ResultadoTrocaHoje =
  | { ok: true; state: AppState; saiu: string | null }
  | { ok: false; motivo: "com_series" | "invalido" };

export function trocarTreinoHoje(state: AppState, paraId: string, hoje: string): ResultadoTrocaHoje {
  const para = state.sessoes.find((s) => s.id === paraId);
  if (!para || para.status === "em_andamento") return { ok: false, motivo: "invalido" };

  // Treino aberto (de hoje ou esquecido) sem série: fecha e volta pra fila.
  const abertos = state.sessoes.filter((s) => s.status === "em_andamento");
  const comSeries = abertos.find((s) => (state.registros ?? []).some((r) => r.sessao_id === s.id));
  if (comSeries) return { ok: false, motivo: "com_series" };
  let s: AppState = state;
  let saiu: string | null = null;
  if (abertos.length) {
    const ids = new Set(abertos.map((x) => x.id));
    saiu = abertos.find((x) => x.data === hoje)?.id ?? abertos[0]!.id;
    s = {
      ...s,
      active_sessao_id: s.active_sessao_id && ids.has(s.active_sessao_id) ? null : s.active_sessao_id,
      logger_prescricao_id: s.active_sessao_id && ids.has(s.active_sessao_id) ? null : s.logger_prescricao_id,
      sessoes: s.sessoes.map((x) =>
        ids.has(x.id)
          ? { ...x, status: "planejada" as const, data: null, data_manual: undefined, iniciada_em: undefined, finalizada_em: undefined }
          : x,
      ),
    };
  }

  if (!s.plano?.mesociclo?.data_inicio) return { ok: true, state: s, saiu };
  const agenda = agendaEfetiva(s, hoje).sessoes;
  const doDia = agenda.find((x) => x.data === hoje && x.status !== "pulada" && !x.id.includes("#") && x.id !== paraId);
  const r = marcarDia(s, agenda, hoje, doDia?.id ?? null, "trocar", paraId);
  return { ok: true, state: r, saiu: saiu ?? doDia?.id ?? null };
}
