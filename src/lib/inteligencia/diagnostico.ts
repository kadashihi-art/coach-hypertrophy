/**
 * Diagnóstico de estagnação e previsão de força (determinístico, só leitura).
 *
 * Estagnação: exercício com 2+ sessões sem progresso. Em vez de só "travou", o app olha os dados
 * que já tem e aponta as causas prováveis, com a evidência e uma ação:
 *  - RIR longe do alvo (estímulo curto) ou falha demais em composto (fadiga);
 *  - sono curto, proteína abaixo da meta;
 *  - volume do músculo fora da faixa 10–20 (realizado);
 *  - intervalo longo entre as sessões do exercício;
 *  - dor registrada no exercício, músculo chegando dolorido;
 *  - nada disso: adaptação ao mesmo estímulo (hora de variar).
 * Previsão: tendência do e1RM (regressão linear das últimas sessões) → semanas até o próximo marco.
 * Não muda kg, reps, séries nem RIR.
 */
import type { AppState, GrupoMuscular, RegistroSerie } from "@/lib/domain";
import { ehSeriePreparatoria } from "@/lib/domain";
import { e1rmEpley } from "@/lib/engine/e1rm";
import { metaProteina } from "@/lib/sono-agua/avaliacao";

export type CausaEstagnacao = {
  id: "longe_falha" | "falha_demais" | "sono" | "proteina" | "volume_baixo" | "volume_alto" | "intervalo" | "dor" | "chega_dolorido" | "adaptacao";
  titulo: string;
  evidencia: string;
  acao: string;
  peso: number;
};

export type Diagnostico = {
  exercicio_id: string;
  sessoes_sem_progresso: number;
  causas: CausaEstagnacao[];
};

type SessaoEx = { sessao_id: string; data: string; series: RegistroSerie[] };

function sessoesDoExercicio(registros: RegistroSerie[], exercicioId: string): SessaoEx[] {
  const por = new Map<string, SessaoEx>();
  for (const r of registros) {
    if (r.exercicio_id !== exercicioId || ehSeriePreparatoria(r.tipo_serie) || r.reps <= 0) continue;
    const d = (r.executado_em ?? "").slice(0, 10);
    const s = por.get(r.sessao_id) ?? { sessao_id: r.sessao_id, data: d, series: [] };
    if (d && (!s.data || d < s.data)) s.data = d;
    s.series.push(r);
    por.set(r.sessao_id, s);
  }
  return [...por.values()].filter((s) => s.data).sort((a, b) => a.data.localeCompare(b.data));
}

const diaMs = 86400000;
const dataMs = (d: string) => Date.parse(d + "T12:00:00Z");
const media = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);
const fmt = (n: number, casas = 1) => n.toLocaleString("pt-BR", { maximumFractionDigits: casas });

