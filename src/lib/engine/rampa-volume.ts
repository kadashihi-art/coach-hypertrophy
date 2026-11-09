/**
 * Rampa de volume ao longo do bloco (determinística, ajuste só do dia).
 *
 * O plano define a base de séries. Ao longo das semanas de trabalho o motor soma séries no
 * exercício principal de cada grupo do treino, pra subir o estímulo aos poucos até o deload:
 *   semanas 1–2: base · 3–4: +1 · 5 em diante (antes do deload): +2. Iniciante: no máximo +1.
 * Travas (o grupo fica na base):
 *   - check-in ruim hoje (sono < 6 h ou disposição 1–2), semana de deload ou bloco já terminado;
 *   - exercício travado (2+ sessões sem progresso) ou que chegou no limite (RIR da última < alvo − 1);
 *   - dor registrada no exercício nos últimos 14 dias;
 *   - teto semanal do grupo (faixaVolume.max) já alcançado pela base do plano;
 *   - no máximo SERIES_MAX_EXERCICIO séries no exercício.
 * Nada aqui grava: quem aplica é o início do treino, guardando o extra em `ajuste_series_dia`.
 */
import type {
  Checkin,
  EstadoExercicio,
  Exercicio,
  GrupoMuscular,
  Mesociclo,
  Prescricao,
  RegistroSerie,
  Sessao,
} from "@/lib/domain";
import { faixaVolume, GRUPOS_OPCIONAIS, volumeEfetivo } from "@/lib/domain";
import { diaSP } from "@/lib/inicio";
import { ehSemanaDeload } from "@/lib/plan/mesociclo";

export const SERIES_MAX_EXERCICIO = 5;
const DIAS_DOR = 14;

/** Base do plano (sem o ajuste do dia). */
export function seriesBase(p: Pick<Prescricao, "series" | "ajuste_series_dia">): number {
  return Math.max(1, p.series - (p.ajuste_series_dia ?? 0));
}

/** Prescrições com as séries de volta na base (ponto de partida de todo ajuste do dia). */
export function voltarParaBase(ps: Prescricao[]): Prescricao[] {
  return ps.map((p) => {
    if (!p.ajuste_series_dia) return p;
    const { ajuste_series_dia: _a, ...rest } = p;
    void _a;
    return { ...rest, series: seriesBase(p) };
  });
}

/** Grava em cada prescrição o ajuste do dia (séries finais − base). Sem ajuste, o campo some. */
export function marcarAjusteDoDia(base: Prescricao[], dia: Prescricao[]): Prescricao[] {
  const porId = new Map(base.map((p) => [p.id, seriesBase(p)]));
  return dia.map((p) => {
    const b = porId.get(p.id);
    const { ajuste_series_dia: _a, ...rest } = p;
    void _a;
    if (b == null || p.series === b) return rest;
    return { ...rest, ajuste_series_dia: p.series - b };
  });
}

/** Séries extras da semana do bloco (0 no deload e depois do fim do bloco). */
export function extraDaSemana(
  meso: Pick<Mesociclo, "semana_atual" | "total_semanas" | "foco"> | null | undefined,
  experiencia?: string | null,
): number {
  if (!meso || meso.foco === "deload") return 0;
  if (meso.semana_atual >= meso.total_semanas) return 0;
  const extra = Math.min(2, Math.floor((meso.semana_atual - 1) / 2));
  return experiencia === "iniciante" ? Math.min(1, extra) : extra;
}

export type AjusteRampa = {
  prescricao_id: string;
  exercicio_id: string;
  grupo: GrupoMuscular;
  series_antes: number;
  series_depois: number;
};

export type TravaRampa = { exercicio_id: string; grupo: GrupoMuscular; motivo: string };

export type ResultadoRampa = {
  prescricoes: Prescricao[];
  ajustes: AjusteRampa[];
  travas: TravaRampa[];
  extra: number;
};

/** Volume semanal planejado (base, efetivo) e quantos treinos da semana têm o grupo como principal. */
export function baseSemanal(sessoes: Sessao[], exercicios: Exercicio[]): {
  efetivo: Map<GrupoMuscular, number>;
  frequencia: Map<GrupoMuscular, number>;
} {
  const dir = new Map<GrupoMuscular, number>();
  const ind = new Map<GrupoMuscular, number>();
  const freq = new Map<GrupoMuscular, number>();
  for (const s of sessoes) {
    const nesta = new Set<GrupoMuscular>();
    for (const p of s.prescricoes) {
      const ex = exercicios.find((e) => e.id === p.exercicio_id);
      if (!ex) continue;
      const n = seriesBase(p);
      dir.set(ex.grupo_primario, (dir.get(ex.grupo_primario) ?? 0) + n);
      for (const g of ex.grupos_secundarios) ind.set(g, (ind.get(g) ?? 0) + n);
      nesta.add(ex.grupo_primario);
    }
    for (const g of nesta) freq.set(g, (freq.get(g) ?? 0) + 1);
  }
  const efetivo = new Map<GrupoMuscular, number>();
  for (const g of new Set([...dir.keys(), ...ind.keys()])) {
    efetivo.set(g, volumeEfetivo(dir.get(g) ?? 0, ind.get(g) ?? 0));
  }
  return { efetivo, frequencia: freq };
}

