/**
 * Faixa de dias em Hoje: mesma agenda do calendário (datas reais, pendente + marcações à mão).
 * Só leitura. Calendário e faixa saem de agendaEfetiva + derivarDias, então mostram sempre o mesmo.
 */
import type { AppState } from "@/lib/domain";
import { addDaysIso, derivarDias, type CalendarioDiaView } from "@/lib/plan/calendario";
import { agendaEfetiva } from "@/lib/plan/pendente";
import { projetarOcorrencias } from "@/lib/plan/projecao";

export type StatusFaixa = "feito" | "pendente" | "planejado" | "folga" | "pulado" | "limpo" | "em_andamento";

export const TEXTO_STATUS: Record<StatusFaixa, string> = {
  feito: "Feito",
  pendente: "Pendente",
  planejado: "Planejado",
  folga: "Folga",
  pulado: "Pulado",
  limpo: "Limpo",
  em_andamento: "Em andamento",
};

export interface DiaFaixa {
  dia: CalendarioDiaView;
  /** "Qua 04/11" */
  rotulo: string;
  status: StatusFaixa;
  hoje: boolean;
}

const SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function rotuloDia(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return `${SEMANA[d.getUTCDay()]} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

export function statusFaixa(dia: CalendarioDiaView, pendentes: Set<string>, hoje: string): StatusFaixa {
  switch (dia.status) {
    case "feito":
      return "feito";
    case "pulado":
      return "pulado";
    case "limpo":
      return "limpo";
    case "em_andamento":
      return "em_andamento";
    case "vazio":
      return "folga";
    case "planejado":
      return (dia.sessao_id && pendentes.has(dia.sessao_id)) || dia.data < hoje ? "pendente" : "planejado";
  }
}

/** Do início do plano (no máx. 4 semanas atrás) até o último treino da agenda (no mín. uma semana à frente). */
export function faixaDeDias(state: AppState, hoje: string | null | undefined): DiaFaixa[] {
  if (!hoje) return [];
  const agenda = agendaEfetiva(state, hoje);
  const sessoes = projetarOcorrencias(state, hoje, agenda);
  const datas = sessoes.map((s) => s.data).filter((d): d is string => !!d).sort();
  const inicioPlano = state.plano?.mesociclo?.data_inicio ?? datas[0];
  if (!inicioPlano) return [];
  let ini = inicioPlano < addDaysIso(hoje, -28) ? addDaysIso(hoje, -28) : inicioPlano;
  if (ini > hoje) ini = hoje;
  let fim = datas[datas.length - 1] ?? hoje;
  if (fim < addDaysIso(hoje, 6)) fim = addDaysIso(hoje, 6);
  if (fim > addDaysIso(ini, 62)) fim = addDaysIso(ini, 62);
  const lista: string[] = [];
  for (let d = ini; d <= fim; d = addDaysIso(d, 1)) lista.push(d);
  const pend = new Set(agenda.pendentes.map((p) => p.sessao_id));
  return derivarDias(sessoes, lista, state.dias_limpos ?? []).map((dia) => ({
    dia,
    rotulo: rotuloDia(dia.data),
    status: statusFaixa(dia, pend, hoje),
    hoje: dia.data === hoje,
  }));
}
