"use client";

import { VolumeBar } from "@/components/VolumeBar";
import { ExplicaConceito } from "@/components/Conceito";
import { DiagnosticoExercicio } from "@/components/DiagnosticoExercicio";
import { RevisaoSemanalCard } from "@/components/RevisaoSemanal";
import { revisarSemana } from "@/lib/inteligencia/revisao-semanal";
import { diagnosticarEstagnacao, preverForca } from "@/lib/inteligencia/diagnostico";
import { hojeIsoSaoPaulo } from "@/lib/plan/proxima-sessao";
import { contextoPessoal } from "@/lib/conceitos";
import { labelAcao, labelGrupo } from "@/lib/labels";
import { semCodigoRegra } from "@/lib/llm/tom";
import { apresentarAlerta } from "@/lib/alertas/apresentar";
import { proximoTreinoParaAlerta } from "@/lib/alertas/proximo-treino";
import { EditarTreinoSheet } from "@/components/EditarTreinoSheet";
import { SonoAguaSection } from "@/components/SonoAgua";
import { CardioSection } from "@/components/Cardio";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useApp } from "@/components/AppProvider";
import {
  AlertaCard,
  Badge,
  Card,
  EvidenciaBadge,
  ProgressBar,
  SectionTitle,
  Stat,
} from "@/components/ui";
import { useClientValue } from "@/lib/use-client-value";
import { faixaVolume, VOLUME_MAX, VOLUME_MIN } from "@/lib/domain";
import { currentIsoWeek } from "@/lib/engine/volume";
import { seriesEfetivasSemana } from "@/lib/engine/proximidade-falha";
import { alertaVolumeValido } from "@/lib/engine/alertas-volume";
import { desdeInicio, inicioDeUso, semanaAntesDoInicio } from "@/lib/inicio";
import { textoCarga } from "@/lib/catalog/tipo-carga";
import { useModoCarga } from "@/lib/use-modo-carga";

/** T7 — e1RM, PRs, volume 10–20, consistência. ZERO fake — só registros reais. */
/** 32.5 → "32,5" */
function fmtKg(n: number): string {
  return String(n).replace(".", ",");
}

