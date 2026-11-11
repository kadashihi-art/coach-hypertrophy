/**
 * Estrutura de séries por posição no treino.
 * - Preparação por grupo muscular: o primeiro exercício de um músculo ainda não aquecido ganha
 *   aquecimento → aproximação (feeder). Aquecidos = primário + secundários de compostos anteriores;
 *   isolador anterior aquece só o primário. O 1º exercício sempre tem.
 * - Composto livre pesado (barra/halteres) de um PADRÃO NOVO na sessão, com o músculo já aquecido,
 *   ganha só 1 aproximação: o músculo está quente, mas o movimento e a articulação são outros.
 * - Séries que valem (N ≥ 2): top (carga do motor) → (N−1) back-offs a ~90% do top, com o MESMO
 *   RIR alvo (mais reps). Toda série que conta volume termina perto da falha. Ver docs/series-validas.md.
 * As preparatórias são EXTRAS: não consomem `presc.series`, não contam volume nem progressão.
 * Não altera kg/reps/RIR do motor — só a sequência de fases e a sugestão derivada do top.
 */
import type { Exercicio, Prescricao, TipoSerie } from "@/lib/domain";
import { textoCarga } from "@/lib/catalog/tipo-carga";
import { ehSeriePreparatoria } from "@/lib/domain/enums";

const TECNICAS_FORA_DA_ORDEM = new Set<string>(["drop_set", "rest_pause"]);

/** % do top no back-off (mesmo RIR alvo, mais reps). */
export const PCT_BACKOFF_DO_TOP = 0.9;
/** Se o step for grosso e o back-off cair abaixo disso, repete a carga do top (série reta). */
export const PCT_BACKOFF_MINIMO = 0.8;

/** Arredonda pra baixo no step do exercício (mín. 1 step quando há carga). */
export function arredondarStep(kg: number, stepKg: number): number {
  if (!(kg > 0)) return 0;
  const r = stepKg > 0 ? Math.floor(kg / stepKg + 1e-9) * stepKg : Math.round(kg * 10) / 10;
  return Math.max(stepKg > 0 ? stepKg : 0, Math.round(r * 100) / 100);
}

/** Back-off: ~90% do top pra baixo no step; step grosso demais (< 80%) → mesma carga do top. */
export function cargaBackOff(topKg: number, stepKg: number): number {
  if (!(topKg > 0)) return 0;
  const kg = arredondarStep(topKg * PCT_BACKOFF_DO_TOP, stepKg);
  return kg < topKg * PCT_BACKOFF_MINIMO - 1e-9 ? topKg : kg;
}

/** Cargas da estrutura a partir do top (= carga do motor). `trabalho` = série reta na carga do motor. */
export function cargasDaEstrutura(topKg: number, stepKg: number) {
  return {
    trabalho: topKg,
    top_set: topKg,
    back_off: cargaBackOff(topKg, stepKg),
  };
}

/** Texto do Plano para a ordem das séries (ou "" quando não se aplica). */
export function rotuloOrdemSeries(presc: Pick<Prescricao, "series" | "tecnica">): string {
  const f = fasesDeTrabalho(presc);
  const n = f.filter((x) => x === "back_off").length;
  if (n === 0) return "";
  return `top → ${n > 1 ? `${n}× ` : ""}back-off`;
}

/** Fases de trabalho conforme a prescrição. */
export function fasesDeTrabalho(presc: Pick<Prescricao, "series" | "tecnica">): TipoSerie[] {
  const n = Math.max(0, presc.series);
  // Séries que valem: 1 top → N−1 back-offs, todas no mesmo RIR alvo (nenhuma série "leve" contando volume).
  // N = 1, drop_set e rest_pause ficam como estavam.
  if (n >= 2 && !TECNICAS_FORA_DA_ORDEM.has(presc.tecnica)) {
    return ["top_set", ...Array<TipoSerie>(n - 1).fill("back_off")];
  }
  if (presc.tecnica === "top_set_backoff" && n === 1) return ["top_set"];
  return Array<TipoSerie>(n).fill("trabalho");
}

type ExMusc = Pick<Exercicio, "id" | "grupo_primario" | "grupos_secundarios" | "composto"> &
  Partial<Pick<Exercicio, "padrao" | "equipamento">>;

/** Preparação antes das séries que valem: completa (aquece + aproxima), só aproximação, ou nenhuma. */
export type PrepNivel = "completa" | "aproximacao" | "nenhuma";

