import { ehSeriePreparatoria } from "@/lib/domain/enums";
/**
 * Motor determinístico R1–R12 (brief-produto-v1 §6).
 * IA NÃO inventa números — só este motor calcula carga/ação.
 */
import type {
  Checkin,
  DecisaoProgressao,
  EstadoExercicio,
  GrupoMuscular,
  Prescricao,
  RegistroSerie,
  VolumeSemanal,
} from "@/lib/domain";
import { incrementoCargaKg, VOLUME_MAX, VOLUME_MIN } from "@/lib/domain";
import { roundToStep } from "./ancorar-carga";
import { e1rmEpley, melhorE1rm } from "./e1rm";

export type ProgressionInput = {
  exercicio_id: string;
  sessao_id: string;
  grupo_primario: GrupoMuscular;
  series: RegistroSerie[];
  estado: EstadoExercicio;
  checkin?: Checkin | null;
  /** Volume efetivo do grupo nas últimas 2 semanas (mais recente primeiro). */
  volume_semanal_grupo?: VolumeSemanal[];
  /** Semana atual e total do mesociclo (R6). */
  mesociclo?: { semana_atual: number; total_semanas: number; foco: string };
  /** Técnica da prescrição (R8). */
  tecnica?: string;
  /** Séries com dor em sessão anterior do mesmo exercício (R7). */
  dor_sessoes_anteriores?: number;
};

