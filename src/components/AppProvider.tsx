"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  AppState,
  Checkin,
  GrupoMuscular,
  Perfil,
  RegistroSerie,
  DecisaoProgressao,
} from "@/lib/domain";
import {
  loadState,
  saveState,
  resetState,
  loadSyncedAt,
  saveSyncedAt,
  isSeedLike,
} from "@/lib/storage";
import { seedState } from "@/lib/seed";
import { useSession } from "next-auth/react";
import {
  aplicarDecisao,
  aplicarEstadoNaPrescricao,
  decidirProgressao,
} from "@/lib/engine/progression";
import {
  acumularVolumeSemanal,
  mergeVolumeSessao,
  volumeSessaoPorGrupo,
  currentIsoWeek,
} from "@/lib/engine/volume";
import {
  avaliarAlertasVolume,
  aplicarAjusteVolumeNasSessoes,
  extractVolumeMarkers,
} from "@/lib/engine/alertas-volume";
import { proximaSessao } from "@/lib/plan/proxima-sessao";
import { gerarPlanoFromPerfil } from "@/lib/plan/gerar-plano";
import {
  agendarSessoes,
  desmarcarPulada,
  marcarPulada,
} from "@/lib/plan/calendario";
import { remountPlano } from "@/lib/plan/remount-plano";
import {
  PARQ_BLOQUEIO_MSG,
  parqBloqueiaPrescricao,
} from "@/lib/plan/parq";
import { CATALOG_EXERCICIOS } from "@/lib/catalog/exercicios";
import { ancorarCargaDeAquecimento } from "@/lib/engine/ancorar-carga";
import {
  adaptarAposSerie,
  aplicarAdaptacaoNaPrescricao,
  type AdaptacaoAoVivo,
} from "@/lib/engine/adaptacao-ao-vivo";
import { avaliarCheckinDeload } from "@/lib/engine/checkin-deload";
import { incrementoCargaKg } from "@/lib/domain";

type Ctx = {
  state: AppState;
  ready: boolean;
  updatePerfil: (partial: Partial<Perfil>) => void;
  finishOnboarding: () => void;
  /** Merge perfil + gera plano determinístico e marca onboarding concluído */
  completeOnboarding: (partial: Partial<Perfil>) => void;
  saveCheckin: (ck: Omit<Checkin, "id">) => void;
  startSession: (sessaoId?: string) => void;
  setLoggerPrescricao: (prescricaoId: string) => void;
  logSerie: (
    serie: Omit<RegistroSerie, "id" | "executado_em">,
  ) => {
    cargas_atualizadas: boolean;
    trabalho_kg?: number;
    back_off_kg?: number | null;
    adaptacao?: AdaptacaoAoVivo;
  };
  startRest: (seconds: number) => void;
  tickRest: (seconds: number) => void;
  skipRest: () => void;
  addRest: (seconds: number) => void;
  finishSession: () => DecisaoProgressao[];
  resetApp: () => void;
  /** Patch perfil + remount plan (motor; LLM via API when authenticated) */
  updatePerfilAndRemount: (
    partial: Partial<Perfil>,
    opts?: { skipLlm?: boolean },
  ) => Promise<{ fonte: "motor" | "motor+llm"; ok: boolean; error?: string }>;
  /** Set mesociclo.data_inicio and schedule session dates */
  setDataInicio: (isoDate: string) => void;
  /** Mark session pulada / restore planejada / sync feito */
  markCalendario: (
    sessaoId: string,
    action: "pular" | "planejar" | "feito",
  ) => void;
};

