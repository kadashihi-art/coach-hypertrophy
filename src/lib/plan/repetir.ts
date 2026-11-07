/**
 * Repetir treino na semana (seg–dom, fuso de São Paulo).
 *
 * Os treinos do plano são modelos com uma única data. Para repetir um treino que já foi feito
 * (na semana passada ou nesta), a execução anterior é guardada antes como registro avulso
 * daquele dia (`<id>#feito-<data>`), levando as séries registradas junto. Assim o calendário
 * continua mostrando o dia antigo como feito e nenhuma série é apagada; o modelo volta a ficar
 * livre para o novo dia. Cargas e progressão continuam vindo da memória (`estados`).
 */
import type { AppState, Sessao } from "@/lib/domain";
import { inicioDaSemana, fimDaSemana } from "@/lib/cardio";
import { marcaAvulso } from "./ocorrencia-id";

const feitaStatus = (s: Pick<Sessao, "status">) => s.status === "concluida" || s.status === "parcial";

/** Treino concluído dentro da semana seg–dom de `hoje`. */
export function feitoNaSemana(s: Sessao, hoje: string): boolean {
  if (!feitaStatus(s) || !s.data) return false;
  return s.data >= inicioDaSemana(hoje) && s.data <= fimDaSemana(hoje);
}

/**
 * Guarda a execução anterior de um treino feito como registro avulso do dia em que foi feito
 * (com as séries) e devolve o modelo livre (planejado, sem data). Treino não feito: não muda.
 */
export function arquivarConclusao(state: AppState, sessaoId: string): AppState {
  const s = state.sessoes.find((x) => x.id === sessaoId);
  if (!s || !feitaStatus(s) || !s.data || s.id.includes("#")) return state;
  const id = marcaAvulso(s.id, s.data);
  const jaExiste = state.sessoes.some((x) => x.id === id);
  const avulso: Sessao = {
    ...s,
    id,
    data_manual: true,
    prescricoes: [],
    snapshot_conclusao: undefined,
    ancoras_sessao: undefined,
    finalizada_em: s.finalizada_em ?? `${s.data}T12:00:00.000Z`,
  };
  const livre: Sessao = {
    ...s,
    status: "planejada",
    data: null,
    data_manual: undefined,
    iniciada_em: undefined,
    finalizada_em: undefined,
    snapshot_conclusao: undefined,
  };
  return {
    ...state,
    sessoes: [...state.sessoes.map((x) => (x.id === s.id ? livre : x)), ...(jaExiste ? [] : [avulso])],
    registros: (state.registros ?? []).map((r) => (r.sessao_id === s.id ? { ...r, sessao_id: id } : r)),
  };
}
