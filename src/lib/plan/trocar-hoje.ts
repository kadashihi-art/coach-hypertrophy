/**
 * Trocar o treino de hoje (determinístico, só com confirmação na tela).
 *
 * - Treino aberto hoje sem nenhuma série feita (tocou em Começar e voltou) é fechado e volta pra
 *   fila; antes ele tinha prioridade e a troca não aparecia no Hoje nem no calendário.
 * - Treino aberto com série registrada não é trocado (as séries ficariam sem dono).
 * - O escolhido fica fixo hoje no calendário; o que estava hoje volta pra fila.
 * - Escolhido que já está como feito (inclusive hoje):
 *   - com série registrada: a execução fica guardada no dia dela e o treino repete hoje;
 *   - sem nenhuma série (marcado como feito sem treinar): a marcação sai e ele vira o de hoje.
 */
import type { AppState } from "@/lib/domain";
import { marcarDia } from "./calendario";
import { agendaEfetiva } from "./pendente";
import { arquivarConclusao } from "./repetir";

export type ResultadoTrocaHoje =
  | {
      ok: true;
      state: AppState;
      saiu: string | null;
      /** Marcados como feitos hoje sem série que voltaram pra fila. */
      desmarcados: string[];
      /** Treinos feitos de verdade hoje (com séries): o calendário continua mostrando. */
      feitosHoje: string[];
    }
  | { ok: false; motivo: "com_series" | "invalido" };

export function trocarTreinoHoje(state: AppState, paraId: string, hoje: string): ResultadoTrocaHoje {
  const para = state.sessoes.find((s) => s.id === paraId);
  if (!para || para.status === "em_andamento") return { ok: false, motivo: "invalido" };

  // Treino aberto (de hoje ou esquecido) sem série: fecha e volta pra fila.
  const abertos = state.sessoes.filter((s) => s.status === "em_andamento");
  const comSeries = abertos.find((s) => (state.registros ?? []).some((r) => r.sessao_id === s.id));
  if (comSeries) return { ok: false, motivo: "com_series" };
  // Depois da troca nenhum treino fica aberto: o "treino ativo" sempre é limpo
  // (um ativo antigo apontando pra outro treino também segurava o Hoje).
  let s: AppState = { ...state, active_sessao_id: null, logger_prescricao_id: null };
  let saiu: string | null = null;
  if (abertos.length) {
    const ids = new Set(abertos.map((x) => x.id));
    saiu = abertos.find((x) => x.data === hoje)?.id ?? abertos[0]!.id;
    s = {
      ...s,
      sessoes: s.sessoes.map((x) =>
        ids.has(x.id)
          ? { ...x, status: "planejada" as const, data: null, data_manual: undefined, iniciada_em: undefined, finalizada_em: undefined }
          : x,
      ),
    };
  }

  // Escolhido já feito: repetir hoje (guarda a execução) ou tirar a marcação de feito sem série.
  if (para.status === "concluida" || para.status === "parcial") {
    const temSerie = (s.registros ?? []).some((r) => r.sessao_id === paraId);
    if (temSerie && para.data) {
      s = arquivarConclusao(s, paraId);
    } else if (!temSerie) {
      s = {
        ...s,
        sessoes: s.sessoes.map((x) =>
          x.id === paraId
            ? { ...x, status: "planejada" as const, data: null, data_manual: undefined, iniciada_em: undefined, finalizada_em: undefined, snapshot_conclusao: undefined }
            : x,
        ),
      };
    }
  }

  // Outros treinos marcados como feitos HOJE sem nenhuma série ocupam o dia por engano
  // (ex.: "Finalizar" num treino vazio). Você está dizendo que hoje é o escolhido: eles voltam pra fila.
  const comRegistro = new Set((s.registros ?? []).map((r) => r.sessao_id));
  const desmarcados = s.sessoes
    .filter((x) => x.id !== paraId && !x.id.includes("#") && (x.status === "concluida" || x.status === "parcial") && x.data === hoje && !comRegistro.has(x.id))
    .map((x) => x.id);
  if (desmarcados.length) {
    const ids = new Set(desmarcados);
    s = {
      ...s,
      sessoes: s.sessoes.map((x) =>
        ids.has(x.id)
          ? { ...x, status: "planejada" as const, data: null, data_manual: undefined, iniciada_em: undefined, finalizada_em: undefined, snapshot_conclusao: undefined }
          : x,
      ),
    };
  }

  // Com ou sem data de início do plano: o escolhido fica fixo hoje (e o Hoje mostra ele).
  const agenda = agendaEfetiva(s, hoje).sessoes;
  const doDia = agenda.find((x) => x.data === hoje && x.status !== "pulada" && !x.id.includes("#") && x.id !== paraId);
  const r = marcarDia(s, agenda, hoje, doDia?.id ?? null, "trocar", paraId);
  // Confere: o escolhido tem que estar hoje, planejado. Senão não finge que trocou.
  const escolhido = r.sessoes.find((x) => x.id === paraId);
  if (!escolhido || escolhido.data !== hoje || escolhido.status !== "planejada") return { ok: false, motivo: "invalido" };
  // "Voltou pra fila" só quando voltou mesmo (um treino feito no dia continua feito).
  const doDiaDepois = doDia ? r.sessoes.find((x) => x.id === doDia.id) : undefined;
  const doDiaSaiu = doDiaDepois && doDiaDepois.status === "planejada" && doDiaDepois.data !== hoje ? doDia!.id : null;
  const comSerieHoje = new Set((r.registros ?? []).map((x) => x.sessao_id));
  const feitosHoje = r.sessoes
    .filter((x) => x.id !== paraId && (x.status === "concluida" || x.status === "parcial") && x.data === hoje && comSerieHoje.has(x.id))
    .map((x) => x.id);
  return { ok: true, state: r, saiu: saiu ?? doDiaSaiu, desmarcados, feitosHoje };
}
