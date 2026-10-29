/**
 * Alertas globais de volume por grupo muscular (R10 under / R11 over).
 * Superfície de produto — complementar ao R10/R11 por exercício em decidirProgressao.
 * LLM NÃO grava; só o motor calcula.
 */
import type {
  Exercicio,
  GrupoMuscular,
  Sessao,
  VolumeSemanal,
} from "@/lib/domain";
import { VOLUME_MAX, VOLUME_MIN } from "@/lib/domain";
import { currentIsoWeek } from "@/lib/engine/volume";

export type AlertaVolume = {
  grupo: GrupoMuscular;
  regra: "R10" | "R11";
  nivel: "N1";
  motivo: string;
  recomendacao: string;
  series_efetivas: number;
  acao: "adicionar_series" | "remover_series";
  delta_series: number;
  /** Marcador estável p/ dedupe: R10:peito:2026-W44 */
  marker: string;
  semana_iso: string;
};

export type AvaliarAlertasVolumeInput = {
  volumes_semanais: VolumeSemanal[];
  semana_iso?: string;
  /** RIR médio recente por grupo (opcional — reforça R11). */
  rir_medio_por_grupo?: Partial<Record<GrupoMuscular, number>>;
  /** RIR alvo típico; default 2. */
  rir_alvo?: number;
  /** Markers já presentes em alertas não resolvidos (evita spam). */
  markers_ativos?: string[];
};

/** Semana ISO anterior no mesmo formato YYYY-Www. */
export function previousIsoWeek(semanaIso: string): string {
  const m = /^(\d{4})-W(\d{2})$/.exec(semanaIso);
  if (!m) return semanaIso;
  const year = Number(m[1]);
  const week = Number(m[2]);
  if (week > 1) {
    return `${year}-W${String(week - 1).padStart(2, "0")}`;
  }
  // Última semana do ano anterior ≈ W52 (ISO pode ser 52 ou 53)
  return `${year - 1}-W52`;
}

function volFor(
  volumes: VolumeSemanal[],
  semana: string,
  grupo: GrupoMuscular,
): number | null {
  const hit = volumes.find((v) => v.semana_iso === semana && v.grupo === grupo);
  return hit ? hit.series_efetivas : null;
}

function markerOf(regra: "R10" | "R11", grupo: GrupoMuscular, semana: string) {
  return `${regra}:${grupo}:${semana}`;
}

/**
 * Avalia R10 (under 2 semanas) e R11 (over na semana atual).
 * Deduplica contra markers_ativos (mesmo grupo+regra+semana).
 */
export function avaliarAlertasVolume(
  input: AvaliarAlertasVolumeInput,
): AlertaVolume[] {
  const semana = input.semana_iso ?? currentIsoWeek();
  const prev = previousIsoWeek(semana);
  const ativos = new Set(input.markers_ativos ?? []);
  const rirAlvo = input.rir_alvo ?? 2;
  const out: AlertaVolume[] = [];

  const grupos = new Set<GrupoMuscular>();
  for (const v of input.volumes_semanais) {
    if (v.semana_iso === semana || v.semana_iso === prev) {
      grupos.add(v.grupo);
    }
  }

  for (const grupo of grupos) {
    const cur = volFor(input.volumes_semanais, semana, grupo);
    const ant = volFor(input.volumes_semanais, prev, grupo);

    // —— R10: 2 semanas consecutivas abaixo do mínimo ——
    // Exige registro nas duas semanas (evita falso positivo em plano novo).
    if (
      cur !== null &&
      ant !== null &&
      cur < VOLUME_MIN &&
      ant < VOLUME_MIN
    ) {
      const m = markerOf("R10", grupo, semana);
      if (!ativos.has(m)) {
        const delta = cur < 8 ? 2 : 1;
        out.push({
          grupo,
          regra: "R10",
          nivel: "N1",
          motivo: `[${m}] Volume efetivo de ${grupo} abaixo de ${VOLUME_MIN} por 2 semanas (${ant} → ${cur} séries).`,
          recomendacao: `Adicionar ${delta} série(s) no grupo ${grupo} nas próximas sessões.`,
          series_efetivas: cur,
          acao: "adicionar_series",
          delta_series: delta,
          marker: m,
          semana_iso: semana,
        });
        ativos.add(m);
      }
    }

    // —— R11: semana atual acima do máximo ——
    if (cur !== null && cur > VOLUME_MAX) {
      const rir = input.rir_medio_por_grupo?.[grupo];
      const rirCaindo = rir !== undefined && rir < rirAlvo;
      // Sem RIR: ainda alerta N1; com RIR caindo: reforça o motivo
      const m = markerOf("R11", grupo, semana);
      if (!ativos.has(m)) {
        const motivoRir =
          rir !== undefined
            ? rirCaindo
              ? ` RIR médio ${rir} abaixo do alvo ${rirAlvo}.`
              : ` RIR médio ${rir} (alvo ${rirAlvo}).`
            : "";
        out.push({
          grupo,
          regra: "R11",
          nivel: "N1",
          motivo: `[${m}] Volume efetivo de ${grupo} ${cur} > ${VOLUME_MAX}.${motivoRir}`,
          recomendacao: `Remover 2 séries do grupo ${grupo} nas próximas sessões.`,
          series_efetivas: cur,
          acao: "remover_series",
          delta_series: 2,
          marker: m,
          semana_iso: semana,
        });
        ativos.add(m);
      }
    }
  }

  return out;
}

