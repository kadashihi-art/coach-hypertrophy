/**
 * Volume efetivo = diretas + 0,5×indiretas (brief §4 / P5).
 * Faixa alvo 10–20 séries efetivas por grupo/semana.
 */
import type {
  Exercicio,
  GrupoMuscular,
  RegistroSerie,
  VolumePorGrupo,
  VolumeSemanal,
} from "@/lib/domain";
import { volumeEfetivo, VOLUME_MAX, VOLUME_MIN } from "@/lib/domain";

export { volumeEfetivo, VOLUME_MAX, VOLUME_MIN };

function isoWeek(d = new Date()): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function currentIsoWeek(): string {
  return isoWeek(new Date());
}

/** Conta séries de trabalho (exclui aquecimento) por grupo nesta sessão. */
export function volumeSessaoPorGrupo(
  series: RegistroSerie[],
  exercicios: Exercicio[],
): VolumePorGrupo[] {
  const map = new Map<GrupoMuscular, { planejado: number; realizado: number }>();
  const trabalho = series.filter((s) => s.tipo_serie !== "aquecimento");
  for (const s of trabalho) {
    const ex = exercicios.find((e) => e.id === s.exercicio_id);
    if (!ex) continue;
    const cur = map.get(ex.grupo_primario) ?? { planejado: 0, realizado: 0 };
    cur.realizado += 1;
    map.set(ex.grupo_primario, cur);
  }
  return [...map.entries()].map(([grupo, v]) => ({
    grupo,
    planejado: v.planejado,
    realizado: v.realizado,
  }));
}

/**
 * Soma volume semanal efetivo a partir das séries da sessão.
 * Diretas = grupo_primario; indiretas = grupos_secundarios (0,5 cada).
 */
export function acumularVolumeSemanal(
  existing: VolumeSemanal[],
  series: RegistroSerie[],
  exercicios: Exercicio[],
  semanaIso = currentIsoWeek(),
): VolumeSemanal[] {
  const trabalho = series.filter((s) => s.tipo_serie !== "aquecimento");
  const delta = new Map<
    GrupoMuscular,
    { diretas: number; indiretas: number }
  >();

  for (const s of trabalho) {
    const ex = exercicios.find((e) => e.id === s.exercicio_id);
    if (!ex) continue;
    const prim = delta.get(ex.grupo_primario) ?? { diretas: 0, indiretas: 0 };
    prim.diretas += 1;
    delta.set(ex.grupo_primario, prim);
    for (const sec of ex.grupos_secundarios) {
      const cur = delta.get(sec) ?? { diretas: 0, indiretas: 0 };
      cur.indiretas += 1;
      delta.set(sec, cur);
    }
  }

  let next = [...existing];
  for (const [grupo, d] of delta) {
    const idx = next.findIndex(
      (v) => v.semana_iso === semanaIso && v.grupo === grupo,
    );
    if (idx >= 0) {
      const prev = next[idx]!;
      const diretas = prev.series_diretas + d.diretas;
      const indiretas = prev.series_indiretas + d.indiretas;
      next[idx] = {
        ...prev,
        series_diretas: diretas,
        series_indiretas: indiretas,
        series_efetivas: volumeEfetivo(diretas, indiretas),
      };
    } else {
      next.push({
        semana_iso: semanaIso,
        grupo,
        series_diretas: d.diretas,
        series_indiretas: d.indiretas,
        series_efetivas: volumeEfetivo(d.diretas, d.indiretas),
      });
    }
  }
  return next;
}

/** Mescla realizado no volume_por_grupo da sessão (preserva planejado). */
export function mergeVolumeSessao(
  planejado: VolumePorGrupo[],
  realizado: VolumePorGrupo[],
): VolumePorGrupo[] {
  const map = new Map<GrupoMuscular, VolumePorGrupo>();
  for (const p of planejado) {
    map.set(p.grupo, { ...p, realizado: 0 });
  }
  for (const r of realizado) {
    const prev = map.get(r.grupo);
    if (prev) {
      map.set(r.grupo, { ...prev, realizado: r.realizado });
    } else {
      map.set(r.grupo, {
        grupo: r.grupo,
        planejado: r.realizado,
        realizado: r.realizado,
      });
    }
  }
  return [...map.values()];
}