/** Padrões que contam como o mesmo movimento pra aproximação (supino reto → inclinado não pede outra). */
const FAMILIA_PADRAO: Record<string, string> = { empurrar_inclinado: "empurrar_horizontal" };
const familia = (padrao: string) => FAMILIA_PADRAO[padrao] ?? padrao;

/** Composto livre (barra, halteres, kettlebell): pede aproximação ao trocar de padrão. */
function compostoLivre(ex: ExMusc): boolean {
  return !!ex.composto && !!ex.equipamento && ["barra", "halteres", "kettlebell"].includes(ex.equipamento);
}

/** Para cada prescrição da sessão: qual preparação ela pede (regra por grupo muscular + padrão novo). */
export function preparacaoDaSessao(
  prescricoes: Pick<Prescricao, "exercicio_id">[],
  exercicios: ExMusc[],
): PrepNivel[] {
  const aquecidos = new Set<string>();
  const padroes = new Set<string>();
  return prescricoes.map((p, i) => {
    const ex = exercicios.find((e) => e.id === p.exercicio_id);
    if (!ex) return i === 0 ? "completa" : "nenhuma";
    let nivel: PrepNivel = i === 0 || !aquecidos.has(ex.grupo_primario) ? "completa" : "nenhuma";
    if (nivel === "nenhuma" && compostoLivre(ex) && ex.padrao && !padroes.has(familia(ex.padrao))) nivel = "aproximacao";
    aquecidos.add(ex.grupo_primario);
    if (ex.composto) for (const g of ex.grupos_secundarios ?? []) aquecidos.add(g);
    if (ex.padrao) padroes.add(familia(ex.padrao));
    return nivel;
  });
}

/** Compatível: true quando o exercício ganha aquecimento + aproximação (regra por grupo muscular). */
export function preparatoriasDaSessao(
  prescricoes: Pick<Prescricao, "exercicio_id">[],
  exercicios: ExMusc[],
): boolean[] {
  return preparacaoDaSessao(prescricoes, exercicios).map((n) => n === "completa");
}

/** Texto curto da preparação (Plano / edição). "" quando vai direto. */
export function textoPreparacao(nivel: PrepNivel | boolean | undefined): string {
  const n = normalizarPrep(nivel ?? false);
  if (n === "completa") return "aquece + aproximação antes";
  if (n === "aproximacao") return "1 aproximação antes (movimento novo)";
  return "";
}

/** `prep`: nível, boolean (regra por grupo) ou número da posição (legado: só posição 0). */
function normalizarPrep(prep: PrepNivel | boolean | number): PrepNivel {
  if (typeof prep === "string") return prep;
  if (typeof prep === "number") return prep === 0 ? "completa" : "nenhuma";
  return prep ? "completa" : "nenhuma";
}

/** Sequência completa de fases para a prescrição. */
export function estruturaSeries(
  presc: Pick<Prescricao, "series" | "tecnica">,
  prep: PrepNivel | boolean | number,
): TipoSerie[] {
  const trabalho = fasesDeTrabalho(presc);
  const n = normalizarPrep(prep);
  if (n === "completa") return ["aquecimento", "feeder", ...trabalho];
  if (n === "aproximacao") return ["feeder", ...trabalho];
  return trabalho;
}

export function temPreparatorias(prep: PrepNivel | boolean | number): boolean {
  return normalizarPrep(prep) !== "nenhuma";
}

/** % do aquecimento (inalterado: 60% da carga de hoje). */
export const PCT_AQUECIMENTO = 0.6;

/** Carga de aquecimento exibida/pré-preenchida: 60% da carga de hoje, arredondada pra baixo ao step do exercício (conservador; mín. 1 step). */
export function cargaAquecimento(cargaHojeKg: number, stepKg: number): number {
  return arredondarStep(cargaHojeKg * PCT_AQUECIMENTO, stepKg);
}

export function textoAquecimento(
  cargaHojeKg: number,
  stepKg: number,
  ex?: Parameters<typeof textoCarga>[1],
  alternado = false,
): string {
  const kg = cargaAquecimento(cargaHojeKg, stepKg);
  return `Aquecimento: ${textoCarga(kg, ex, alternado)} (cerca de 60% da carga de hoje)`;
}