export default function ProgressoPage() {
  const { state } = useApp();
  const { alternado } = useModoCarga();
  // Tudo conta a partir do primeiro treino ou check-in registrado (dados antigos ficam salvos, fora da conta).
  const inicio = inicioDeUso(state);
  const registros = state.registros.filter((r) => desdeInicio(r.executado_em, inicio));
  const temHistorico = registros.length > 0;

  // Semana ISO (seg–dom) no fuso de São Paulo (no servidor usa um valor fixo até hidratar).
  const semanaAtual = useClientValue(currentIsoWeek, "2026-W44");
  // Data de hoje só no cliente (evita divergência de hidratação no diagnóstico/previsão).
  const hojeDiag = useClientValue(() => hojeIsoSaoPaulo(), "");
  const [barsOn, setBarsOn] = useState(false);
  const [editar, setEditar] = useState<string | null>(null);
  useEffect(() => {
    const id = requestAnimationFrame(() => setBarsOn(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const vols = temHistorico
    ? state.volumes_semanais.filter((v) => v.semana_iso === semanaAtual && !semanaAntesDoInicio(v.semana_iso, inicio))
    : [];

  const alertasVolume = !temHistorico
    ? []
    : state.alertas.filter(
      (a) =>
        !a.resolvido &&
        (a.motivo.includes("[R10:") || a.motivo.includes("[R11:")) &&
        alertaVolumeValido(a.motivo, inicio),
      );

  // e1RM/PR só com sessão real ancorada
  const estadosReais = temHistorico
    ? state.estados.filter(
        (e) =>
          e.ultima_sessao_em != null ||
          (e.pr_reps > 0 && e.origem_carga === "historico") ||
          registros.some((r) => r.exercicio_id === e.exercicio_id),
      )
    : [];

  // Séries que chegaram perto da falha (até 3 reps sobrando, já calibradas) por músculo nesta semana.
  const efetivas = temHistorico
    ? seriesEfetivasSemana(registros, state.exercicios, semanaAtual)
    : [];
  const totEf = efetivas.reduce((a, g) => a + g.efetivas, 0);
  const totSeries = efetivas.reduce((a, g) => a + g.total, 0);

  const concluidas = state.sessoes.filter((s) => s.status === "concluida" && desdeInicio(s.data ?? s.iniciada_em, inicio)).length;
  const planejadas4sem = (state.plano?.dias_por_semana ?? 4) * 4;
  const consistenciaPct = temHistorico
    ? Math.min(
        100,
        Math.round((concluidas / Math.max(planejadas4sem, 1)) * 100),
      )
    : 0;

  return (
    <main className="motion-fade-up motion-stagger px-5 pb-8 pt-8">
      <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-accent">
        Progresso
      </p>
      <h1 className="mb-4 text-2xl font-bold">Evolução real</h1>

      {!temHistorico ? (
        <Card className="mb-6 border border-accent/20 bg-accent/5">
          <p className="text-sm font-semibold text-accent">Sem dados ainda</p>
          <p className="mt-1 text-sm text-muted">
            Complete um treino e registre séries — volume, e1RM e PRs sobem só
            com o que você fez de verdade.
          </p>
          <Link
            href="/hoje"
            className="mt-3 inline-block text-sm font-semibold text-accent underline"
          >
            Ir para Hoje →
          </Link>
        </Card>
      ) : null}

      {(() => {
        const rev = hojeDiag ? revisarSemana(state, hojeDiag) : null;
        return rev ? <RevisaoSemanalCard r={rev} /> : null;
      })()}

      <SectionTitle title="Volume semanal efetivo" action={<ExplicaConceito id="volume" />} />
      <p className="mb-3 text-xs text-muted">
        Meta: {VOLUME_MIN} a {VOLUME_MAX} séries por semana em cada músculo (abdômen e antebraço: até 12).
        Série direta conta 1; quando o músculo só ajuda, conta meia.
      </p>
      <Card className="card-motion mb-6 space-y-4 motion-stagger">
        {vols.length === 0 && (
          <p className="text-sm text-muted">
            Sem dados ainda — complete um treino.
          </p>
        )}
        {vols.map((v, vi) => {
          const fx = faixaVolume(v.grupo);
          const faixa =
            v.series_efetivas < fx.min
              ? "abaixo"
              : v.series_efetivas > fx.max
                ? "acima"
                : "na faixa";
          const tone =
            faixa === "na faixa" ? "go" : faixa === "abaixo" ? "warn" : "danger";
          const barTone = faixa === "na faixa" ? "go" : "warn";
          return (
            <div key={v.grupo}>
              <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                <span>{labelGrupo(v.grupo)}</span>
                <div className="flex items-center gap-2">
                  <Badge tone={tone}>
                    {faixa === "abaixo"
                      ? "abaixo"
                      : faixa === "acima"
                        ? "acima"
                        : "na faixa"}
                  </Badge>
                  <span className="load-num">
                    {v.series_efetivas}
                    <span className="text-muted">
                      {" "}
                      / {fx.min}–{fx.max}
                    </span>
                  </span>
                </div>
              </div>
              {barsOn ? (
                <VolumeBar
                  label={labelGrupo(v.grupo)}
                  valor={v.series_efetivas}
                  max={24}
                  faixa={[fx.min, fx.max]}
                  index={vi}
                  tom={barTone}
                  cabecalho={false}
                  unidade="séries efetivas/semana"
                />
              ) : (
                <div className="vb-track mt-1 h-2" aria-hidden />
              )}
            </div>
          );
        })}
      </Card>

      {alertasVolume.length > 0 && (
        <>
          {editar ? <EditarTreinoSheet sessaoId={editar} onClose={() => setEditar(null)} /> : null}
          <SectionTitle title="Volume por músculo" />
          <div className="mb-6 space-y-3 motion-stagger">
            {alertasVolume.map((a) => {
              const ap = apresentarAlerta(a);
              const alvo = ap.acao?.tipo === "revisar_treino" ? proximoTreinoParaAlerta(state, ap.acao.grupo) : null;
              return (
                <AlertaCard
                  key={a.id}
                  testId="alerta-volume"
                  alerta={ap}
                  onAcao={alvo ? () => setEditar(alvo) : undefined}
                />
              );
            })}
          </div>
        </>
      )}

      <SectionTitle title="Séries perto da falha" action={<ExplicaConceito id="serie_valida" ctx={contextoPessoal(state)} />} />
      <p className="mb-3 text-xs text-muted">
        Conta como efetiva a série que terminou com até 3 reps sobrando. Quando o que você fez mostra outra coisa, eu ajusto o RIR marcado.
      </p>
      <div data-testid="efetivas-semana"><Card className="card-motion mb-6 space-y-3">
        {efetivas.length === 0 ? (
          <p className="text-sm text-muted">Sem séries nesta semana ainda.</p>
        ) : (
          <>
            <p className="text-sm">
              Nesta semana, <span className="load-num">{totEf}</span> de{" "}
              <span className="load-num">{totSeries}</span> {totSeries === 1 ? "série ficou" : "séries ficaram"} perto da falha.
            </p>
            {efetivas.map((g) => {
              const pct = g.total ? Math.round((g.efetivas / g.total) * 100) : 0;
              return (
                <div key={g.grupo}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                    <span>{labelGrupo(g.grupo)}</span>
                    <span className="load-num">
                      {g.efetivas}
                      <span className="text-muted"> / {g.total} {g.total === 1 ? "série" : "séries"}</span>
                    </span>
                  </div>
                  <ProgressBar value={pct} tone={pct >= 70 ? "go" : "warn"} />
                </div>
              );
            })}
            {totSeries > 0 && totEf / totSeries < 0.7 ? (
              <p className="text-xs text-warn">Muitas séries ficaram longe da falha. Leve as próximas até sentir que só sobrariam 1–2 reps.</p>
            ) : null}
          </>
        )}
      </Card></div>

      <SonoAguaSection />

      <CardioSection />

      <SectionTitle title="Força estimada (e1RM) e recordes" action={<ExplicaConceito id="rm" ctx={contextoPessoal(state)} />} />
      <div className="mb-6 space-y-3 motion-stagger">
        {estadosReais.length === 0 && (
          <Card>
            <p className="text-sm text-muted">
              Sem dados ainda — complete um treino.
            </p>
          </Card>
        )}
        {estadosReais.map((e, i) => {
          const ex = state.exercicios.find((x) => x.id === e.exercicio_id);
          return (
            <Card
              key={e.exercicio_id}
              className={`flex items-start justify-between gap-3 ${i === 0 ? "pr-pop" : ""}`}
            >
              <div className="min-w-0">
                <p className="font-semibold">{ex?.nome ?? "Exercício"}</p>
                <p className="text-xs text-muted">
                  {e.pr_reps > 0
                    ? `Recorde ${textoCarga(e.pr_carga_kg, ex, alternado(ex?.id))} × ${e.pr_reps}`
                    : "Recorde: sem dados ainda"}{" "}
                  · carga atual {textoCarga(e.carga_atual_kg, ex, alternado(ex?.id))}
                </p>
                {hojeDiag ? (
                  <DiagnosticoExercicio
                    diag={diagnosticarEstagnacao(state, e.exercicio_id, hojeDiag)}
                    prev={preverForca(state.registros, e.exercicio_id, hojeDiag)}
                  />
                ) : null}
              </div>
              <Stat label="e1RM" value={e.pr_reps > 0 && e.e1rm_estimado_kg > 0 ? `${e.e1rm_estimado_kg}` : "—"} mono />
            </Card>
          );
        })}
      </div>

      <SectionTitle title="Consistência (4 semanas)" />
      <Card className="mb-6">
        <div className="mb-2 flex justify-between text-sm">
          <span>Treinos feitos vs planejados</span>
          <span className="load-num font-semibold">{consistenciaPct}%</span>
        </div>
        <ProgressBar value={consistenciaPct} max={100} tone="accent" />
        <p className="mt-2 text-xs text-muted">
          {temHistorico
            ? `${concluidas} ${concluidas === 1 ? "treino feito" : "treinos feitos"} nas últimas 4 semanas.`
            : "Sem dados ainda — complete um treino."}
        </p>
      </Card>

      <SectionTitle title="Decisões recentes" />
      <div className="motion-stagger space-y-3">
        {state.decisoes.length === 0 && (
          <Card>
            <p className="text-sm text-muted">
              Sem decisões ainda — o coach registra a decisão de cada exercício após cada sessão.
            </p>
          </Card>
        )}
        {[...state.decisoes].reverse().slice(0, 6).map((d) => {
          const ex = state.exercicios.find((e) => e.id === d.exercicio_id);
          return (
            <Card key={d.id}>
              <div className="mb-1 flex flex-wrap gap-2">
                <Badge tone={d.acao === "subir_carga" ? "go" : d.acao === "reduzir_carga" || d.acao === "deload" ? "warn" : "muted"}>{labelAcao(d.acao)}</Badge>
                <EvidenciaBadge evidencia={d.evidencia} />
              </div>
              <p className="text-sm">
                {ex?.nome ?? "Exercício"} ·{" "}
                <span className="load-num">
                  {fmtKg(d.carga_anterior_kg)} → {textoCarga(d.nova_carga_kg, ex, alternado(ex?.id))}
                </span>
              </p>
              <p className="mt-1 text-xs text-muted">{semCodigoRegra(d.motivo)}</p>
            </Card>
          );
        })}
      </div>
    </main>
  );
}