export function diagnosticarEstagnacao(
  state: Pick<AppState, "estados" | "registros" | "exercicios" | "checkins" | "volumes_semanais" | "perfil" | "feedbacks_musculo">,
  exercicioId: string,
  hojeIso: string,
): Diagnostico | null {
  const est = state.estados.find((e) => e.exercicio_id === exercicioId);
  if (!est || est.primeira_sessao || est.sessoes_sem_progresso < 2) return null;
  const ex = state.exercicios.find((e) => e.id === exercicioId);
  const grupo = ex?.grupo_primario as GrupoMuscular | undefined;
  const sess = sessoesDoExercicio(state.registros, exercicioId);
  const recentes = sess.slice(-3);
  const series = recentes.flatMap((s) => s.series);
  const causas: CausaEstagnacao[] = [];
  const limite = (dias: number) => new Date(dataMs(hojeIso) - dias * diaMs).toISOString().slice(0, 10);

  // 1) Proximidade da falha.
  if (series.length >= 3) {
    const rir = media(series.map((s) => s.rir_percebido));
    if (rir >= est.rir_alvo + 1.5) {
      causas.push({
        id: "longe_falha",
        titulo: "Séries parando longe da falha",
        evidencia: `RIR médio de ${fmt(rir)} nas últimas ${recentes.length} sessões (o alvo é ${est.rir_alvo}).`,
        acao: `Leve as séries até sobrar ${est.rir_alvo} ${est.rir_alvo === 1 ? "rep" : "reps"}. O estímulo está ficando curto.`,
        peso: 5,
      });
    } else if (rir <= 0.3 && ex?.composto) {
      causas.push({
        id: "falha_demais",
        titulo: "Falha demais num composto",
        evidencia: `Quase todas as séries recentes foram até a falha (RIR médio ${fmt(rir)}).`,
        acao: "Pare com 1–2 reps sobrando por 2 semanas. A fadiga está escondendo a força.",
        peso: 4,
      });
    }
  }

  // 2) Sono e proteína (check-ins dos últimos 14 dias).
  const cks = state.checkins.filter((c) => c.data >= limite(14) && c.data <= hojeIso);
  if (cks.length >= 4) {
    const curtas = cks.filter((c) => c.sono_h > 0 && c.sono_h < 6.5).length;
    if (curtas >= Math.ceil(cks.length / 2)) {
      causas.push({
        id: "sono",
        titulo: "Sono curto",
        evidencia: `${curtas} de ${cks.length} noites com menos de 6h30 nas últimas 2 semanas.`,
        acao: "Proteja 7h+ de sono por uma semana antes de mexer no treino. Força volta rápido quando o sono volta.",
        peso: 4,
      });
    }
  }
  const meta = metaProteina(state.perfil?.peso_kg, state.perfil?.objetivo);
  const prot = cks.filter((c) => c.proteina_g != null).map((c) => c.proteina_g!);
  if (meta && prot.length >= 3 && media(prot) < meta.min_g) {
    causas.push({
      id: "proteina",
      titulo: "Proteína abaixo da meta",
      evidencia: `Média de ${Math.round(media(prot))} g/dia, e a meta mínima é ${meta.min_g} g.`,
      acao: `Chegue em ${meta.min_g}–${meta.max_g} g por dia, dividido em 3–4 refeições.`,
      peso: 3,
    });
  }

  // 3) Volume realizado do músculo nas últimas 2 semanas registradas.
  if (grupo) {
    const sems = [...new Set(state.volumes_semanais.map((v) => v.semana_iso))].sort().slice(-3, -1);
    const vols = sems.map((s) => state.volumes_semanais.find((v) => v.semana_iso === s && v.grupo === grupo)?.series_efetivas ?? 0);
    if (vols.length === 2) {
      const m = media(vols);
      if (m < 8) {
        causas.push({
          id: "volume_baixo",
          titulo: "Pouco volume pro músculo",
          evidencia: `Média de ${fmt(m)} séries que valem por semana nas últimas 2 semanas.`,
          acao: "Complete as séries do plano. Se o tempo é o problema, coloque esse músculo como prioridade.",
          peso: 3,
        });
      } else if (m > 20) {
        causas.push({
          id: "volume_alto",
          titulo: "Volume alto demais",
          evidencia: `Média de ${fmt(m)} séries por semana, acima de 20.`,
          acao: "Corte 2–4 séries por semana desse músculo. Acima de 20, a recuperação pesa mais que o ganho.",
          peso: 3,
        });
      }
    }
  }

  // 4) Intervalo entre sessões do exercício.
  if (recentes.length >= 3) {
    const gaps = recentes.slice(1).map((s, i) => (dataMs(s.data) - dataMs(recentes[i]!.data)) / diaMs);
    const g = media(gaps);
    if (g > 9) {
      causas.push({
        id: "intervalo",
        titulo: "Muito tempo entre as sessões",
        evidencia: `Você fez esse exercício a cada ~${Math.round(g)} dias.`,
        acao: "Tente não pular o treino dele: com intervalos longos a progressão anda em círculo.",
        peso: 2,
      });
    }
  }

  // 5) Dor no exercício / músculo chegando dolorido.
  if (state.registros.some((r) => r.exercicio_id === exercicioId && r.dor && (r.executado_em ?? "").slice(0, 10) >= limite(21))) {
    causas.push({
      id: "dor",
      titulo: "Dor no exercício",
      evidencia: "Você marcou dor nesse exercício nas últimas 3 semanas.",
      acao: "Troque por uma variação que não doa (mesmo músculo, outro ângulo). Força com dor não progride.",
      peso: 5,
    });
  }
  if (grupo) {
    const doloridos = (state.feedbacks_musculo ?? []).filter((f) => f.grupo === grupo && f.momento === "pre" && f.data >= limite(21) && f.dor_muscular === 2).length;
    if (doloridos >= 2) {
      causas.push({
        id: "chega_dolorido",
        titulo: "Músculo chegando dolorido",
        evidencia: `${doloridos} vezes nas últimas 3 semanas você chegou bem dolorido nele.`,
        acao: "Já estou tirando séries dele. Dê um pouco mais de descanso entre os treinos desse músculo.",
        peso: 3,
      });
    }
  }

  if (causas.length === 0) {
    causas.push({
      id: "adaptacao",
      titulo: "Adaptação ao mesmo estímulo",
      evidencia: `Nada fora do lugar nos seus dados: só ${est.sessoes_sem_progresso} sessões no mesmo ponto.`,
      acao: "Troque por uma variação no próximo bloco, ou mude a faixa de reps (ex.: 6–8 em vez de 8–12) por algumas semanas.",
      peso: 1,
    });
  }
  return { exercicio_id: exercicioId, sessoes_sem_progresso: est.sessoes_sem_progresso, causas: causas.sort((a, b) => b.peso - a.peso).slice(0, 3) };
}