/** Extrai markers de motivos de AlertaSeguranca (prefixo [R10:peito:2026-W44]). */
export function extractVolumeMarkers(
  motivos: string[],
): string[] {
  const out: string[] = [];
  for (const m of motivos) {
    const hit = /\[((?:R10|R11):[a-z_]+:\d{4}-W\d{2})\]/.exec(m);
    if (hit?.[1]) out.push(hit[1]);
  }
  return out;
}

/**
 * Ajusta sessões futuras (planejada / parcial):
 * - R10: +delta no 1º exercício do grupo (preferir composto)
 * - R11: −delta distribuído nos exercícios do grupo (floor 1)
 */
export function aplicarAjusteVolumeNasSessoes(
  sessoes: Sessao[],
  alertas: AlertaVolume[],
  exercicios: Exercicio[],
): Sessao[] {
  if (alertas.length === 0) return sessoes;

  const byGrupo = new Map<GrupoMuscular, Exercicio>();
  for (const ex of exercicios) {
    const prev = byGrupo.get(ex.grupo_primario);
    if (!prev || (ex.composto && !prev.composto)) {
      byGrupo.set(ex.grupo_primario, ex);
    }
  }

  return sessoes.map((sess) => {
    if (sess.status !== "planejada" && sess.status !== "parcial") {
      return sess;
    }

    let prescricoes = sess.prescricoes.map((p) => ({ ...p }));
    let changed = false;

    for (const a of alertas) {
      if (a.acao === "adicionar_series") {
        // Prefer exercício composto do grupo já na sessão; senão qualquer do grupo
        const doGrupo = prescricoes
          .map((p, i) => ({
            p,
            i,
            ex: exercicios.find((e) => e.id === p.exercicio_id),
          }))
          .filter((x) => x.ex?.grupo_primario === a.grupo);
        if (doGrupo.length === 0) continue;
        doGrupo.sort((x, y) => {
          const cx = x.ex?.composto ? 0 : 1;
          const cy = y.ex?.composto ? 0 : 1;
          if (cx !== cy) return cx - cy;
          return x.p.ordem - y.p.ordem;
        });
        const target = doGrupo[0]!;
        prescricoes[target.i] = {
          ...target.p,
          series: target.p.series + a.delta_series,
        };
        changed = true;
      } else if (a.acao === "remover_series") {
        let restante = a.delta_series;
        // Remover do último exercício do grupo primeiro (isolamento antes de composto)
        const doGrupo = prescricoes
          .map((p, i) => ({
            p,
            i,
            ex: exercicios.find((e) => e.id === p.exercicio_id),
          }))
          .filter((x) => x.ex?.grupo_primario === a.grupo)
          .sort((x, y) => {
            const cx = x.ex?.composto ? 1 : 0;
            const cy = y.ex?.composto ? 1 : 0;
            if (cx !== cy) return cx - cy;
            return y.p.ordem - x.p.ordem;
          });
        for (const t of doGrupo) {
          if (restante <= 0) break;
          const pode = Math.max(0, t.p.series - 1);
          const rem = Math.min(pode, restante);
          if (rem <= 0) continue;
          prescricoes[t.i] = { ...t.p, series: t.p.series - rem };
          restante -= rem;
          changed = true;
        }
      }
    }

    return changed ? { ...sess, prescricoes } : sess;
  });
}
