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
import { aplicarEstadoNaPrescricao } from "@/lib/engine/progression";
import { hojeIsoSaoPaulo, proximaSessao } from "@/lib/plan/proxima-sessao";
import { gerarPlanoFromPerfil } from "@/lib/plan/gerar-plano";
import {
  agendarSessoes,
} from "@/lib/plan/calendario";
import { remountPlano } from "@/lib/plan/remount-plano";
import {
  PARQ_BLOQUEIO_MSG,
  parqBloqueiaPrescricao,
} from "@/lib/plan/parq";
import { CATALOG_EXERCICIOS } from "@/lib/catalog/exercicios";
import { ancorarCargaDeAquecimento } from "@/lib/engine/ancorar-carga";
import { concluirSessao } from "@/lib/engine/concluir-sessao";
import {
  aplicarCorrecao,
  desfazerCorrecao,
  type RascunhoCorrecao,
} from "@/lib/plan/corrigir-concluida";
import {
  adaptarAposSerie,
  aplicarAdaptacaoNaPrescricao,
  type AdaptacaoAoVivo,
} from "@/lib/engine/adaptacao-ao-vivo";
import { aplicarTroca } from "@/lib/plan/trocar-exercicio";
import {
  aplicarEdicao,
  desfazerEdicao,
  voltarAoCoach,
  type Rascunho,
} from "@/lib/plan/editar-treino";
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
    opts?: { ancorar?: boolean },
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
  /** Troca permanente de exercício no plano (só após "Confirmar troca"). */
  trocarExercicio: (deId: string, paraId: string) => boolean;
  /** Editar treino: só após "Confirmar". */
  editarSessao: (r: Rascunho) => { ok: boolean; erro?: string };
  desfazerEdicaoSessao: (sessaoId: string) => { ok: boolean; erro?: string };
  corrigirSessaoConcluida: (r: RascunhoCorrecao) => { ok: boolean; erro?: string; avisos?: string[] };
  desfazerCorrecaoSessao: (sessaoId: string) => { ok: boolean; erro?: string };
  voltarSessaoAoCoach: (sessaoId: string) => { ok: boolean; erro?: string };
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
    (serie: Omit<RegistroSerie, "id" | "executado_em">, opts?: { ancorar?: boolean }) => {
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
        // ancorar=false: o logger já pré-preenche o aquecimento com a carga de aquecimento (60%),
        // então ela não pode virar a carga de trabalho do dia.
        if (serie.tipo_serie === "aquecimento" && opts?.ancorar !== false) {
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
                      ancoras_sessao: [
                        ...(sessao.ancoras_sessao ?? []).filter(
                          (a) => a.exercicio_id !== presc.exercicio_id,
                        ),
                        {
                          exercicio_id: presc.exercicio_id,
                          trabalho_kg: ancora.trabalho_kg,
                        },
                      ],
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
      const r = concluirSessao(s, { gravarSnapshot: true });
      decisoes = r.decisoes;
      return r.state;
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
        // Calendário é a fonte do usuário: permite trocar o status de qualquer
        // dia (inclusive um já "feito"). Só a sessão em andamento fica intocada.
        return {
          ...s,
          sessoes: s.sessoes.map((x) => {
            if (x.id !== sessaoId || x.status === "em_andamento") return x;
            if (action === "pular") return { ...x, status: "pulada" as const };
            if (action === "planejar")
              return { ...x, status: "planejada" as const };
            return {
              ...x,
              status: "concluida" as const,
              finalizada_em: x.finalizada_em ?? new Date().toISOString(),
              data: x.data ?? hojeIsoSaoPaulo(),
            };
          }),
        };
      });
    },
    [],
  );

  const trocarExercicio = useCallback((deId: string, paraId: string) => {
    const next = aplicarTroca(state, deId, paraId);
    if (!next) return false;
    setState(next);
    return true;
  }, [state]);

  const editarSessao = useCallback((r: Rascunho) => {
    const res = aplicarEdicao(state, r);
    if (!res.ok) return { ok: false, erro: res.erro };
    setState(res.state);
    return { ok: true };
  }, [state]);

  const desfazerEdicaoSessao = useCallback((sessaoId: string) => {
    const res = desfazerEdicao(state, sessaoId);
    if (!res.ok) return { ok: false, erro: res.erro };
    setState(res.state);
    return { ok: true };
  }, [state]);

  const corrigirSessaoConcluida = useCallback((r: RascunhoCorrecao) => {
    const res = aplicarCorrecao(state, r);
    if (!res.ok) return { ok: false, erro: res.erro };
    if (res.state !== state) setState(res.state);
    return { ok: true, avisos: res.avisos };
  }, [state]);

  const desfazerCorrecaoSessao = useCallback((sessaoId: string) => {
    const res = desfazerCorrecao(state, sessaoId);
    if (!res.ok) return { ok: false, erro: res.erro };
    setState(res.state);
    return { ok: true };
  }, [state]);

  const voltarSessaoAoCoach = useCallback((sessaoId: string) => {
    const res = voltarAoCoach(state, sessaoId);
    if (!res.ok) return { ok: false, erro: res.erro };
    setState(res.state);
    return { ok: true };
  }, [state]);

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
      trocarExercicio,
      editarSessao,
      desfazerEdicaoSessao,
      corrigirSessaoConcluida,
      desfazerCorrecaoSessao,
      voltarSessaoAoCoach,
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
      trocarExercicio,
      editarSessao,
      desfazerEdicaoSessao,
      corrigirSessaoConcluida,
      desfazerCorrecaoSessao,
      voltarSessaoAoCoach,
    ],
  );

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error("useApp fora de AppProvider");
  return ctx;
}