export function aplicarRampaVolume(args: {
  /** Prescrições do treino de hoje já na base (voltarParaBase). */
  prescricoes: Prescricao[];
  exercicios: Exercicio[];
  estados: EstadoExercicio[];
  /** Mesociclo com a semana efetiva (mesocicloEfetivo). */
  mesociclo: Mesociclo | null | undefined;
  experiencia?: string | null;
  checkin?: Pick<Checkin, "sono_h" | "prontidao"> | null;
  /** Sessões da semana (fase ativa), para o teto semanal por grupo. */
  sessoesDaSemana: Sessao[];
  registros?: RegistroSerie[];
  hojeIso?: string | null;
}): ResultadoRampa {
  const { prescricoes, exercicios, estados, mesociclo } = args;
  const nada: ResultadoRampa = { prescricoes, ajustes: [], travas: [], extra: 0 };
  const ck = args.checkin;
  if (ck && (ck.prontidao <= 2 || ck.sono_h < 6)) return nada;
  if (ehSemanaDeload(mesociclo)) return nada;
  const extra = extraDaSemana(mesociclo, args.experiencia);
  if (extra <= 0) return nada;

  const hoje = diaSP(args.hojeIso ?? null);
  const limiteDor = hoje ? new Date(Date.parse(hoje + "T12:00:00Z") - DIAS_DOR * 86400000).toISOString().slice(0, 10) : null;
  const comDor = new Set(
    (args.registros ?? [])
      .filter((r) => r.dor && (!limiteDor || (diaSP(r.executado_em) ?? "") >= limiteDor))
      .map((r) => r.exercicio_id),
  );
  const { efetivo, frequencia } = baseSemanal(args.sessoesDaSemana, exercicios);

  // Exercício principal de cada grupo no treino de hoje = o primeiro dele na ordem.
  const principal = new Map<GrupoMuscular, Prescricao>();
  for (const p of [...prescricoes].sort((a, b) => a.ordem - b.ordem)) {
    const ex = exercicios.find((e) => e.id === p.exercicio_id);
    if (!ex || GRUPOS_OPCIONAIS.includes(ex.grupo_primario)) continue;
    if (!principal.has(ex.grupo_primario)) principal.set(ex.grupo_primario, p);
  }

  const ajustes: AjusteRampa[] = [];
  const travas: TravaRampa[] = [];
  const novas = new Map<string, number>();
  for (const [grupo, p] of principal) {
    const est = estados.find((e) => e.exercicio_id === p.exercicio_id);
    const trava = (motivo: string) => travas.push({ exercicio_id: p.exercicio_id, grupo, motivo });
    if (comDor.has(p.exercicio_id)) { trava("dor registrada nos últimos 14 dias"); continue; }
    if (est && est.sessoes_sem_progresso >= 2) { trava("travado há 2+ treinos"); continue; }
    if (est && est.ultimo_rir != null && est.ultimo_rir < est.rir_alvo - 1) { trava("última sessão já no limite"); continue; }
    const freq = Math.max(1, frequencia.get(grupo) ?? 1);
    const folgaSemana = faixaVolume(grupo).max - (efetivo.get(grupo) ?? 0);
    const cabeNaSemana = Math.floor(folgaSemana / freq + 1e-9);
    const e = Math.min(extra, cabeNaSemana, SERIES_MAX_EXERCICIO - p.series);
    if (e <= 0) { trava(cabeNaSemana <= 0 ? "volume da semana já no teto" : "exercício já no máximo de séries"); continue; }
    novas.set(p.id, p.series + e);
    ajustes.push({ prescricao_id: p.id, exercicio_id: p.exercicio_id, grupo, series_antes: p.series, series_depois: p.series + e });
  }
  return {
    prescricoes: prescricoes.map((p) => (novas.has(p.id) ? { ...p, series: novas.get(p.id)! } : p)),
    ajustes,
    travas,
    extra,
  };
}

/** Frase curta para o /hoje. null sem ajuste. */
export function resumoRampa(r: ResultadoRampa, exercicios: Exercicio[]): string | null {
  if (r.ajustes.length === 0) return null;
  const partes = r.ajustes.map((a) => {
    const ex = exercicios.find((e) => e.id === a.exercicio_id);
    const d = a.series_depois - a.series_antes;
    return `+${d} ${d === 1 ? "série" : "séries"} em ${ex?.nome ?? a.exercicio_id}`;
  });
  return `Semana de subir volume: ${partes.join(", ")}.`;
}
