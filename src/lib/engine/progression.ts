import { ehSeriePreparatoria } from "@/lib/domain/enums";
/**
 * Motor determinístico R1–R12 (brief-produto-v1 §6).
 * IA NÃO inventa números — só este motor calcula carga/ação.
 */
import type {
  Checkin,
  DecisaoProgressao,
  DesempenhoSessao,
  EstadoExercicio,
  GrupoMuscular,
  Prescricao,
  RegistroSerie,
  VolumeSemanal,
} from "@/lib/domain";
import { incrementoCargaKg, VOLUME_MAX, VOLUME_MIN } from "@/lib/domain";
import { roundToStep } from "./ancorar-carga";
import { e1rmEpley, melhorE1rm } from "./e1rm";
import { recordeDasSeries, RECORDE_VAZIO } from "./recordes";
import { ehSemanaDeload } from "@/lib/plan/mesociclo";
import { calibrarSerie } from "./proximidade-falha";

export type ProgressionInput = {
  exercicio_id: string;
  sessao_id: string;
  grupo_primario: GrupoMuscular;
  series: RegistroSerie[];
  estado: EstadoExercicio;
  checkin?: Checkin | null;
  /** Volume efetivo do grupo nas últimas 2 semanas (mais recente primeiro). */
  volume_semanal_grupo?: VolumeSemanal[];
  /** Semana EFETIVA (mesocicloEfetivo) e total do mesociclo (R6). */
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

/** Margem mínima de e1RM (kg) para contar como melhora, evitando ruído de arredondamento. */
const E1RM_EPS = 0.05;

/**
 * Resumo da sessão para medir progresso: carga da âncora, reps nas séries dessa
 * carga (na ordem) e melhor e1RM. Preparatórias e séries sem reps ficam de fora.
 * Peso corporal (0 kg) entra só pelas reps. null sem série válida.
 */
export function desempenhoDaSessao(series: RegistroSerie[]): DesempenhoSessao | null {
  const work = trabalho(series)
    .filter((s) => s.reps > 0)
    .slice()
    .sort((a, b) => a.numero - b.numero);
  const anchor = pickTopSetAnchor(work);
  if (!anchor) return null;
  const carga = anchor.carga_kg;
  return {
    carga_kg: carga,
    reps_na_carga: work.filter((s) => s.carga_kg >= carga - 1e-9).map((s) => s.reps),
    e1rm_kg: recordeDasSeries(work).e1rm_estimado_kg,
  };
}

/**
 * Houve progresso em relação à sessão anterior? Conta como progresso:
 * - e1RM da melhor série maior (mais carga ou mais reps); ou
 * - mesma carga (ou mais) e mais reps somadas nas séries comparáveis (as primeiras N,
 *   N = menor número de séries feitas nessa carga entre as duas sessões).
 * Fazer +1 rep na dupla progressão (R2) é progresso — não é platô.
 */
export function houveProgresso(
  atual: DesempenhoSessao | null,
  anterior: DesempenhoSessao | null | undefined,
): boolean {
  if (!atual || !anterior) return false;
  if (atual.e1rm_kg > anterior.e1rm_kg + E1RM_EPS) return true;
  if (atual.carga_kg + 1e-9 < anterior.carga_kg) return false;
  const k = Math.min(atual.reps_na_carga.length, anterior.reps_na_carga.length);
  if (k === 0) return false;
  const soma = (xs: number[]) => xs.slice(0, k).reduce((a, b) => a + b, 0);
  const sa = soma(atual.reps_na_carga);
  const sp = soma(anterior.reps_na_carga);
  return atual.carga_kg > anterior.carga_kg + 1e-9 ? sa >= sp : sa > sp;
}

/**
 * Platô (R5): 3+ sessões seguidas sem progresso. Só vale com o desempenho registrado:
 * em estado antigo o contador contava +1 rep como "sem progresso" e não é confiável.
 */
export function emPlato(
  estado: Pick<EstadoExercicio, "sessoes_sem_progresso" | "ultimo_desempenho">,
): boolean {
  return estado.sessoes_sem_progresso >= 3 && !!estado.ultimo_desempenho;
}

/** Carga do deload: ~−10% no degrau do equipamento. Se o degrau não deixa descer, mantém (o deload fica nas séries). */
export function cargaDeloadKg(carga: number, step: number): number {
  const r = roundToStep(carga * 0.9, step);
  return r < carga ? r : carga;
}

/**
 * Salto relativo máximo para subir "no automático". O degrau do equipamento é fixo
 * (2,5 kg superiores / 5 kg inferiores): em carga leve ele vira um salto enorme
 * (6 → 8,5 kg = +42% numa elevação lateral). Acima disto, a subida só sai quando cabe.
 */
export const SALTO_RELATIVO_MAX = 0.1;
/** Reps além do topo da faixa aceitas antes de subir mesmo com salto grande (evita travar para sempre). */
export const REPS_ALEM_DO_TOPO_MAX = 4;

/** Melhor e1RM com RIR (reps até a falha ≈ reps + RIR) das séries. 0 sem carga externa. */
function e1rmComRir(series: RegistroSerie[]): number {
  let best = 0;
  for (const s of series) {
    if (!(s.carga_kg > 0) || !(s.reps > 0)) continue;
    best = Math.max(best, s.carga_kg * (1 + (s.reps + Math.max(0, s.rir_percebido)) / 30));
  }
  return best;
}

/**
 * A carga nova cabe? Salto ≤ SALTO_RELATIVO_MAX: sim. Salto maior: só quando a conta
 * (e1RM com RIR, Epley) prevê o piso da faixa na carga nova com o RIR alvo, ou quando a
 * 1ª série já passou REPS_ALEM_DO_TOPO_MAX reps do topo. Sem carga externa: sempre cabe.
 */
export function subidaCabe(args: {
  cargaKg: number;
  novaKg: number;
  series: RegistroSerie[];
  faixaReps: [number, number];
  rirAlvo: number;
}): { cabe: boolean; salto: number; repsPrevistas: number | null } {
  const { cargaKg, novaKg, series, faixaReps, rirAlvo } = args;
  if (!(cargaKg > 0) || !(novaKg > cargaKg)) return { cabe: true, salto: 0, repsPrevistas: null };
  const salto = (novaKg - cargaKg) / cargaKg;
  if (salto <= SALTO_RELATIVO_MAX + 1e-9) return { cabe: true, salto, repsPrevistas: null };
  const e1 = e1rmComRir(series);
  const repsPrevistas = e1 > 0 ? Math.floor(30 * (e1 / novaKg - 1) - Math.max(0, rirAlvo) + 1e-9) : 0;
  const primeira = [...series].sort((a, b) => a.numero - b.numero)[0];
  const passouDoTopo = !!primeira && primeira.reps >= faixaReps[1] + REPS_ALEM_DO_TOPO_MAX;
  return { cabe: repsPrevistas >= faixaReps[0] || passouDoTopo, salto, repsPrevistas };
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Carga realmente levantada na série-âncora (top → trabalho mais pesada). null sem série válida. */
export function cargaRealDaSessao(series: RegistroSerie[]): number | null {
  const a = pickTopSetAnchor(series.filter((s) => s.carga_kg > 0 && s.reps > 0));
  return a ? a.carga_kg : null;
}

/**
 * R12 — calibração real da primeira sessão.
 *
 * A estimativa inicial é conservadora de propósito. Na 1ª sessão o usuário já
 * entrega reps + RIR reais, então o motor converte isso em e1RM e calcula a
 * carga que deixa o PISO da faixa no RIR alvo (ponto de partida com espaço
 * para a dupla progressão). O salto é limitado por sessão para não inventar
 * carga: RIR alto libera mais degraus, RIR apertado limita a subida.
 *
 * Retorna null quando não há série válida ou quando não existe carga externa
 * (peso corporal/core): aí a calibração mantém 0 kg.
 */
export function calibrarCargaInicial(args: {
  cargaAtualKg: number;
  /** Séries de trabalho (preparatórias já filtradas). */
  series: RegistroSerie[];
  faixaReps: [number, number];
  rirAlvo: number;
  stepKg: number;
}): { cargaKg: number; anchor: RegistroSerie } | null {
  const { cargaAtualKg, faixaReps, rirAlvo } = args;
  const step = args.stepKg > 0 ? args.stepKg : 2.5;
  if (!(cargaAtualKg > 0)) return null;

  const anchor = pickTopSetAnchor(args.series);
  if (!anchor || !(anchor.carga_kg > 0) || anchor.reps <= 0) return null;

  // Reps até a falha ≈ reps feitas + RIR percebido.
  const repsNaFalha = anchor.reps + Math.max(0, anchor.rir_percebido);
  const e1rmSessao = anchor.carga_kg * (1 + repsNaFalha / 30);

  // Piso da faixa no RIR alvo: começa a faixa com margem para progredir reps.
  const repsAlvo = faixaReps[0] + Math.max(0, rirAlvo);
  const bruta = e1rmSessao / (1 + repsAlvo / 30);

  // Limite de segurança por sessão, relativo ao que o usuário LEVANTOU (não à
  // estimativa): RIR alto libera mais degraus, RIR apertado limita a subida.
  // A estimativa inicial é só um palpite — se ele já levantou mais, a carga real vence.
  const real = anchor.carga_kg;
  const degrausSubida =
    anchor.rir_percebido >= 3 ? 2 : anchor.rir_percebido >= 2 ? 1 : 0;
  const maxSubida = degrausSubida * step;
  const piso = Math.max(real * 0.85, real - 3 * step);
  const limitada = Math.min(real + maxSubida, Math.max(piso, bruta));
  // Subir arredonda pra cima: se a conta pede 11 kg e o step é 2,5, 10 kg ficaria parado.
  const cargaKg =
    bruta > real + 0.01
      ? Math.max(step, Math.ceil((limitada - 1e-9) / step) * step)
      : Math.max(step, roundToStep(limitada, step));
  void cargaAtualKg;

  return { cargaKg, anchor };
}

/**
 * Avalia R1–R12 em ordem de prioridade de segurança → volume → progressão.
 * Retorna a primeira regra que dispara (uma decisão por exercício/sessão).
 */
export function decidirProgressao(
  input: ProgressionInput,
): DecisaoProgressao {
  const { series, ajustes } = rirPelaQueda(trabalho(input.series));
  const d = decidir(input, series);
  if (ajustes.length === 0 || !REGRAS_COM_RIR.has(d.regra)) return d;
  const txt = ajustes
    .map((a) => `série ${a.numero} marcada RIR ${a.relatado}, considerei ${a.considerado}`)
    .join("; ");
  return { ...d, motivo: `${d.motivo} (RIR ajustado pela queda de reps: ${txt}.)` };
}

/** Regras cuja decisão depende do RIR (as outras não ganham a nota de RIR ajustado). */
const REGRAS_COM_RIR = new Set<DecisaoProgressao["regra"]>(["R1", "R2", "R3", "R8", "R12"]);

/**
 * RIR de cada série corrigido pela queda de reps na série seguinte com a mesma carga
 * (calibrarSerie, sem e1RM histórico). Ex.: marcou RIR 3 e caiu 3+ reps na próxima → estava
 * perto; marcou RIR ≤ 1 e repetiu as reps → sobrava. Só muda com sinal forte (2+ reps).
 * O e1RM histórico fica de fora de propósito: ele fica velho justo quando a pessoa melhora,
 * e leria um PR como "mais perto da falha", freando a progressão.
 */
export function rirPelaQueda(series: RegistroSerie[]): {
  series: RegistroSerie[];
  ajustes: { numero: number; relatado: number; considerado: number }[];
} {
  const ord = [...series].sort((a, b) => a.numero - b.numero);
  const ajustes: { numero: number; relatado: number; considerado: number }[] = [];
  const out = ord.map((s, i) => {
    const c = calibrarSerie({ serie: s, proxima: ord[i + 1] ?? null });
    if (c.rir_interpretado === s.rir_percebido) return s;
    ajustes.push({ numero: s.numero, relatado: s.rir_percebido, considerado: c.rir_interpretado });
    return { ...s, rir_percebido: c.rir_interpretado };
  });
  return { series: out, ajustes };
}

function decidir(input: ProgressionInput, series: RegistroSerie[]): DecisaoProgressao {
  const estado = input.estado;
  const [piso, topo] = estado.faixa_reps;
  const inc = incrementoCargaKg(input.grupo_primario);
  // Carga de referência = o que o usuário REALMENTE levantou na série-âncora
  // (top, senão a trabalho mais pesada). Se ele subiu/adaptou a carga sugerida
  // por conta própria, a progressão parte daí — não do número antigo do estado.
  const real = cargaRealDaSessao(series);
  const carga = real ?? estado.carga_atual_kg;

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

  // —— R12 Calibração inicial (1ª sessão com estimativa conservadora) ——
  if (
    estado.origem_carga === "estimativa_conservadora" &&
    estado.primeira_sessao
  ) {
    const calib = calibrarCargaInicial({
      cargaAtualKg: carga,
      series,
      faixaReps: estado.faixa_reps,
      rirAlvo: estado.rir_alvo,
      stepKg: inc,
    });

    if (!calib) {
      return base(
        input,
        "R12",
        "manter_e_checar",
        carga,
        carga > 0
          ? "Primeira sessão sem série de trabalho válida para calibrar. Mantém a estimativa e recalibra na próxima."
          : "Exercício sem carga externa (peso corporal/core). Mantém 0 kg e progride por reps.",
        "pratica",
      );
    }

    const alvo = calib.cargaKg;
    const delta = Math.round((alvo - estado.carga_atual_kg) * 10) / 10;
    const acao =
      delta > 0 ? "subir_carga" : delta < 0 ? "reduzir_carga" : "manter_carga";
    const { anchor } = calib;
    const motivo =
      `Primeira sessão: ${anchor.carga_kg} kg × ${anchor.reps} reps @ RIR ${anchor.rir_percebido}. ` +
      `Calibrado para ~${estado.faixa_reps[0]} reps @ RIR ${estado.rir_alvo} → ${alvo} kg ` +
      `(antes ${estado.carga_atual_kg} kg).`;

    return base(input, "R12", acao, alvo, motivo, "pratica", delta > 0);
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

  // —— R6 Deload programado (última semana do bloco) ——
  // A carga do dia já vem −10% pelo ajuste do check-in; aqui a base do exercício fica
  // guardada (não cai a cada treino da semana) para a volta depois do deload.
  const meso = input.mesociclo;
  if (ehSemanaDeload(meso)) {
    return base(
      input,
      "R6",
      "deload",
      estado.carga_atual_kg,
      `Semana ${meso!.semana_atual} de ${meso!.total_semanas} (foco ${meso!.foco}): deload programado. Treino do dia −10% de carga; a base de ${estado.carga_atual_kg} kg fica guardada para a próxima semana.`,
      "contextual",
    );
  }

  // —— R5 Deload por platô ——
  if (emPlato(estado)) {
    return base(
      input,
      "R5",
      "deload",
      cargaDeloadKg(carga, inc),
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

    // Salto grande em carga leve: segura a carga e progride por reps até a carga nova caber.
    const novaTop = Math.round((topKg + inc) * 10) / 10;
    const querSubir = rir <= 1 || (reps >= topo && rir <= 2);
    if (querSubir) {
      const c = subidaCabe({ cargaKg: topKg, novaKg: novaTop, series: [anchor], faixaReps: estado.faixa_reps, rirAlvo: estado.rir_alvo });
      if (!c.cabe) {
        return base(
          input,
          "R8",
          "manter_carga",
          topKg,
          `Top set ${topKg} kg pronto pra subir, mas ${inc} kg é um salto de ${pct(c.salto)} nessa carga. Manter ${topKg} kg e buscar mais reps (até ${topo + REPS_ALEM_DO_TOPO_MAX}) antes de subir.`,
          "moderado",
        );
      }
    }

    // RIR ≤ 1 e reps OK → sobe (Iury: RIR≤1 sobe)
    if (rir <= 1) {
      const nova = novaTop;
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
      const nova = novaTop;
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

  // R4 conta falhas em todas as séries que valem (limiar inalterado: ≥ 2).
  const abaixoPiso = series.filter((s) => s.reps < piso).length;
  // Estrutura trabalho → top → back-off: R1–R3 avaliam o top (reps/RIR do top vs alvo).
  const tops = series.filter((s) => s.tipo_serie === "top_set");
  // Sem top set, avalia as séries de trabalho (back-off é mais leve de propósito e não entra).
  const semBackOff = series.filter((s) => s.tipo_serie !== "back_off");
  const avaliadas = tops.length > 0 ? tops : semBackOff.length > 0 ? semBackOff : series;
  // Série avaliada feita com menos carga que a âncora não prova a carga cheia.
  const maisLeves = avaliadas.filter((s) => s.carga_kg < carga - 0.01);
  const rirBaixo = avaliadas.filter((s) => s.rir_percebido < estado.rir_alvo).length;
  // Reps acima do topo não tiram da faixa (acontece quando a subida espera um salto caber).
  const todasNaFaixa = avaliadas.every((s) => s.reps >= piso);
  const todasNoTopo = avaliadas.every((s) => s.reps >= topo);
  const ultima = avaliadas[avaliadas.length - 1]!;
  const rirUltimaOk = ultima.rir_percebido >= estado.rir_alvo;
  const todasRirOk = avaliadas.every((s) => s.rir_percebido >= estado.rir_alvo);
  const repsAbaixoTopo = avaliadas.some((s) => s.reps < topo);

  // —— R4 Reduzir por falha prematura ——
  if (abaixoPiso >= 2) {
    const nova = roundToStep(carga * 0.925, inc); // ~7.5% (meio de 5–10%), no step do equipamento
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
  // Estrito: todas no topo e RIR da última ≥ alvo.
  // Tolerante (a fadiga derruba as séries de trás na mesma carga): 1ª série no topo com
  // RIR ≥ alvo, as outras a no máximo 2 reps do topo, perdendo em média até 1 rep por
  // série, e a última com RIR ≥ alvo − 1.
  const ordenadas = [...avaliadas].sort((a, b) => a.numero - b.numero);
  const primeira = ordenadas[0]!;
  const ultimaOrd = ordenadas[ordenadas.length - 1]!;
  const somaReps = ordenadas.reduce((a, x) => a + x.reps, 0);
  const r1Estrito = todasNoTopo && rirUltimaOk;
  const r1Tolerante =
    ordenadas.length >= 2 &&
    primeira.reps >= topo &&
    primeira.rir_percebido >= estado.rir_alvo &&
    ordenadas.every((x) => x.reps >= Math.max(piso, topo - 2)) &&
    somaReps >= topo * ordenadas.length - (ordenadas.length - 1) &&
    ultimaOrd.rir_percebido >= estado.rir_alvo - 1;
  if ((r1Estrito || r1Tolerante) && maisLeves.length > 0) {
    const ex = maisLeves[0]!;
    return base(
      input,
      "R2",
      "manter_carga",
      carga,
      `Reps no topo, mas a série ${ex.numero} foi com ${ex.carga_kg} kg (abaixo de ${carga} kg). Pra subir, todas as séries precisam sair na carga cheia. Manter ${carga} kg.`,
      "forte",
    );
  }
  if (r1Estrito || r1Tolerante) {
    const um = Math.round((carga + inc) * 10) / 10;
    const c1 = subidaCabe({ cargaKg: carga, novaKg: um, series: avaliadas, faixaReps: estado.faixa_reps, rirAlvo: estado.rir_alvo });
    if (!c1.cabe) {
      return base(
        input,
        "R2",
        "manter_carga",
        carga,
        `Pronto pra subir, mas ${inc} kg é um salto de ${pct(c1.salto)} em ${carga} kg. Manter a carga e buscar mais reps (até ${topo + REPS_ALEM_DO_TOPO_MAX}) antes de subir.`,
        "forte",
      );
    }
    // Muita sobra (RIR ≥ alvo + 2 em todas, no estrito) → 2 degraus, se o salto total couber; senão 1.
    const folga = r1Estrito && avaliadas.every((x) => x.rir_percebido >= estado.rir_alvo + 2);
    const dois = Math.round((carga + 2 * inc) * 10) / 10;
    const doisCabe =
      folga &&
      (carga <= 0 ||
        ((dois - carga) / carga <= SALTO_RELATIVO_MAX + 1e-9 &&
          subidaCabe({ cargaKg: carga, novaKg: dois, series: avaliadas, faixaReps: estado.faixa_reps, rirAlvo: estado.rir_alvo }).cabe));
    const nova = doisCabe ? dois : um;
    return base(
      input,
      "R1",
      "subir_carga",
      nova,
      r1Estrito
        ? `Todas as séries no topo da faixa (${topo}) e RIR da última ≥ alvo (${estado.rir_alvo}). Subir ${Math.round((nova - carga) * 10) / 10} kg; reiniciar faixa.`
        : `1ª série no topo (${topo}) com RIR ${primeira.rir_percebido} e as outras perto dele (${ordenadas.map((x) => x.reps).join("/")}). Subir ${inc} kg; reiniciar faixa.`,
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
  // Progresso = subir carga OU melhorar o desempenho (reps/e1RM) frente à sessão anterior.
  const atual = series ? desempenhoDaSessao(series) : null;
  const desempAnterior = estado.ultimo_desempenho ?? null;
  const progrediuDesempenho = desempAnterior
    ? houveProgresso(atual, desempAnterior)
    : // Estado antigo sem desempenho: compara com o PR real (se houver).
      !!atual && estado.pr_reps > 0 && atual.e1rm_kg > estado.e1rm_estimado_kg + E1RM_EPS;
  const progrediu = decisao.acao === "subir_carga" || progrediuDesempenho;
  // Deload e calibração recomeçam a contagem; dor (R7) e prontidão baixa (R9) não contam como platô.
  const zera = progrediu || decisao.acao === "deload" || decisao.regra === "R12";
  const neutra = decisao.regra === "R7" || decisao.regra === "R9";
  const sessoesSemProgresso = zera
    ? 0
    : !desempAnterior
      ? // Contador antigo não é confiável (contava +1 rep como platô): recomeça daqui.
        neutra ? 0 : 1
      : neutra
        ? estado.sessoes_sem_progresso
        : estado.sessoes_sem_progresso + 1;
  // R12 sem série válida não calibra de fato: mantém a pendência para a próxima
  // sessão (só quando existe carga externa; peso corporal/core já está calibrado).
  const calibracaoAdiada =
    decisao.regra === "R12" &&
    decisao.acao === "manter_e_checar" &&
    estado.carga_atual_kg > 0;

  const workSets = series?.filter((s) => !ehSeriePreparatoria(s.tipo_serie)) ?? [];
  // PR/e1RM só de séries reais (melhor série de trabalho por e1RM). Estado antigo com
  // PR de 0 reps era estimativa (nunca levantada) e não conta.
  const daSessao = recordeDasSeries(workSets);
  const anterior =
    estado.pr_reps > 0
      ? { e1rm_estimado_kg: estado.e1rm_estimado_kg, pr_carga_kg: estado.pr_carga_kg, pr_reps: estado.pr_reps }
      : RECORDE_VAZIO;
  const recorde = daSessao.e1rm_estimado_kg > anterior.e1rm_estimado_kg ? daSessao : anterior;

  const memoria = memoriaDaSessao(series, decisao.nova_carga_kg);

  return {
    ...estado,
    carga_atual_kg: decisao.nova_carga_kg,
    alvo_proxima_sessao: {
      carga_kg: decisao.nova_carga_kg,
      faixa_reps: estado.faixa_reps,
      rir_alvo: estado.rir_alvo,
    },
    sessoes_sem_progresso: sessoesSemProgresso,
    ultimo_desempenho: atual ?? desempAnterior,
    ultima_progressao_em: progrediu
      ? decisao.data
      : estado.ultima_progressao_em,
    ...recorde,
    origem_carga:
      decisao.regra === "R12" && !calibracaoAdiada
        ? "calibracao"
        : estado.origem_carga,
    primeira_sessao: calibracaoAdiada ? estado.primeira_sessao : false,
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
