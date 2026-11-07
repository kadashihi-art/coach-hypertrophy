/**
 * Projeção do mesociclo: o calendário mostra as 6 semanas desde o início.
 *
 * As sessões salvas são templates (uma ocorrência por treino). O calendário só enxergava
 * a data salva de cada template, então depois da 1ª semana não havia o que mostrar. Aqui a
 * leitura projeta as semanas restantes a partir do microciclo de cada fase
 * (`plano.estrutura.fases`), sem gravar nada e sem criar sessões reais.
 *
 * Regras:
 * - O que já aconteceu (ou está agendado de verdade) continua vindo da agenda efetiva:
 *   a ocorrência real da semana vence a projeção.
 * - Datas passadas nunca são inventadas; só aparecem se tiverem ocorrido de verdade.
 * - Uma ocorrência real que a agenda empurrou para depois do dia projetado substitui a
 *   projeção (evita mostrar o mesmo treino duas vezes).
 * - A virada de fase é respeitada: cada semana usa o microciclo da fase daquela semana.
 *
 * Ocorrências projetadas ganham um id sintético (`<id>#prev-w<semana>`) e são somente
 * leitura: as ações do calendário nunca marcam um treino futuro como feito. Elas viram
 * reais quando o usuário inicia o treino (o fluxo normal grava `sessao.data`).
 */
import type { AppState, FasePlano, Plano, Sessao, TipoDia } from "@/lib/domain";
import { addDaysIso, weekdayOffsets } from "./calendario";
import { marcaProjecao } from "./ocorrencia-id";
import { agendaEfetiva, sessoesDoCalendario, type AgendaEfetiva } from "./pendente";
import { sessoesDoPlano } from "./proxima-sessao";
import { SEMANAS_MESOCICLO } from "./semanas";

/** Plano antigo sem `estrutura.fases`: repete o microciclo semanal do plano. */
function faseLegado(plano: Plano, ordered: Sessao[], totalSemanas: number): FasePlano {
  const offsets = weekdayOffsets(plano.dias_por_semana);
  const off0 = offsets[0] ?? 0;
  return {
    id: "fase-legado",
    nome: "Plano",
    estilo: plano.divisao ?? "auto",
    semana_inicio: 1,
    semanas: totalSemanas,
    microciclo: ordered.map((s, i) => {
      const off = offsets[i % Math.max(1, offsets.length)] ?? 0;
      return {
        dia: (off - off0 + 7) % 7,
        tipo: "full" as TipoDia,
        sessao_id: s.id,
      };
    }),
    sessao_ids: ordered.map((s) => s.id),
    descanso_porque: [],
  };
}

function faseDaSemana(fases: FasePlano[], semana: number): FasePlano {
  let atual = fases[0]!;
  for (const f of fases) {
    if (semana >= f.semana_inicio) atual = f;
    else break;
  }
  return atual;
}

/**
 * Sessões para o calendário e a faixa de dias: agenda efetiva + semanas futuras projetadas.
 * Só leitura; o estado salvo não é alterado.
 */
export function projetarOcorrencias(
  state: Pick<AppState, "sessoes" | "plano"> & Partial<AppState>,
  hoje: string | null | undefined,
  agenda: AgendaEfetiva = agendaEfetiva(state, hoje),
): Sessao[] {
  const reais = sessoesDoCalendario(agenda);
  const plano = state.plano;
  const dataInicio = plano?.mesociclo?.data_inicio;
  if (!hoje || !plano || !dataInicio) return reais;

  const totalBase = plano.mesociclo.total_semanas || SEMANAS_MESOCICLO;
  const totalSemanas = Math.max(
    totalBase,
    ...(plano.estrutura?.fases?.map((f) => f.semana_inicio + f.semanas - 1) ?? []),
  );

  const fases = plano.estrutura?.fases?.length
    ? plano.estrutura.fases
    : (() => {
        const ordered = sessoesDoPlano(state as AppState, hoje);
        return ordered.length ? [faseLegado(plano, ordered, totalSemanas)] : [];
      })();
  if (!fases.length) return reais;

  const realById = new Map(agenda.sessoes.map((s) => [s.id, s] as const));
  const consumidos = new Set<string>();
  // Datas já ocupadas por sessão real: projeção nunca põe dois treinos no mesmo dia.
  const ocupados = new Set<string>();
  for (const s of reais) if (s.data) ocupados.add(s.data);

  const saida: Sessao[] = [];
  const addReal = (s: Sessao) => {
    if (consumidos.has(s.id)) return;
    consumidos.add(s.id);
    saida.push(s);
    if (s.data) ocupados.add(s.data);
  };

  for (let semana = 1; semana <= totalSemanas; semana++) {
    const fase = faseDaSemana(fases, semana);
    const semanaIni = addDaysIso(dataInicio, (semana - 1) * 7);
    const semanaFim = addDaysIso(semanaIni, 6);

    for (const dia of fase.microciclo) {
      if (!dia.sessao_id) continue;
      const base =
        state.sessoes.find((s) => s.id === dia.sessao_id) ?? realById.get(dia.sessao_id);
      if (!base) continue;

      const real = realById.get(dia.sessao_id);
      // Ocorrência real caiu nesta semana (mesmo que a agenda tenha mudado o dia): vale ela.
      if (real?.data && real.data >= semanaIni && real.data <= semanaFim) {
        addReal(real);
        continue;
      }

      const dataProjetada = addDaysIso(semanaIni, dia.dia);
      // Passado não é inventado: aparece só o que aconteceu de verdade.
      if (dataProjetada < hoje) continue;
      // A agenda real já moveu essa ocorrência para depois: não duplica.
      if (real?.data && real.data > dataProjetada) continue;
      if (ocupados.has(dataProjetada)) continue;

      const virtual: Sessao = {
        ...base,
        id: marcaProjecao(base.id, semana),
        data: dataProjetada,
        data_manual: undefined,
        status: "planejada",
      };
      saida.push(virtual);
      ocupados.add(dataProjetada);
    }
  }

  // Reais que não caíram na semana do seu microciclo (marcação à mão, pendente deslocado etc.).
  for (const s of agenda.sessoes) addReal(s);

  // Pulos de dias passados: o dia continua aparecendo como pulado.
  for (const p of agenda.pulos) {
    if (p.data && ocupados.has(p.data)) continue;
    saida.push(p);
    if (p.data) ocupados.add(p.data);
  }

  return saida;
}