export type PrevisaoForca = {
  exercicio_id: string;
  e1rm_atual: number;
  kg_por_semana: number;
  marco_kg: number;
  semanas: number;
  texto: string;
};

/** Melhor e1RM da sessão (sem peso do corpo). */
function e1rmDaSessao(s: SessaoEx): number {
  return Math.max(0, ...s.series.filter((x) => x.carga_kg > 0).map((x) => e1rmEpley(x.carga_kg, x.reps)));
}

/**
 * Previsão pelo ritmo: regressão linear do e1RM nas últimas até 8 sessões (90 dias).
 * Precisa de 4+ sessões cobrindo 14+ dias e ritmo > 0,2 kg/semana; marco = próximo múltiplo de 5 kg;
 * só mostra se chega em até 16 semanas. Fora disso, null (não promete o que os dados não sustentam).
 */
export function preverForca(registros: RegistroSerie[], exercicioId: string, hojeIso: string): PrevisaoForca | null {
  const lim = new Date(dataMs(hojeIso) - 90 * diaMs).toISOString().slice(0, 10);
  const pts = sessoesDoExercicio(registros, exercicioId)
    .filter((s) => s.data >= lim)
    .slice(-8)
    .map((s) => ({ x: (dataMs(s.data) - dataMs(hojeIso)) / diaMs, y: e1rmDaSessao(s) }))
    .filter((p) => p.y > 0);
  if (pts.length < 4 || pts[pts.length - 1]!.x - pts[0]!.x < 14) return null;
  const mx = media(pts.map((p) => p.x));
  const my = media(pts.map((p) => p.y));
  const sxx = pts.reduce((a, p) => a + (p.x - mx) ** 2, 0);
  if (sxx <= 0) return null;
  const b = pts.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0) / sxx;
  const kgSemana = b * 7;
  if (kgSemana < 0.2) return null;
  // e1RM "de hoje" pela reta (menos ruído que a última sessão sozinha).
  const atual = my + b * (0 - mx);
  const marco = Math.floor(atual / 5) * 5 + 5;
  const semanas = Math.ceil((marco - atual) / kgSemana);
  if (semanas < 1 || semanas > 16) return null;
  return {
    exercicio_id: exercicioId,
    e1rm_atual: Math.round(atual * 10) / 10,
    kg_por_semana: Math.round(kgSemana * 10) / 10,
    marco_kg: marco,
    semanas,
    texto: `No ritmo atual (+${fmt(kgSemana)} kg/semana no 1RM estimado), você passa de ${marco} kg em ~${semanas} ${semanas === 1 ? "semana" : "semanas"}.`,
  };
}