/** % da aproximação sobre a PRIMEIRA série de trabalho efetiva (1ª não preparatória). */
export const PCT_APROXIMACAO = 0.85;

/**
 * Carga da aproximação (feeder): 85% da 1ª série de trabalho efetiva, pra baixo no step.
 * Garante estritamente < 1ª de trabalho (senão trabalho − 1 step, mín. 1 step) e ≥ aquecimento.
 * Colisão (step grosso, ex. trabalho 10 / step 5 / aquecimento 5): o limite "< trabalho" vence;
 * a aproximação pode ficar IGUAL ao aquecimento, nunca abaixo dele nem ≥ trabalho
 * (exceto trabalho = 1 step, onde tudo vale 1 step — não há carga menor disponível).
 */
export function cargaAproximacao(primeiraTrabalhoKg: number, stepKg: number, aquecimentoKg = 0): number {
  if (!(primeiraTrabalhoKg > 0)) return 0;
  const st = stepKg > 0 ? stepKg : 0;
  let kg = arredondarStep(primeiraTrabalhoKg * PCT_APROXIMACAO, st);
  if (st > 0 && kg >= primeiraTrabalhoKg - 1e-9) kg = Math.max(st, Math.round((primeiraTrabalhoKg - st) * 100) / 100);
  if (kg < aquecimentoKg && aquecimentoKg < primeiraTrabalhoKg) kg = aquecimentoKg;
  return kg;
}

/** Carga da 1ª série de trabalho efetiva: N≥2 → o top (a ordem começa nele); N=1/drop/rest-pause → a própria série. */
export function cargaPrimeiraTrabalho(
  presc: Pick<Prescricao, "series" | "tecnica">,
  topKg: number,
  trabalhoKg: number,
  stepKg: number,
): number {
  const f = fasesDeTrabalho(presc);
  if (f.includes("back_off")) {
    const c = cargasDaEstrutura(topKg, stepKg);
    return f[0] === "trabalho" ? c.trabalho : c.top_set;
  }
  return f[0] === "top_set" ? topKg : trabalhoKg;
}

/** Próxima fase a executar dado o que já foi logado (por contagem de preparatórias e de trabalho). */
export function proximaFase(
  presc: Pick<Prescricao, "series" | "tecnica">,
  prep: PrepNivel | boolean | number,
  logados: { tipo_serie: TipoSerie }[],
): TipoSerie | null {
  const est = estruturaSeries(presc, prep);
  const prepFeitas = logados.filter((l) => ehSeriePreparatoria(l.tipo_serie));
  const trabFeitas = logados.length - prepFeitas.length;
  const prepPlan = est.filter((f) => ehSeriePreparatoria(f));
  const trabPlan = est.filter((f) => !ehSeriePreparatoria(f));
  if (trabFeitas === 0) {
    for (const f of prepPlan) {
      if (!prepFeitas.some((l) => l.tipo_serie === f)) return f;
    }
  }
  return trabPlan[trabFeitas] ?? null;
}

/** Séries de trabalho já feitas (para checar conclusão contra presc.series). */
export function seriesTrabalhoFeitas(logados: { tipo_serie: TipoSerie }[]): number {
  return logados.filter((l) => !ehSeriePreparatoria(l.tipo_serie)).length;
}

/** Reps de referência das preparatórias: aquecimento solto, aproximação curta (não cansa antes do top). */
export const REPS_AQUECIMENTO = 8;
export const REPS_APROXIMACAO = 3;

/**
 * Reps sugeridas por fase. Top/trabalho: a sugestão do motor (`repsMotor`).
 * Back-off: ~10% menos carga com o mesmo RIR rende ~3–4 reps a mais descansado; com a fadiga do top,
 * sugerimos +2 sobre o que você fez no top (ou sobre a sugestão do motor), limitado ao topo da faixa.
 */
export function repsSugeridasFase(
  fase: TipoSerie | null,
  faixa: readonly [number, number] | number[],
  repsMotor: number,
  repsTopFeitas?: number | null,
): number {
  if (fase === "aquecimento") return REPS_AQUECIMENTO;
  if (fase === "feeder") return REPS_APROXIMACAO;
  if (fase === "back_off") {
    const base = repsTopFeitas && repsTopFeitas > 0 ? repsTopFeitas : repsMotor;
    return Math.max(faixa[0], Math.min(faixa[1], base + 2));
  }
  return repsMotor;
}
