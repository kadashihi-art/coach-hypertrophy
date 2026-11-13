/**
 * "Hoje só tenho X minutos" (determinístico, ajuste só do dia).
 *
 * Encurta o treino de hoje pra caber no tempo, cortando primeiro o que menos rende:
 *  1) séries, uma de cada vez, até 2 por exercício (as primeiras séries de cada exercício são as que
 *     mais rendem): isoladores não prioritários → compostos repetidos do mesmo músculo → o resto;
 *  2) exercícios inteiros (ficam "pulados hoje"): isolador de músculo que um composto do treino já
 *     trabalha → outros isoladores → composto repetido do mesmo músculo.
 * Nunca pula o primeiro exercício de cada músculo nem os de músculo prioritário antes dos demais,
 * e sempre sobram pelo menos 2 exercícios.
 * Não mexe em kg, reps nem RIR. A base do plano não muda: na semana seguinte o treino volta inteiro.
 */
import type { Exercicio, GrupoMuscular, Prescricao } from "@/lib/domain";

const SERIES_MIN = 2;
const EXERCICIOS_MIN = 2;

export type MudancaTempo = { prescricao_id: string; exercicio_id: string; de: number; para: number; pulado: boolean };

export type TreinoEncurtado = {
  prescricoes: Prescricao[];
  mudancas: MudancaTempo[];
  duracao_antes: number;
  duracao_depois: number;
  /** false quando nem o mínimo que rende cabe no tempo pedido. */
  cabe: boolean;
};

/** Tira a marca de "pulado hoje" (ponto de partida de todo treino). */
export function limparPulos(ps: Prescricao[]): Prescricao[] {
  return ps.map((p) => {
    if (!p.pulado_hoje) return p;
    const { pulado_hoje: _p, ...rest } = p;
    void _p;
    return rest;
  });
}

export const ativos = <T extends Pick<Prescricao, "pulado_hoje">>(ps: T[]): T[] => ps.filter((p) => !p.pulado_hoje);

export function encurtarTreino(args: {
  prescricoes: Prescricao[];
  exercicios: Pick<Exercicio, "id" | "grupo_primario" | "grupos_secundarios" | "composto">[];
  minutos: number;
  prioridades?: GrupoMuscular[];
  /** Minutos estimados (mesma conta do plano). */
  duracao: (ps: Prescricao[]) => number;
}): TreinoEncurtado {
  const byId = new Map(args.exercicios.map((e) => [e.id, e]));
  const pri = args.prioridades ?? [];
  const ps = limparPulos(args.prescricoes).sort((a, b) => a.ordem - b.ordem).map((p) => ({ ...p }));
  const original = new Map(ps.map((p) => [p.id, p.series]));
  const pulados = new Set<string>();
  const vivos = () => ps.filter((p) => !pulados.has(p.id));
  const dur = () => args.duracao(vivos());
  const duracao_antes = dur();
  const g = (p: Prescricao) => byId.get(p.exercicio_id)?.grupo_primario;
  const composto = (p: Prescricao) => !!byId.get(p.exercicio_id)?.composto;
  const prioritario = (p: Prescricao) => {
    const x = g(p);
    return !!x && pri.includes(x);
  };
  /** Primeiro exercício (vivo) do músculo no treino. */
  const primeiroDoMusculo = (p: Prescricao) => vivos().find((x) => g(x) === g(p))?.id === p.id;
  /** Algum composto vivo (que não ele) trabalha o músculo dele, como principal ou secundário. */
  const cobertoPorComposto = (p: Prescricao) =>
    vivos().some((x) => {
      if (x.id === p.id || !composto(x)) return false;
      const ex = byId.get(x.exercicio_id);
      const alvo = g(p);
      return !!alvo && (ex?.grupo_primario === alvo || (ex?.grupos_secundarios ?? []).includes(alvo));
    });

  // Menor valor primeiro. Empate: quem tem mais séries, depois quem vem mais tarde no treino.
  const valorSerie = (p: Prescricao) => (prioritario(p) ? 4 : 0) + (composto(p) ? (primeiroDoMusculo(p) ? 3 : 1) : 0);
  const valorExercicio = (p: Prescricao) => (prioritario(p) ? 4 : 0) + (composto(p) ? 2 : cobertoPorComposto(p) ? 0 : 1);

  let guard = 200;
  while (dur() > args.minutos && guard-- > 0) {
    const c = vivos()
      .filter((p) => p.series > SERIES_MIN)
      .sort((a, b) => valorSerie(a) - valorSerie(b) || b.series - a.series || b.ordem - a.ordem)[0];
    if (!c) break;
    c.series -= 1;
  }
  while (dur() > args.minutos && guard-- > 0) {
    if (vivos().length <= EXERCICIOS_MIN) break;
    const c = vivos()
      .filter((p) => !(composto(p) && primeiroDoMusculo(p)))
      .sort((a, b) => valorExercicio(a) - valorExercicio(b) || b.ordem - a.ordem)[0];
    if (!c) break;
    pulados.add(c.id);
  }

  const prescricoes = ps.map((p) => (pulados.has(p.id) ? { ...p, series: original.get(p.id)!, pulado_hoje: true } : p));
  const mudancas: MudancaTempo[] = ps
    .filter((p) => pulados.has(p.id) || p.series !== original.get(p.id))
    .map((p) => ({ prescricao_id: p.id, exercicio_id: p.exercicio_id, de: original.get(p.id)!, para: pulados.has(p.id) ? 0 : p.series, pulado: pulados.has(p.id) }));
  const duracao_depois = dur();
  return { prescricoes, mudancas, duracao_antes, duracao_depois, cabe: duracao_depois <= args.minutos };
}

/** Opções de tempo a oferecer (menores que o treino completo, com folga de 5 min). */
export function opcoesDeTempo(duracaoCompleta: number): number[] {
  return [60, 45, 30].filter((m) => m <= duracaoCompleta - 5);
}