const AppCtx = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(seedState);
  const [ready, setReady] = useState(false);
  const { data: session, status } = useSession();
  const userId = session?.user?.id;
  const authenticated = status === "authenticated" && Boolean(userId);

  // Hydrate: localStorage first; if logged in, merge with Blob via /api/state
  useEffect(() => {
    if (status === "loading") return;
    let cancelled = false;

    async function hydrate() {
      const local = loadState();
      if (!authenticated || !userId) {
        if (!cancelled) {
          setState(local);
          setReady(true);
        }
        return;
      }

      try {
        const res = await fetch("/api/state");
        if (res.status === 404) {
          // Push local if it has real data
          if (!isSeedLike(local)) {
            const put = await fetch("/api/state", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(local),
            });
            if (put.ok) {
              const body = (await put.json()) as { updated_at: string };
              saveSyncedAt(body.updated_at);
            }
          }
          if (!cancelled) {
            setState(local);
            setReady(true);
          }
          return;
        }
        if (!res.ok) {
          if (!cancelled) {
            setState(local);
            setReady(true);
          }
          return;
        }
        const body = (await res.json()) as {
          updated_at: string;
          state: AppState;
        };
        const localSynced = loadSyncedAt();
        const preferServer =
          isSeedLike(local) ||
          !localSynced ||
          body.updated_at >= localSynced;
        const next = preferServer ? body.state : local;
        saveState(next);
        saveSyncedAt(body.updated_at);
        if (!preferServer) {
          // Local newer — push
          void fetch("/api/state", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(next),
          }).then(async (r) => {
            if (r.ok) {
              const b = (await r.json()) as { updated_at: string };
              saveSyncedAt(b.updated_at);
            }
          });
        }
        if (!cancelled) {
          setState(next);
          setReady(true);
        }
      } catch {
        if (!cancelled) {
          setState(local);
          setReady(true);
        }
      }
    }

    setReady(false);
    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [authenticated, userId, status]);

  // Persist local always; debounce server sync when authenticated
  useEffect(() => {
    if (!ready) return;
    saveState(state);
    if (!authenticated) return;
    const t = window.setTimeout(() => {
      void fetch("/api/state", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state),
      })
        .then(async (r) => {
          if (!r.ok) return;
          const body = (await r.json()) as { updated_at: string };
          saveSyncedAt(body.updated_at);
        })
        .catch(() => {
          /* offline — local cache keeps working */
        });
    }, 500);
    return () => window.clearTimeout(t);
  }, [state, ready, authenticated]);

  const updatePerfil = useCallback((partial: Partial<Perfil>) => {
    setState((s) => {
      const base = s.perfil ?? seedState.perfil!;
      return { ...s, perfil: { ...base, ...partial } };
    });
  }, []);

  const completeOnboarding = useCallback((partial: Partial<Perfil>) => {
    setState((s) => {
      const base = s.perfil ?? seedState.perfil!;
      const perfil: Perfil = {
        ...base,
        ...partial,
        onboarding_concluido: true,
      };
      // PAR-Q+ gate: qualquer SIM / pendente → não gera plano
      if (parqBloqueiaPrescricao(perfil)) {
        const agora = new Date().toISOString().slice(0, 10);
        const alerta = {
          id: `alerta-parq-${Date.now()}`,
          nivel: "N2" as const,
          motivo: PARQ_BLOQUEIO_MSG,
          recomendacao:
            "Procure avaliação profissional (ePARmed-X+) antes de qualquer plano progressivo.",
          data: agora,
          origem_sessao_id: null,
          resolvido: false,
        };
        return {
          ...s,
          perfil: { ...perfil, onboarding_concluido: false, parq_liberado: false },
          plano: null,
          sessoes: [],
          alertas: [
            ...s.alertas.filter((a) => !a.motivo.startsWith("PAR-Q+")),
            alerta,
          ],
          active_sessao_id: null,
          logger_prescricao_id: null,
        };
      }
      const catalog =
        s.exercicios.length > 0 ? s.exercicios : CATALOG_EXERCICIOS;
      const gerado = gerarPlanoFromPerfil(perfil, catalog);
      return {
        ...s,
        perfil,
        plano: gerado.plano,
        sessoes: gerado.sessoes,
        estados: gerado.estados,
        volumes_semanais: gerado.volumes_semanais,
        registros: [],
        active_sessao_id: null,
        logger_prescricao_id: null,
        checkins: [],
        alertas: s.alertas.filter((a) => !a.motivo.startsWith("PAR-Q+")),
        decisoes: [],
        exercicios: catalog,
      };
    });
  }, []);

  const finishOnboarding = useCallback(() => {
    completeOnboarding({});
  }, [completeOnboarding]);

  const saveCheckin = useCallback((ck: Omit<Checkin, "id">) => {
    setState((s) => {
      const id = `ck-${Date.now()}`;
      const filtered = s.checkins.filter((c) => c.data !== ck.data);
      const prev = s.checkins.find((c) => c.data === ck.data);
      const prevR9 = !!(
        prev &&
        (prev.prontidao <= 2 || prev.sono_h < 6)
      );
      // Avalia alertas (R9 / água); R5/R6 entram no startSession
      const preview = avaliarCheckinDeload({
        checkin: { ...ck, id: "preview" },
        mesociclo: null,
        estados: [],
        prescricoes: [],
        exercicios: s.exercicios,
        data: ck.data,
      });

      const alertas = s.alertas.filter(
        (a) =>
          !(
            a.data === ck.data &&
            !a.resolvido &&
            (a.motivo.startsWith("Check-in:") ||
              a.motivo.startsWith("Hidratação baixa:"))
          ),
      );
      for (const a of preview.alertas) {
        alertas.push({
          ...a,
          id: `alerta-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          origem_sessao_id: null,
          resolvido: false,
        });
      }

      let sessoes = s.sessoes;
      const sid = s.active_sessao_id;
      const active = sid ? s.sessoes.find((x) => x.id === sid) : null;
      if (
        active &&
        active.status === "em_andamento" &&
        (active.data === ck.data || !active.data)
      ) {
        const seriesJaFeitas: Record<string, number> = {};
        for (const p of active.prescricoes) {
          seriesJaFeitas[p.id] = s.registros.filter(
            (r) => r.sessao_id === active.id && r.prescricao_id === p.id,
          ).length;
        }

        // Desfaz corte R9 anterior nas séries p/ reaplicar limpo
        const basePresc = active.prescricoes.map((p) => {
          if (!prevR9) return p;
          const compostos = active.prescricoes.filter((pp) => {
            const e = s.exercicios.find((ee) => ee.id === pp.exercicio_id);
            return e?.composto === true;
          });
          const principais =
            compostos.length > 0
              ? new Set(compostos.map((pp) => pp.id))
              : new Set(
                  [...active.prescricoes]
                    .sort((a, b) => a.ordem - b.ordem)
                    .slice(
                      0,
                      Math.max(1, Math.ceil(active.prescricoes.length / 2)),
                    )
                    .map((pp) => pp.id),
                );
          if (!principais.has(p.id)) return p;
          return { ...p, series: p.series + 1 };
        });

        const deload = avaliarCheckinDeload({
          checkin: { ...ck, id },
          mesociclo: null, // R5/R6 já no start; check-in mid só R9/água
          estados: [],
          prescricoes: basePresc,
          exercicios: s.exercicios,
          seriesJaFeitas,
          data: ck.data,
        });

        // Se R9 sumiu, basePresc já restaurou +1; deload sem R9 mantém
        sessoes = s.sessoes.map((x) =>
          x.id === active.id
            ? { ...x, prescricoes: deload.prescricoes }
            : x,
        );
      }

      return {
        ...s,
        checkins: [...filtered, { ...ck, id }],
        alertas,
        sessoes,
      };
    });
  }, []);

  const startSession = useCallback((sessaoId?: string) => {
    setState((s) => {
      if (parqBloqueiaPrescricao(s.perfil)) {
        const agora = new Date().toISOString().slice(0, 10);
        const dup = s.alertas.some(
          (a) => !a.resolvido && a.motivo.startsWith("PAR-Q+"),
        );
        if (dup) return s;
        return {
          ...s,
          alertas: [
            ...s.alertas,
            {
              id: `alerta-parq-${Date.now()}`,
              nivel: "N2" as const,
              motivo: PARQ_BLOQUEIO_MSG,
              recomendacao:
                "Procure avaliação profissional (ePARmed-X+) antes de qualquer plano progressivo.",
              data: agora,
              origem_sessao_id: null,
              resolvido: false,
            },
          ],
        };
      }
      let sid = sessaoId;
      if (!sid) {
        sid = proximaSessao(s)?.id;
      }
      if (!sid) return s;
      const sess = s.sessoes.find((x) => x.id === sid);
      if (!sess) return s;

      // Reinicia sessão concluída: limpa registros dela e reaplica cargas do EstadoExercicio
      const reiniciando = sess.status === "concluida" || sess.status === "parcial";
      const registros = reiniciando
        ? s.registros.filter((r) => r.sessao_id !== sid)
        : s.registros;

      const hojeIso = new Date().toISOString().slice(0, 10);
      const basePresc = sess.prescricoes.map((p) => {
        const est = s.estados.find((e) => e.exercicio_id === p.exercicio_id);
        if (!est) return p;
        return aplicarEstadoNaPrescricao(p, est);
      });

      const ckHoje = s.checkins.find((c) => c.data === hojeIso) ?? null;
      const deload = avaliarCheckinDeload({
        checkin: ckHoje,
        mesociclo: s.plano?.mesociclo,
        estados: s.estados,
        prescricoes: basePresc,
        exercicios: s.exercicios,
        data: hojeIso,
      });
      const prescricoes = deload.prescricoes;

      // Alertas de R5/R6/AGUA do dia (R9 já pode ter vindo do check-in)
      const alertas = [...s.alertas];
      for (const a of deload.alertas) {
        const dup = alertas.some(
          (x) =>
            x.data === a.data &&
            !x.resolvido &&
            x.motivo === a.motivo,
        );
        if (dup) continue;
        // Evita duplicar R9 se saveCheckin já criou
        if (a.motivo.startsWith("Check-in:") && ckHoje) {
          const hasR9 = alertas.some(
            (x) =>
              x.data === hojeIso &&
              !x.resolvido &&
              x.motivo.startsWith("Check-in:"),
          );
          if (hasR9) continue;
        }
        alertas.push({
          ...a,
          id: `alerta-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          origem_sessao_id: sid,
          resolvido: false,
        });
      }

      const firstPresc = prescricoes[0]?.id ?? null;
      return {
        ...s,
        registros,
        active_sessao_id: sid,
        logger_prescricao_id: firstPresc,
        alertas,
        sessoes: s.sessoes.map((x) =>
          x.id === sid
            ? {
                ...x,
                prescricoes,
                status: "em_andamento" as const,
                data: hojeIso,
                iniciada_em: new Date().toISOString(),
                finalizada_em: undefined,
                volume_por_grupo: x.volume_por_grupo.map((v) => ({
                  ...v,
                  realizado: 0,
                })),
                rest_timer: {
                  status: "idle" as const,
                  segundos_totais: prescricoes[0]?.descanso_seg ?? 120,
                  segundos_restantes: prescricoes[0]?.descanso_seg ?? 120,
                },
              }
            : x,
        ),
      };
    });
  }, []);

  const setLoggerPrescricao = useCallback((prescricaoId: string) => {
    setState((s) => ({ ...s, logger_prescricao_id: prescricaoId }));
  }, []);

  const logSerie = useCallback(
    (serie: Omit<RegistroSerie, "id" | "executado_em">) => {
      let result: {
        cargas_atualizadas: boolean;
        trabalho_kg?: number;
        back_off_kg?: number | null;
        adaptacao?: AdaptacaoAoVivo;
      } = { cargas_atualizadas: false };

      setState((s) => {
        const reg: RegistroSerie = {
          ...serie,
          id: `reg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          executado_em: new Date().toISOString(),
        };
        let next = { ...s, registros: [...s.registros, reg] };

        const sess = next.sessoes.find((x) => x.id === serie.sessao_id);
        const presc = sess?.prescricoes.find((p) => p.id === serie.prescricao_id);
        const ex =
          next.exercicios.find((e) => e.id === serie.exercicio_id) ??
          next.exercicios.find((e) => e.id === presc?.exercicio_id);

        // Âncora de aquecimento → recalcula sugestões das séries restantes
        if (serie.tipo_serie === "aquecimento") {
          if (presc && ex) {
            const ancora = ancorarCargaDeAquecimento({
              cargaKg: serie.carga_kg,
              tecnica: presc.tecnica,
              grupo: ex.grupo_primario,
              prescricoesPendentes: presc,
            });
            result = {
              cargas_atualizadas: true,
              trabalho_kg: ancora.trabalho_kg,
              back_off_kg: ancora.back_off_kg,
            };
            next = {
              ...next,
              sessoes: next.sessoes.map((sessao) =>
                sessao.id !== serie.sessao_id
                  ? sessao
                  : {
                      ...sessao,
                      prescricoes: sessao.prescricoes.map((p) =>
                        p.id === presc.id ? ancora.prescricao : p,
                      ),
                    },
              ),
              estados: next.estados.map((est) =>
                est.exercicio_id !== presc.exercicio_id
                  ? est
                  : {
                      ...est,
                      carga_atual_kg: ancora.trabalho_kg,
                      alvo_proxima_sessao: {
                        ...est.alvo_proxima_sessao,
                        carga_kg: ancora.trabalho_kg,
                      },
                      origem_carga: "usuario" as const,
                      atualizado_em: new Date().toISOString(),
                    },
              ),
            };
          }
        } else if (presc && ex) {
          // Adaptação ao vivo (trabalho/top/back_off) — só sessão atual
          const seriesAnteriores = next.registros.filter(
            (r) =>
              r.sessao_id === serie.sessao_id &&
              r.prescricao_id === serie.prescricao_id &&
              r.id !== reg.id,
          );
          const estado = next.estados.find(
            (e) => e.exercicio_id === presc.exercicio_id,
          );
          const stepKg = incrementoCargaKg(ex.grupo_primario);
          const adapt = adaptarAposSerie({
            registro: reg,
            seriesAnteriores,
            presc,
            estado,
            stepKg,
          });
          if (adapt.aplicada) {
            const prescAtualizada = aplicarAdaptacaoNaPrescricao(presc, adapt);
            result = {
              cargas_atualizadas: true,
              trabalho_kg: adapt.carga_sugerida_kg ?? prescAtualizada.carga.trabalho_kg,
              back_off_kg: null,
              adaptacao: adapt,
            };
            next = {
              ...next,
              sessoes: next.sessoes.map((sessao) =>
                sessao.id !== serie.sessao_id
                  ? sessao
                  : {
                      ...sessao,
                      prescricoes: sessao.prescricoes.map((p) =>
                        p.id === presc.id ? prescAtualizada : p,
                      ),
                    },
              ),
            };
          } else {
            result = { ...result, adaptacao: adapt };
          }
        }
        return next;
      });
      return result;
    },
    [],
  );

  const startRest = useCallback((seconds: number) => {
    setState((s) => {
      const sid = s.active_sessao_id;
      if (!sid) return s;
      return {
        ...s,
        sessoes: s.sessoes.map((sess) =>
          sess.id === sid
            ? {
                ...sess,
                rest_timer: {
                  status: "running" as const,
                  segundos_totais: seconds,
                  segundos_restantes: seconds,
                  iniciado_em: new Date().toISOString(),
                },
              }
            : sess,
        ),
      };
    });
  }, []);

  const tickRest = useCallback((seconds: number) => {
    setState((s) => {
      const sid = s.active_sessao_id;
      if (!sid) return s;
      return {
        ...s,
        sessoes: s.sessoes.map((sess) => {
          if (sess.id !== sid || !sess.rest_timer) return sess;
          const restante = Math.max(0, seconds);
          return {
            ...sess,
            rest_timer: {
              ...sess.rest_timer,
              segundos_restantes: restante,
              status: restante === 0 ? ("done" as const) : sess.rest_timer.status,
            },
          };
        }),
      };
    });
  }, []);

  const skipRest = useCallback(() => {
    setState((s) => {
      const sid = s.active_sessao_id;
      if (!sid) return s;
      return {
        ...s,
        sessoes: s.sessoes.map((sess) =>
          sess.id === sid && sess.rest_timer
            ? {
                ...sess,
                rest_timer: {
                  ...sess.rest_timer,
                  segundos_restantes: 0,
                  status: "done" as const,
                },
              }
            : sess,
        ),
      };
    });
  }, []);

  const addRest = useCallback((seconds: number) => {
    setState((s) => {
      const sid = s.active_sessao_id;
      if (!sid) return s;
      return {
        ...s,
        sessoes: s.sessoes.map((sess) => {
          if (sess.id !== sid || !sess.rest_timer) return sess;
          const next = sess.rest_timer.segundos_restantes + seconds;
          return {
            ...sess,
            rest_timer: {
              ...sess.rest_timer,
              segundos_restantes: next,
              segundos_totais: Math.max(sess.rest_timer.segundos_totais, next),
              status: "running" as const,
            },
          };
        }),
      };
    });
  }, []);

  const finishSession = useCallback((): DecisaoProgressao[] => {
    let decisoes: DecisaoProgressao[] = [];
    setState((s) => {
      const sid = s.active_sessao_id;
      if (!sid) return s;
      const sess = s.sessoes.find((x) => x.id === sid);
      if (!sess) return s;
      const ck = s.checkins.find(
        (c) => c.data === (sess.data ?? new Date().toISOString().slice(0, 10)),
      );
      const seriesSessao = s.registros.filter((r) => r.sessao_id === sid);
      const novasDecisoes: DecisaoProgressao[] = [];
      let estados = [...s.estados];

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
        const novoEstado = aplicarDecisao(estado, d, series);
        estados = [
          ...estados.filter((e) => e.exercicio_id !== presc.exercicio_id),
          novoEstado,
        ];
      }
      decisoes = novasDecisoes;

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
      );

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
        if (r.tipo_serie === "aquecimento") continue;
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
        ...s,
        active_sessao_id: null,
        logger_prescricao_id: null,
        estados,
        volumes_semanais,
        alertas,
        decisoes: [...s.decisoes, ...novasDecisoes],
        sessoes,
      };
    });
    return decisoes;
  }, []);

  const updatePerfilAndRemount = useCallback(
    async (partial: Partial<Perfil>, opts?: { skipLlm?: boolean }) => {
      // Snapshot current for merge
      let snapshot = state;
      setState((s) => {
        snapshot = s;
        return s;
      });
      const base = snapshot.perfil ?? seedState.perfil!;
      // Never silently clear a PAR-Q "sim" block via remount patch
      const perfil: Perfil = {
        ...base,
        ...partial,
        // Preserve PAR-Q gate fields unless explicitly re-answered
        parq_liberado:
          partial.parq_respostas != null
            ? partial.parq_liberado ?? base.parq_liberado
            : base.parq_liberado,
        parq_respondido_em:
          partial.parq_respostas != null
            ? partial.parq_respondido_em ?? base.parq_respondido_em
            : base.parq_respondido_em,
        parq_respostas:
          partial.parq_respostas != null
            ? partial.parq_respostas
            : base.parq_respostas,
        onboarding_concluido: true,
      };

      if (parqBloqueiaPrescricao(perfil)) {
        setState((s) => ({
          ...s,
          perfil: { ...perfil, onboarding_concluido: false, parq_liberado: false },
        }));
        return { ok: false, fonte: "motor" as const, error: PARQ_BLOQUEIO_MSG };
      }

      const catalog =
        snapshot.exercicios.length > 0
          ? snapshot.exercicios
          : CATALOG_EXERCICIOS;
      const dataInicioPrev = snapshot.plano?.mesociclo?.data_inicio ?? null;

      // Try authenticated API (LLM path); fall back to local motor
      try {
        const res = await fetch("/api/plan/remount", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            perfil: partial,
            perfil_base: perfil,
            estados: snapshot.estados,
            skip_llm: opts?.skipLlm ?? false,
          }),
        });
        if (res.ok) {
          const body = (await res.json()) as {
            plano: typeof snapshot.plano;
            sessoes: typeof snapshot.sessoes;
            estados: typeof snapshot.estados;
            volumes_semanais: typeof snapshot.volumes_semanais;
            fonte: "motor" | "motor+llm";
            perfil: Perfil;
          };
          let plano = body.plano!;
          let sessoes = body.sessoes;
          if (dataInicioPrev && plano) {
            plano = {
              ...plano,
              mesociclo: { ...plano.mesociclo, data_inicio: dataInicioPrev },
            };
            sessoes = agendarSessoes(sessoes, plano, dataInicioPrev);
          }
          setState((s) => ({
            ...s,
            perfil: body.perfil ?? perfil,
            plano,
            sessoes,
            estados: body.estados,
            volumes_semanais:
              body.volumes_semanais?.length
                ? body.volumes_semanais
                : s.volumes_semanais,
            active_sessao_id: null,
            logger_prescricao_id: null,
            exercicios: catalog,
          }));
          return { ok: true, fonte: body.fonte };
        }
        if (res.status === 403) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          return {
            ok: false,
            fonte: "motor" as const,
            error: err.error ?? PARQ_BLOQUEIO_MSG,
          };
        }
        // Non-ok / unauthenticated → local motor
      } catch {
        /* offline */
      }

      const local = await remountPlano({
        perfil,
        catalog,
        estadosAnteriores: snapshot.estados,
        skipLlm: true,
      });
      let plano = local.plano;
      let sessoes = local.sessoes;
      if (dataInicioPrev) {
        plano = {
          ...plano,
          mesociclo: { ...plano.mesociclo, data_inicio: dataInicioPrev },
        };
        sessoes = agendarSessoes(sessoes, plano, dataInicioPrev);
      }
      setState((s) => ({
        ...s,
        perfil,
        plano,
        sessoes,
        estados: local.estados,
        volumes_semanais:
          local.volumes_semanais.length
            ? local.volumes_semanais
            : s.volumes_semanais,
        active_sessao_id: null,
        logger_prescricao_id: null,
        exercicios: catalog,
      }));
      return { ok: true, fonte: local.fonte };
    },
    [state],
  );

  const setDataInicio = useCallback((isoDate: string) => {
    setState((s) => {
      if (!s.plano) return s;
      const plano = {
        ...s.plano,
        mesociclo: { ...s.plano.mesociclo, data_inicio: isoDate },
      };
      const sessoes = agendarSessoes(s.sessoes, plano, isoDate);
      return { ...s, plano, sessoes };
    });
  }, []);

  const markCalendario = useCallback(
    (sessaoId: string, action: "pular" | "planejar" | "feito") => {
      setState((s) => {
        if (action === "pular") {
          return { ...s, sessoes: marcarPulada(s.sessoes, sessaoId) };
        }
        if (action === "planejar") {
          return { ...s, sessoes: desmarcarPulada(s.sessoes, sessaoId) };
        }
        // feito: mark concluida if not already (no series required for calendar sync)
        return {
          ...s,
          sessoes: s.sessoes.map((x) =>
            x.id === sessaoId && x.status !== "em_andamento"
              ? {
                  ...x,
                  status: "concluida" as const,
                  finalizada_em:
                    x.finalizada_em ?? new Date().toISOString(),
                  data: x.data ?? new Date().toISOString().slice(0, 10),
                }
              : x,
          ),
        };
      });
    },
    [],
  );

  const resetApp = useCallback(() => {
    setState(resetState());
  }, []);

  const value = useMemo(
    () => ({
      state,
      ready,
      updatePerfil,
      finishOnboarding,
      completeOnboarding,
      saveCheckin,
      startSession,
      setLoggerPrescricao,
      logSerie,
      startRest,
      tickRest,
      skipRest,
      addRest,
      finishSession,
      resetApp,
      updatePerfilAndRemount,
      setDataInicio,
      markCalendario,
    }),
    [
      state,
      ready,
      updatePerfil,
      finishOnboarding,
      completeOnboarding,
      saveCheckin,
      startSession,
      setLoggerPrescricao,
      logSerie,
      startRest,
      tickRest,
      skipRest,
      addRest,
      finishSession,
      resetApp,
      updatePerfilAndRemount,
      setDataInicio,
      markCalendario,
    ],
  );

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error("useApp fora de AppProvider");
  return ctx;
}
