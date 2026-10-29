/**
 * Conclusão de sessão como função pura (extraída do AppProvider sem mudar regra).
 * O único acréscimo é o snapshot opcional com as entradas da decisão.
 */
import { ehSeriePreparatoria } from "@/lib/domain/enums";
import type {
  AppState,
  DecisaoProgressao,
  EstadoExercicio,
  GrupoMuscular,
  SnapshotConclusao,
} from "@/lib/domain";
import {
  aplicarDecisao,
  aplicarEstadoNaPrescricao,
  decidirProgressao,
} from "@/lib/engine/progression";
import {
  acumularVolumeSemanal,
  currentIsoWeek,
  mergeVolumeSessao,
  volumeSessaoPorGrupo,
} from "@/lib/engine/volume";
import {
  aplicarAjusteVolumeNasSessoes,
  avaliarAlertasVolume,
  extractVolumeMarkers,
} from "@/lib/engine/alertas-volume";

export function concluirSessao(
  s: AppState,
  opts: { gravarSnapshot: boolean } = { gravarSnapshot: true },
): { state: AppState; decisoes: DecisaoProgressao[] } {
      const sid = s.active_sessao_id;
      if (!sid) return { state: s, decisoes: [] };
      const sess = s.sessoes.find((x) => x.id === sid);
      if (!sess) return { state: s, decisoes: [] };
      const ck = s.checkins.find(
        (c) => c.data === (sess.data ?? new Date().toISOString().slice(0, 10)),
      );
      const seriesSessao = s.registros.filter((r) => r.sessao_id === sid);
      const novasDecisoes: DecisaoProgressao[] = [];
      let estados = [...s.estados];
      const estadosAntes: EstadoExercicio[] = [];
      const semanaVolume = currentIsoWeek();

      for (const presc of sess.prescricoes) {
        const series = seriesSessao.filter((r) => r.prescricao_id === presc.id);
        if (series.length === 0) continue;
        const ex = s.exercicios.find((e) => e.id === presc.exercicio_id);
        const estado =
          estados.find((e) => e.exercicio_id === presc.exercicio_id) ?? {
            exercicio_id: presc.exercicio_id,
            carga_atual_kg: presc.carga.trabalho_kg,
            faixa_reps: presc.faixa_reps,
            rir_alvo: presc.rir_alvo,
            alvo_proxima_sessao: {
              carga_kg: presc.carga.trabalho_kg,
              faixa_reps: presc.faixa_reps,
              rir_alvo: presc.rir_alvo,
            },
            sessoes_sem_progresso: 0,
            ultima_progressao_em: null,
            e1rm_estimado_kg: 0,
            pr_carga_kg: presc.carga.trabalho_kg,
            pr_reps: 0,
            origem_carga: presc.carga.origem,
            primeira_sessao: false,
            ultimo_top_kg: null,
            ultimo_back_off_kg: null,
            ultimo_rir: null,
            ultima_sessao_em: null,
            atualizado_em: new Date().toISOString(),
          };
        const vols = s.volumes_semanais
          .filter((v) => v.grupo === (ex?.grupo_primario ?? "peito"))
          .sort((a, b) => b.semana_iso.localeCompare(a.semana_iso));
        const d = decidirProgressao({
          exercicio_id: presc.exercicio_id,
          sessao_id: sid,
          grupo_primario: ex?.grupo_primario ?? "peito",
          series,
          estado,
          checkin: ck,
          volume_semanal_grupo: vols,
          mesociclo: s.plano?.mesociclo,
          tecnica: presc.tecnica,
        });
        novasDecisoes.push(d);
        if (!estadosAntes.some((e) => e.exercicio_id === estado.exercicio_id)) {
          estadosAntes.push(estado);
        }
        const novoEstado = aplicarDecisao(estado, d, series);
        estados = [
          ...estados.filter((e) => e.exercicio_id !== presc.exercicio_id),
          novoEstado,
        ];
      }

      const realizado = volumeSessaoPorGrupo(seriesSessao, s.exercicios);
      const volume_por_grupo = mergeVolumeSessao(
        sess.volume_por_grupo,
        realizado,
      );
      // Atualiza planejado se estava 0
      const volumeFinal = volume_por_grupo.map((v) => ({
        ...v,
        planejado: v.planejado > 0 ? v.planejado : v.realizado,
      }));

      const volumes_semanais = acumularVolumeSemanal(
        s.volumes_semanais,
        seriesSessao,
        s.exercicios,
        semanaVolume,
      );
      const snapshot: SnapshotConclusao = {
        versao: 1,
        estados_antes: estadosAntes,
        checkin: ck ?? null,
        volumes_semanais_antes: s.volumes_semanais,
        mesociclo: s.plano?.mesociclo ?? null,
        semana_iso: semanaVolume,
      };

      // Pré-fill da sessão concluída + todas as sessões futuras/pendentes do meso
      const applyEstados = (prescs: typeof sess.prescricoes) =>
        prescs.map((p) => {
          const est = estados.find((e) => e.exercicio_id === p.exercicio_id);
          return est ? aplicarEstadoNaPrescricao(p, est) : p;
        });

      // Resolve alertas N1 de R9 do dia (check-in); volume alerts ficam abertos
      const alertas = s.alertas.map((a) =>
        a.nivel === "N1" &&
        a.data === sess.data &&
        !a.resolvido &&
        !a.motivo.includes("[R10:") &&
        !a.motivo.includes("[R11:")
          ? { ...a, resolvido: true }
          : a,
      );

      // —— (4) Alertas de volume muscular (R10/R11 globais) ——
      const semanaIso = currentIsoWeek();
      const markersAtivos = extractVolumeMarkers(
        alertas.filter((a) => !a.resolvido).map((a) => a.motivo),
      );
      const rirMedio: Partial<Record<string, number>> = {};
      const rirCount: Partial<Record<string, number>> = {};
      for (const r of seriesSessao) {
        if (ehSeriePreparatoria(r.tipo_serie)) continue;
        const ex = s.exercicios.find((e) => e.id === r.exercicio_id);
        if (!ex) continue;
        const g = ex.grupo_primario;
        rirMedio[g] = (rirMedio[g] ?? 0) + r.rir_percebido;
        rirCount[g] = (rirCount[g] ?? 0) + 1;
      }
      const rir_medio_por_grupo: Partial<Record<GrupoMuscular, number>> = {};
      for (const g of Object.keys(rirMedio) as GrupoMuscular[]) {
        const n = rirCount[g] ?? 0;
        if (n > 0) {
          rir_medio_por_grupo[g] = Math.round(((rirMedio[g] ?? 0) / n) * 10) / 10;
        }
      }
      const volAlertas = avaliarAlertasVolume({
        volumes_semanais,
        semana_iso: semanaIso,
        rir_medio_por_grupo,
        markers_ativos: markersAtivos,
      });
      const hojeIso =
        sess.data ?? new Date().toISOString().slice(0, 10);
      for (const va of volAlertas) {
        alertas.push({
          id: `alerta-vol-${va.marker}-${Date.now().toString(36)}`,
          data: hojeIso,
          nivel: va.nivel,
          motivo: va.motivo,
          recomendacao: va.recomendacao,
          origem_sessao_id: sid,
          resolvido: false,
        });
      }

      // Aplica carga do estado, depois nudge de volume nas sessões pendentes
      let sessoes = s.sessoes.map((x) => {
        if (x.id === sid) {
          return {
            ...x,
            prescricoes: applyEstados(x.prescricoes),
            volume_por_grupo: volumeFinal,
            status: "concluida" as const,
            ...(opts.gravarSnapshot ? { snapshot_conclusao: snapshot } : {}),
            finalizada_em: new Date().toISOString(),
            rest_timer: {
              status: "idle" as const,
              segundos_totais: 0,
              segundos_restantes: 0,
            },
          };
        }
        if (x.status === "planejada" || x.status === "parcial") {
          return { ...x, prescricoes: applyEstados(x.prescricoes) };
        }
        return x;
      });
      if (volAlertas.length > 0) {
        sessoes = aplicarAjusteVolumeNasSessoes(
          sessoes,
          volAlertas,
          s.exercicios,
        );
      }

      return {
        decisoes: novasDecisoes,
        state: {
        ...s,
        active_sessao_id: null,
        logger_prescricao_id: null,
        estados,
        volumes_semanais,
        alertas,
        decisoes: [...s.decisoes, ...novasDecisoes],
        sessoes,
      },
      };
}
