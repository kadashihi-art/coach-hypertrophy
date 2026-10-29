"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/AppProvider";
import {
  AlertaBanner,
  Button,
  Card,
  EvidenciaBadge,
  SectionTitle,
} from "@/components/ui";
import {
  hojeIsoSaoPaulo,
  proximaSessao,
  sessoesDoPlano,
} from "@/lib/plan/proxima-sessao";
import { faseAtiva } from "@/lib/plan/estrutura";
import {
  avaliarCheckinDeload,
  resumoAjusteDeload,
} from "@/lib/engine/checkin-deload";
import {
  feedbackSono,
  resumoSonoCheckin,
} from "@/lib/domain/sono";
import {
  PARQ_BLOQUEIO_MSG,
  precisaResponderParq,
  parqBloqueiaPrescricao,
} from "@/lib/plan/parq";

export default function HojePage() {
  const { state, ready, startSession } = useApp();
  const router = useRouter();
  const [pickedId, setPickedId] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!state.perfil?.onboarding_concluido) {
      router.replace("/onboarding");
    }
  }, [ready, state.perfil, router]);

  const hojeSP = ready ? hojeIsoSaoPaulo() : null;
  const ciclo = useMemo(() => sessoesDoPlano(state, hojeSP), [state, hojeSP]);
  const sugerida = useMemo(() => proximaSessao(state), [state, hojeSP]);
  const fase = useMemo(() => faseAtiva(state.plano, hojeSP), [state.plano, hojeSP]);

  useEffect(() => {
    if (sugerida && !pickedId) setPickedId(sugerida.id);
  }, [sugerida, pickedId]);

  // Se a sugerida mudou (ex.: acabou de concluir), acompanhar
  useEffect(() => {
    if (sugerida) setPickedId(sugerida.id);
    // só reage quando a sessão sugerida muda (ex.: acabou de concluir)
  }, [sugerida?.id]);

  const sess =
    ciclo.find((s) => s.id === pickedId) ??
    sugerida ??
    ciclo[0];

  const plano = state.plano;
  const [hojeLabel, setHojeLabel] = useState<string>("");
  const [hojeIso, setHojeIso] = useState<string | null>(null);
  useEffect(() => {
    const d = new Date();
    setHojeIso(d.toISOString().slice(0, 10));
    setHojeLabel(
      d.toLocaleDateString("pt-BR", {
        weekday: "long",
        day: "numeric",
        month: "short",
        timeZone: "America/Sao_Paulo",
      }),
    );
  }, []);
  const alerta =
    state.alertas.find((a) => !a.resolvido) ??
    state.alertas.find((a) => a.nivel !== "N0") ??
    state.alertas[0];
  const ck = hojeIso
    ? state.checkins.find((c) => c.data === hojeIso)
    : undefined;

  const deloadPreview = useMemo(() => {
    if (!sess || !hojeIso) return null;
    // Sessão já em andamento: prescricoes já podem estar ajustadas —
    // ainda assim mostramos resumo a partir do check-in/meso/estados.
    return avaliarCheckinDeload({
      checkin: ck ?? null,
      mesociclo: state.plano?.mesociclo,
      estados: state.estados,
      prescricoes: sess.prescricoes,
      exercicios: state.exercicios,
      data: hojeIso,
    });
  }, [sess, ck, state.plano?.mesociclo, state.estados, state.exercicios, hojeIso]);

  const deloadResumo = deloadPreview
    ? resumoAjusteDeload(deloadPreview)
    : null;

  const parqBloqueado = parqBloqueiaPrescricao(state.perfil);
  const parqPendente = precisaResponderParq(state.perfil);

  function iniciar() {
    if (!sess) return;
    if (parqBloqueado) {
      if (parqPendente) router.push("/onboarding");
      return;
    }
    startSession(sess.id);
    router.push("/treino");
  }

  if (!ready || !state.perfil?.onboarding_concluido) {
    return (
      <main className="motion-fade-up flex min-h-dvh items-center justify-center p-6">
        <p className="text-sm text-muted">Carregando…</p>
      </main>
    );
  }

  const ctaLabel =
    sess?.status === "em_andamento"
      ? "Continuar treino"
      : sess?.status === "concluida"
        ? "Treinar de novo"
        : "Iniciar treino";

  const mesoPct = plano
    ? Math.round(
        (plano.mesociclo.semana_atual / plano.mesociclo.total_semanas) * 100,
      )
    : 0;

  const ultimaDecisao = state.decisoes
    .filter((d) => sess && d.exercicio_id && sess.prescricoes.some((p) => p.exercicio_id === d.exercicio_id))
    .slice(-1)[0];

  return (
    <main className="motion-fade-up motion-stagger px-5 pb-8 pt-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted capitalize">
            {hojeLabel || "Hoje"}
          </p>
          <h1 className="text-2xl font-bold">Hoje</h1>
          {fase && (state.plano?.estrutura?.fases.length ?? 0) > 1 ? (
            <p className="text-xs opacity-70">{fase.nome} · semanas {fase.semana_inicio}–{fase.semana_inicio + fase.semanas - 1}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <span className="pill-offline">Offline</span>
          <Link href="/checkin" className="text-xs font-semibold text-accent">
            {ck ? "Check-in ok" : "Check-in"}
          </Link>
        </div>
      </div>

      {alerta && (
        <div className="mb-4">
          <AlertaBanner
            nivel={alerta.nivel}
            motivo={alerta.motivo}
            recomendacao={alerta.recomendacao}
          />
        </div>
      )}

      {deloadResumo && (
        <div className="mb-4 rounded-2xl border border-accent/30 bg-[rgba(184,255,60,.08)] px-4 py-3 text-sm text-accent">
          {deloadResumo}
        </div>
      )}

      {/* Picker do mesociclo — qualquer dia */}
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {ciclo.map((s) => {
          const on = s.id === sess?.id;
          const done = s.status === "concluida";
          const live = s.status === "em_andamento";
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setPickedId(s.id)}
              className={`chip-motion shrink-0 rounded-[14px] border px-3 py-2 text-left ${
                on
                  ? "on border-accent bg-[rgba(184,255,60,.12)]"
                  : "border-border bg-surface"
              }`}
            >
              <div className="text-[10px] uppercase tracking-wide text-faint">
                Dia {s.ordem}
                {live ? " · agora" : done ? " · ok" : ""}
              </div>
              <div className={`text-sm font-semibold ${on ? "text-accent" : ""}`}>
                {s.nome}
              </div>
            </button>
          );
        })}
      </div>

      {sess && (
        <Card className="mb-4 p-5">
          <div className="mb-1 flex items-center justify-between">
            <div className="text-xs uppercase text-muted">Sessão</div>
            {sess.prescricoes[0] && (
              <EvidenciaBadge evidencia={sess.prescricoes[0].evidencia} />
            )}
          </div>
          <h2 className="text-3xl font-bold tracking-tight">{sess.nome}</h2>
          <div className="mt-3 flex flex-wrap gap-2 text-sm text-bone-300">
            <span className="num">~{sess.duracao_estimada_min} min</span>
            <span>·</span>
            <span>{sess.grupos.slice(0, 4).join(" · ")}</span>
          </div>
          {ultimaDecisao && sugerida?.id === sess.id && (
            <p className="pr-pop mt-3 text-xs text-muted">
              {ultimaDecisao.motivo.slice(0, 120)}
              {ultimaDecisao.motivo.length > 120 ? "…" : ""}
            </p>
          )}
          {sugerida?.id === sess.id && sess.status === "planejada" && (
            <p className="mt-2 text-xs text-accent">Próximo do ciclo</p>
          )}
        </Card>
      )}

      {plano && (
        <Card className="mb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase text-muted">Mesociclo</p>
              <p className="font-semibold">
                Semana <span className="num text-go">{plano.mesociclo.semana_atual}</span>{" "}
                de {plano.mesociclo.total_semanas} ·{" "}
                <span className="capitalize">{plano.mesociclo.foco}</span>
              </p>
            </div>
            <Link href="/plano" className="text-xs font-semibold text-accent">
              Plano
            </Link>
          </div>
          <div className="bar-track mt-3">
            <div
              className="meso-fill enter h-full rounded-full bg-accent"
              style={{ width: `${mesoPct}%`, height: "100%" }}
            />
          </div>
          <p className="mt-2 text-xs text-muted">{plano.justificativa.texto}</p>
          <div className="mt-2">
            <EvidenciaBadge evidencia={plano.justificativa.evidencia} />
          </div>
        </Card>
      )}

      {sess && (
        <Card className="mb-4">
          <SectionTitle title="Exercícios" />
          <ul className="space-y-2">
            {sess.prescricoes.map((p) => {
              const ex = state.exercicios.find((e) => e.id === p.exercicio_id);
              const est = state.estados.find(
                (e) => e.exercicio_id === p.exercicio_id,
              );
              const carga =
                est?.alvo_proxima_sessao.carga_kg ?? p.carga.trabalho_kg;
              return (
                <li
                  key={p.id}
                  className="flex items-center justify-between text-sm"
                >
                  <span>
                    {p.ordem}. {ex?.nome ?? p.exercicio_id}
                  </span>
                  <span className="load-num text-muted">
                    {carga} kg · {p.series}×{p.faixa_reps[0]}–{p.faixa_reps[1]}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {ck && (
        <Card className="mb-4">
          <p className="text-xs text-muted">Check-in de hoje</p>
          <p className="text-sm">
            Sono {resumoSonoCheckin(ck)} · Prontidão {ck.prontidao}/5
            {ck.prontidao <= 2 || ck.sono_h < 6 ? " · R9 ativa" : ""}
            {typeof ck.agua_ml === "number" ? ` · Água ${ck.agua_ml} ml` : ""}
          </p>
          {(() => {
            const hist = state.checkins
              .filter((c) => c.data !== ck.data)
              .sort((a, b) => b.data.localeCompare(a.data))
              .slice(0, 5)
              .map((c) => c.sono_h);
            const fb = feedbackSono(ck.sono_h, hist);
            return (
              <p
                className={`mt-1 text-xs ${
                  fb.nivel === "baixo" || fb.nivel === "inconsistente"
                    ? "text-warn"
                    : fb.nivel === "ok"
                      ? "text-go"
                      : "text-muted"
                }`}
              >
                {fb.titulo}. {fb.dica}
              </p>
            );
          })()}
          {ck.prontidao <= 2 || ck.sono_h < 6 ? (
            <p className="mt-1 text-xs text-warn">
              Sessão do dia ajustada: −1 série nos compostos (carga mantida).
            </p>
          ) : null}
        </Card>
      )}

      {!ck && (
        <Link
          href="/checkin"
          className="mb-4 block rounded-2xl border border-dashed border-border px-4 py-3 text-center text-sm text-muted"
        >
          Fazer check-in (~30s) antes do treino
        </Link>
      )}

      {parqBloqueado && (
        <Card className="mb-3 border-danger/40 bg-danger/10 text-sm">
          <p className="mb-1 font-bold text-danger">PAR-Q+ · bloqueio N2</p>
          <p className="mb-2 text-muted">{PARQ_BLOQUEIO_MSG}</p>
          {parqPendente ? (
            <Link href="/onboarding" className="text-xs font-semibold text-accent underline">
              Responder triagem PAR-Q+
            </Link>
          ) : (
            <a
              href="https://eparmedx.com/"
              target="_blank"
              rel="noreferrer"
              className="text-xs font-semibold text-accent underline"
            >
              eparmedx.com
            </a>
          )}
        </Card>
      )}

      <Button
        onClick={iniciar}
        disabled={!sess || !!plano?.bloqueado || sess.prescricoes.length === 0 || parqBloqueado}
        className="motion-cta-glow mt-2 min-h-14 py-5 text-lg"
      >
        {ctaLabel}
      </Button>
      <Link
        href="/checkin"
        className="mt-3 block rounded-[14px] bg-white/5 py-3 text-center text-sm text-muted"
      >
        {ck ? "Refazer check-in" : "Check-in"}
      </Link>
    </main>
  );
}
