import type { AppState } from "@/lib/domain";
import { motivoNaoEditavel, sessaoEditavel } from "@/lib/plan/editar-treino";
import { sessaoCorrigivel } from "@/lib/plan/corrigir-concluida";

/** O que o botão de edição do card da Hoje faz para a sessão em destaque (ou a do chip tocado). */
export type AlvoEditarHoje =
  | { modo: "editar"; sessaoId: string; label: "Editar treino" }
  | { modo: "corrigir"; sessaoId: string; label: "Corrigir registro" }
  | { modo: "bloqueado"; sessaoId: string; label: "Editar treino"; motivo: string }
  | null;

export function alvoEditarHoje(state: AppState, sessaoId: string | null | undefined): AlvoEditarHoje {
  if (!sessaoId) return null;
  const s = state.sessoes.find((x) => x.id === sessaoId);
  if (!s) return null;
  if (sessaoCorrigivel(state, s.id)) return { modo: "corrigir", sessaoId: s.id, label: "Corrigir registro" };
  if (sessaoEditavel(state, s.id)) return { modo: "editar", sessaoId: s.id, label: "Editar treino" };
  if (s.status === "em_andamento" || state.active_sessao_id === s.id)
    return { modo: "bloqueado", sessaoId: s.id, label: "Editar treino", motivo: motivoNaoEditavel(state, s.id) ?? "" };
  return null;
}
