/**
 * Briefing do treino: antes de começar, cada exercício com a última vez, a meta de hoje e o porquê.
 * Determinístico e só leitura: usa as cargas/séries que o motor já decidiu (estados + ajustes do dia)
 * e só traduz em meta clara. Não muda kg, reps nem RIR.
 */
import type { AppState, Checkin, Exercicio, Mesociclo, Prescricao } from "@/lib/domain";
import { incrementoCargaKg } from "@/lib/domain";
import { textoCarga } from "@/lib/catalog/tipo-carga";
import { resumirExercicio } from "@/lib/engine/memoria-carga";
import { rirAlvoDoDia } from "@/lib/engine/proximidade-falha";
import { seriesBase } from "@/lib/engine/rampa-volume";
import { semCodigoRegra } from "@/lib/llm/tom";
import { focoDoDia } from "@/lib/plan/mesociclo";
import { preparacaoDaSessao, textoPreparacao } from "@/lib/treino/estrutura-series";

export type ItemBriefing = {
  prescricao_id: string;
  exercicio_id: string;
  nome: string;
  series: number;
  /** Diferença de séries do dia sobre a base do plano (rampa + feedback + check-in). */
  delta_series: number;
  faixa: [number, number];
  rir: number;
  /** "Última vez: 80 kg × 9 @ RIR 2 · há 5 dias" (null na primeira vez). */
  ultima: string | null;
  /** Meta de hoje em uma linha. */
  meta: string;
  /** Por que a meta é essa (decisão da última sessão), quando existe. */
  porque: string | null;
  prep: string;
};

export type Briefing = {
  cabecalho: string;
  itens: ItemBriefing[];
};

const FOCO_TXT: Record<string, string> = {
  acumulo: "acumulando volume",
  intensificacao: "intensificando",
  realizacao: "realização",
  deload: "semana leve (deload)",
};

function diasDesde(iso: string | null, hojeIso: string): number | null {
  if (!iso) return null;
  const d = Math.round((Date.parse(hojeIso + "T12:00:00Z") - Date.parse(iso.slice(0, 10) + "T12:00:00Z")) / 86400000);
  return Number.isFinite(d) ? Math.max(0, d) : null;
}

function quando(d: number | null): string {
  if (d == null) return "";
  if (d === 0) return " · hoje";
  if (d === 1) return " · ontem";
  return ` · há ${d} dias`;
}

/** Meta do exercício a partir da carga de hoje e da última execução. */
export function metaDoExercicio(args: {
  ex: Pick<Exercicio, "nome" | "equipamento" | "padrao" | "grupo_primario"> | undefined;
  cargaHoje: number;
  faixa: [number, number];
  rir: number;
  ultimaCarga: number | null;
  ultimasReps: number | null;
}): string {
  const { ex, cargaHoje, faixa, rir, ultimaCarga, ultimasReps } = args;
  const c = textoCarga(cargaHoje, ex as never);
  const rirTxt = `RIR ${rir}`;
  if (ultimaCarga == null || ultimasReps == null) {
    return `Primeira vez: comece com ${c} e ajuste até ${faixa[0]}–${faixa[1]} reps saírem no ${rirTxt}.`;
  }
  const eps = 1e-9;
  if (cargaHoje > ultimaCarga + eps) return `Carga nova: ${c} × ${faixa[0]}+ reps no ${rirTxt}. Segurar a técnica é a vitória de hoje.`;
  if (cargaHoje < ultimaCarga - eps) return `${c} × ${faixa[0]}–${faixa[1]} no ${rirTxt}: um passo atrás pra voltar a progredir.`;
  if (ultimasReps >= faixa[1]) return `${c} × ${faixa[1]} no ${rirTxt}. Saiu fácil? Na próxima a carga sobe.`;
  const alvo = Math.min(faixa[1], Math.max(faixa[0], ultimasReps + 1));
  return `${c} × ${alvo} no ${rirTxt}: 1 rep a mais que a última vez.`;
}

export function montarBriefing(args: {
  state: Pick<AppState, "estados" | "registros" | "decisoes" | "exercicios" | "perfil">;
  /** Prescrições do dia já com os ajustes (rampa, feedback, check-in). */
  prescricoes: Prescricao[];
  mesociclo: Mesociclo | null;
  checkin?: Checkin | null;
  hojeIso: string;
  /** Séries da base do plano por prescrição (pra mostrar o ajuste do dia). */
  baseSeries?: Map<string, number>;
}): Briefing {
  const { state, prescricoes, mesociclo, hojeIso } = args;
  const foco = focoDoDia(mesociclo);
  const ordenadas = [...prescricoes].sort((a, b) => a.ordem - b.ordem);
  const preps = preparacaoDaSessao(ordenadas, state.exercicios);
  const itens: ItemBriefing[] = ordenadas.map((p, i) => {
    const ex = state.exercicios.find((e) => e.id === p.exercicio_id);
    const est = state.estados.find((e) => e.exercicio_id === p.exercicio_id);
    const faixa: [number, number] = [p.faixa_reps[0], p.faixa_reps[1]];
    const cargaHoje = est?.alvo_proxima_sessao.carga_kg ?? p.carga.trabalho_kg ?? 0;
    const mem = resumirExercicio(state.registros, p.exercicio_id, { stepKg: ex ? incrementoCargaKg(ex.grupo_primario) : 2.5 });
    const rir = rirAlvoDoDia({
      exercicio: ex,
      experiencia: state.perfil?.experiencia,
      foco,
      semana_atual: mesociclo?.semana_atual,
      total_semanas: mesociclo?.total_semanas,
      checkin: args.checkin ?? null,
    }).alvo;
    const ultima =
      mem && mem.ultima_carga_kg != null && mem.ultimas_reps != null
        ? `Última vez: ${textoCarga(mem.ultima_carga_kg, ex)} × ${mem.ultimas_reps}${mem.ultimo_rir != null ? ` @ RIR ${mem.ultimo_rir}` : ""}${quando(diasDesde(mem.ultima_em, hojeIso))}`
        : null;
    const dec = [...state.decisoes].reverse().find((d) => d.exercicio_id === p.exercicio_id);
    const porque = dec ? semCodigoRegra(dec.motivo).trim() || null : null;
    return {
      prescricao_id: p.id,
      exercicio_id: p.exercicio_id,
      nome: ex?.nome ?? p.exercicio_id,
      series: p.series,
      delta_series: p.series - (args.baseSeries?.get(p.id) ?? seriesBase(p)),
      faixa,
      rir,
      ultima,
      meta: metaDoExercicio({ ex, cargaHoje, faixa, rir, ultimaCarga: mem?.ultima_carga_kg ?? null, ultimasReps: mem?.ultimas_reps ?? null }),
      porque,
      prep: textoPreparacao(preps[i]),
    };
  });
  const cab = mesociclo
    ? `Semana ${mesociclo.semana_atual} de ${mesociclo.total_semanas}${foco ? ` · ${FOCO_TXT[foco] ?? foco}` : ""}`
    : "Seu treino de hoje";
  return { cabecalho: cab, itens };
}