function uid(): string {
  return `dec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

function trabalho(series: RegistroSerie[]): RegistroSerie[] {
  return series.filter((s) => !ehSeriePreparatoria(s.tipo_serie));
}

/** Âncora de progressão p/ top_set_backoff: top_set, senão heaviest trabalho. */
export function pickTopSetAnchor(
  series: RegistroSerie[],
): RegistroSerie | null {
  const tops = series.filter((s) => s.tipo_serie === "top_set");
  if (tops.length > 0) {
    return tops.reduce((a, b) => (b.carga_kg >= a.carga_kg ? b : a));
  }
  const trabalhos = series.filter((s) => s.tipo_serie === "trabalho");
  if (trabalhos.length > 0) {
    return trabalhos.reduce((a, b) => (b.carga_kg >= a.carga_kg ? b : a));
  }
  if (series.length === 0) return null;
  return series.reduce((a, b) => (b.carga_kg >= a.carga_kg ? b : a));
}

/** Back-off sugerido ≈ 87,5% do top (meio de 85–90%), arredondado no step. */
export function sugerirBackOffKg(
  topKg: number,
  grupo: GrupoMuscular,
): number {
  const step = incrementoCargaKg(grupo);
  return roundToStep(topKg * 0.875, step);
}

function base(
  input: ProgressionInput,
  regra: DecisaoProgressao["regra"],
  acao: DecisaoProgressao["acao"],
  nova: number,
  motivo: string,
  evidencia: DecisaoProgressao["evidencia"],
  reinicia = false,
): DecisaoProgressao {
  return {
    id: uid(),
    data: hoje(),
    exercicio_id: input.exercicio_id,
    sessao_id: input.sessao_id,
    regra,
    acao,
    carga_anterior_kg: input.estado.carga_atual_kg,
    nova_carga_kg: Math.round(nova * 10) / 10,
    faixa_reps_reiniciada: reinicia,
    motivo,
    evidencia,
  };
}

/**
 * Avalia R1–R12 em ordem de prioridade de segurança → volume → progressão.
 * Retorna a primeira regra que dispara (uma decisão por exercício/sessão).
 */
export function decidirProgressao(
  input: ProgressionInput,
): DecisaoProgressao {
  const series = trabalho(input.series);
  const estado = input.estado;
  const [piso, topo] = estado.faixa_reps;
  const carga = estado.carga_atual_kg;
  const inc = incrementoCargaKg(input.grupo_primario);

  // —— R7 Suspender por dor (segurança primeiro) ——
  const seriesComDor = series.filter((s) => s.dor).length;
  const dorAnterior = input.dor_sessoes_anteriores ?? 0;
  if (seriesComDor >= 2 || (seriesComDor >= 1 && dorAnterior >= 1)) {
    return base(
      input,
      "R7",
      "suspender",
      carga,
      "Dor em 2+ séries ou dor persistente em 2 sessões no mesmo exercício. Substituir por alternativa de mesmo padrão; reavaliar em 2 sessões.",
      "forte",
    );
  }

  // —— R12 Calibração inicial ——
  if (
    estado.origem_carga === "estimativa_conservadora" &&
    estado.primeira_sessao
  ) {
    return base(
      input,
      "R12",
      "manter_carga",
      carga,
      "Carga de origem estimativa_conservadora e primeira sessão. Ajustar pelo RIR percebido; próxima origem = calibracao.",
      "pratica",
    );
  }

  // —— R9 Autoregulação por prontidão ——
  const ck = input.checkin;
  if (ck && (ck.prontidao <= 2 || ck.sono_h < 6)) {
    return base(
      input,
      "R9",
      "manter_carga",
      carga,
      `Prontidão ${ck.prontidao} ou sono ${ck.sono_h}h < 6. Manter carga; reduzir 1 série nos exercícios principais.`,
      "contextual",
    );
  }

  // —— R6 Deload programado ——
  const meso = input.mesociclo;
  if (
    meso &&
    meso.semana_atual >= meso.total_semanas - 1 &&
    (meso.foco === "acumulo" || meso.foco === "intensificacao")
  ) {
    return base(
      input,
      "R6",
      "deload",
      Math.round(carga * 0.9 * 10) / 10,
      `Semana ${meso.semana_atual} de ${meso.total_semanas} (foco ${meso.foco}). Deload: −10% carga, −2 séries.`,
      "contextual",
    );
  }

  // —— R5 Deload por platô ——
  if (estado.sessoes_sem_progresso >= 3) {
    return base(
      input,
      "R5",
      "deload",
      Math.round(carga * 0.9 * 10) / 10,
      "3 sessões consecutivas sem progressão. Deload: −10% carga, −1 série, 1 semana.",
      "moderado",
    );
  }

  // —— R11 Volume acima do máximo ——
  const vols = input.volume_semanal_grupo ?? [];
  const volAtual = vols[0]?.series_efetivas ?? 0;
  const rirMedio =
    series.length > 0
      ? series.reduce((a, s) => a + s.rir_percebido, 0) / series.length
      : estado.rir_alvo;
  if (volAtual > VOLUME_MAX && rirMedio < estado.rir_alvo) {
    return base(
      input,
      "R11",
      "reduzir_carga",
      carga,
      `Volume semanal efetivo ${volAtual} > ${VOLUME_MAX} e RIR médio em queda. Remover 2 séries.`,
      "contextual",
    );
  }

  // —— R10 Volume abaixo do mínimo ——
  if (
    vols.length >= 2 &&
    vols[0]!.series_efetivas < VOLUME_MIN &&
    vols[1]!.series_efetivas < VOLUME_MIN
  ) {
    return base(
      input,
      "R10",
      "manter_carga",
      carga,
      `Volume efetivo do grupo < ${VOLUME_MIN} por 2 semanas. Adicionar 1–2 séries no grupo alvo.`,
      "moderado",
    );
  }

  // —— R8 Top set / back-off (avalia âncora; NÃO bloqueia progressão) ——
  if (input.tecnica === "top_set_backoff") {
    const anchor = pickTopSetAnchor(series);
    if (!anchor) {
      return base(
        input,
        "R8",
        "manter_e_checar",
        carga,
        "Técnica top_set_backoff sem série de top/trabalho. Manter carga e checar na próxima.",
        "pratica",
      );
    }
    const topKg = anchor.carga_kg;
    const rir = anchor.rir_percebido;
    const reps = anchor.reps;
    const bo = sugerirBackOffKg(
      // back-off relativo à próxima carga-alvo (calculada abaixo em cada ramo)
      topKg,
      input.grupo_primario,
    );

    // Falha / reps abaixo do piso → reduzir ~7,5% (espírito R4)
    if (reps < piso) {
      const nova = roundToStep(topKg * 0.925, inc);
      const boNova = sugerirBackOffKg(nova, input.grupo_primario);
      return base(
        input,
        "R8",
        "reduzir_carga",
        nova,
        `Top set ${topKg} kg com ${reps} reps < piso (${piso}). Redução ~7,5% → ${nova} kg; back-off sugerido ~${boNova} kg (87,5%).`,
        "moderado",
      );
    }

    // RIR ≤ 1 e reps OK → sobe (Iury: RIR≤1 sobe)
    if (rir <= 1) {
      const nova = Math.round((topKg + inc) * 10) / 10;
      const boNova = sugerirBackOffKg(nova, input.grupo_primario);
      return base(
        input,
        "R8",
        "subir_carga",
        nova,
        `Top set ${topKg} kg RIR ${rir} ≤ 1 com reps OK. Subir ${inc} kg → ${nova} kg; back-off ~${boNova} kg (87,5% do novo top).`,
        "forte",
        true,
      );
    }

    // R1-elegível na banda R8: topo da faixa + RIR ≤ 2
    if (reps >= topo && rir <= 2) {
      const nova = Math.round((topKg + inc) * 10) / 10;
      const boNova = sugerirBackOffKg(nova, input.grupo_primario);
      return base(
        input,
        "R8",
        "subir_carga",
        nova,
        `Top set no topo da faixa (${topo}) com RIR ${rir}. Subir ${inc} kg → ${nova} kg; back-off ~${boNova} kg (87,5%).`,
        "forte",
        true,
      );
    }

    // RIR 2 (banda brief) e reps na faixa → manter; back-off 85–90%
    const boKeep = sugerirBackOffKg(topKg, input.grupo_primario);
    return base(
      input,
      "R8",
      "manter_carga",
      topKg,
      `Top set RIR ${rir} na banda 1–2; reps OK. Manter ${topKg} kg; back-off ~${boKeep} kg (85–90%, âncora 87,5%). Ref: ${bo} kg.`,
      "moderado",
    );
  }

  if (series.length === 0) {
    return base(
      input,
      "R3",
      "manter_e_checar",
      carga,
      "Nenhuma série de trabalho registrada. Manter carga e checar na próxima.",
      "pratica",
    );
  }

  const abaixoPiso = series.filter((s) => s.reps < piso).length;
  const rirBaixo = series.filter((s) => s.rir_percebido < estado.rir_alvo).length;
  const todasNaFaixa = series.every((s) => s.reps >= piso && s.reps <= topo);
  const todasNoTopo = series.every((s) => s.reps >= topo);
  const ultima = series[series.length - 1]!;
  const rirUltimaOk = ultima.rir_percebido >= estado.rir_alvo;
  const todasRirOk = series.every((s) => s.rir_percebido >= estado.rir_alvo);
  const repsAbaixoTopo = series.some((s) => s.reps < topo);

  // —— R4 Reduzir por falha prematura ——
  if (abaixoPiso >= 2) {
    const nova = Math.round(carga * 0.925 * 10) / 10; // ~7.5% (meio de 5–10%)
    return base(
      input,
      "R4",
      "reduzir_carga",
      nova,
      `Reps abaixo do piso (${piso}) em ${abaixoPiso} séries. Redução ~7,5% na carga.`,
      "moderado",
    );
  }

  // —— R1 Dupla progressão ——
  if (todasNaFaixa && todasNoTopo && rirUltimaOk) {
    const nova = Math.round((carga + inc) * 10) / 10;
    return base(
      input,
      "R1",
      "subir_carga",
      nova,
      `Todas as séries no topo da faixa (${topo}) e RIR da última ≥ alvo (${estado.rir_alvo}). Subir ${inc} kg; reiniciar faixa.`,
      "forte",
      true,
    );
  }

  // —— R2 Progressão por repetições ——
  if (todasRirOk && repsAbaixoTopo && todasNaFaixa) {
    return base(
      input,
      "R2",
      "manter_carga",
      carga,
      `RIR ≥ alvo em todas as séries, reps abaixo do topo. Manter carga; alvo +1 rep na próxima.`,
      "forte",
    );
  }

  // —— R3 Manter e checar fadiga ——
  if (rirBaixo >= 1 && todasNaFaixa) {
    return base(
      input,
      "R3",
      "manter_e_checar",
      carga,
      `RIR percebido abaixo do alvo em ${rirBaixo} série(s), reps na faixa. Manter carga; sinalizar fadiga acumulada.`,
      "moderado",
    );
  }

  // Fallback: manter
  return base(
    input,
    "R3",
    "manter_carga",
    carga,
    "Condições intermediárias — manter carga e reavaliar na próxima sessão.",
    "contextual",
  );
}

/** Extrai memória da sessão (top / back-off / RIR) a partir das séries. */
function memoriaDaSessao(
  series: RegistroSerie[] | undefined,
  novaCargaKg: number,
  grupoFallbackStep = 2.5,
): Pick<
  EstadoExercicio,
  "ultimo_top_kg" | "ultimo_back_off_kg" | "ultimo_rir" | "ultima_sessao_em"
> {
  const hojeIso = new Date().toISOString();
  if (!series || series.length === 0) {
    return {
      ultimo_top_kg: novaCargaKg,
      ultimo_back_off_kg: roundToStep(novaCargaKg * 0.875, grupoFallbackStep),
      ultimo_rir: null,
      ultima_sessao_em: hojeIso,
    };
  }
  const work = trabalho(series);
  const anchor = pickTopSetAnchor(work);
  const back = work
    .filter((s) => s.tipo_serie === "back_off")
    .reduce<RegistroSerie | null>(
      (a, b) => (!a || b.carga_kg >= a.carga_kg ? b : a),
      null,
    );
  const ultimo_top_kg = anchor?.carga_kg ?? novaCargaKg;
  const ultimo_back_off_kg =
    back?.carga_kg ?? roundToStep(ultimo_top_kg * 0.875, grupoFallbackStep);
  const lastWork = work[work.length - 1];
  const ultimo_rir =
    anchor?.rir_percebido ?? lastWork?.rir_percebido ?? null;
  return {
    ultimo_top_kg,
    ultimo_back_off_kg,
    ultimo_rir,
    ultima_sessao_em: hojeIso,
  };
}

/** Aplica decisão ao EstadoExercicio (imutável). */
export function aplicarDecisao(
  estado: EstadoExercicio,
  decisao: DecisaoProgressao,
  series?: RegistroSerie[],
): EstadoExercicio {
  const e1rm =
    series && series.length > 0
      ? melhorE1rm(series)
      : e1rmEpley(decisao.nova_carga_kg, estado.faixa_reps[0]);

  const progrediu = decisao.acao === "subir_carga";
  const prCarga = Math.max(estado.pr_carga_kg, decisao.nova_carga_kg);
  const bestReps =
    series?.reduce((m, s) => Math.max(m, s.reps), estado.pr_reps) ??
    estado.pr_reps;

  const memoria = memoriaDaSessao(series, decisao.nova_carga_kg);

  return {
    ...estado,
    carga_atual_kg: decisao.nova_carga_kg,
    alvo_proxima_sessao: {
      carga_kg: decisao.nova_carga_kg,
      faixa_reps: estado.faixa_reps,
      rir_alvo: estado.rir_alvo,
    },
    sessoes_sem_progresso: progrediu
      ? 0
      : estado.sessoes_sem_progresso + 1,
    ultima_progressao_em: progrediu
      ? decisao.data
      : estado.ultima_progressao_em,
    e1rm_estimado_kg: Math.max(estado.e1rm_estimado_kg, e1rm),
    pr_carga_kg: prCarga,
    pr_reps: bestReps,
    origem_carga:
      decisao.regra === "R12" ? "calibracao" : estado.origem_carga,
    primeira_sessao: false,
    ...memoria,
    atualizado_em: new Date().toISOString(),
  };
}

/**
 * Pré-preenche carga/faixa/RIR de uma prescrição a partir do EstadoExercicio.
 * Para top_set_backoff, top_set_kg = alvo (back-off implícito 87,5% no logger).
 */
export function aplicarEstadoNaPrescricao(
  p: Prescricao,
  est: EstadoExercicio,
): Prescricao {
  const isTopBack = p.tecnica === "top_set_backoff";
  const top = est.alvo_proxima_sessao.carga_kg;
  return {
    ...p,
    carga: {
      ...p.carga,
      trabalho_kg: top,
      top_set_kg: isTopBack ? top : p.carga.top_set_kg,
      origem: est.origem_carga,
    },
    faixa_reps: est.alvo_proxima_sessao.faixa_reps,
    rir_alvo: est.alvo_proxima_sessao.rir_alvo,
  };
}

export { e1rmEpley, melhorE1rm };
