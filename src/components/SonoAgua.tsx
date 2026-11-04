"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/AppProvider";
import { AlertaCard, Card, SectionTitle } from "@/components/ui";
import { useClientValue } from "@/lib/use-client-value";
import { formatarDuracaoSono } from "@/lib/domain/sono";
import {
  SONO_MAX_H,
  SONO_MIN_H,
  avaliarAgua,
  avaliarSono,
  estadoVazio,
  horaDoEixo,
  litros,
  metaAguaMl,
  pesoAtual,
  serieDias,
  type DiaSonoAgua,
} from "@/lib/sono-agua/avaliacao";
import type { AlertaApresentado } from "@/lib/alertas/apresentar";

const hojeUtc = () => new Date().toISOString().slice(0, 10);
const DIAS_SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];
function rotuloDia(iso: string): string {
  return DIAS_SEMANA[new Date(`${iso}T12:00:00Z`).getUTCDay()]!;
}
function diaMes(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/** Dados prontos para as duas telas. */
export function useSonoAgua(janela: 7 | 14) {
  const { state } = useApp();
  const hoje = useClientValue(hojeUtc, "");
  return useMemo(() => {
    const dias = hoje ? serieDias(state.checkins, hoje, janela) : [];
    const meta = metaAguaMl(pesoAtual(state.checkins, state.perfil?.peso_kg));
    return {
      dias,
      meta,
      sono: avaliarSono(dias, janela),
      agua: avaliarAgua(dias, meta, janela),
      vazio: hoje ? estadoVazio(dias, janela) : null,
    };
  }, [state.checkins, state.perfil?.peso_kg, hoje, janela]);
}

function Avaliacao({ a, testId }: { a: AlertaApresentado; testId: string }) {
  const router = useRouter();
  const href = a.acao?.tipo === "link" ? a.acao.href : null;
  return <AlertaCard alerta={a} testId={testId} onAcao={href ? () => router.push(href) : undefined} />;
}

const W = 340;
const PAD_L = 30;

function GraficoDuracao({ dias }: { dias: DiaSonoAgua[] }) {
  const H = 120;
  const max = 11;
  const y = (h: number) => 8 + (H - 24) * (1 - Math.min(h, max) / max);
  const bw = (W - PAD_L) / dias.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Horas de sono por noite" data-testid="grafico-sono-duracao">
      <rect x={PAD_L} y={y(SONO_MAX_H)} width={W - PAD_L} height={y(SONO_MIN_H) - y(SONO_MAX_H)} className="fill-go/10" />
      {[6, 7, 9].map((h) => (
        <g key={h}>
          <line x1={PAD_L} x2={W} y1={y(h)} y2={y(h)} className={h === 6 ? "stroke-warn/40" : "stroke-go/40"} strokeDasharray="3 3" />
          <text x={PAD_L - 4} y={y(h) + 3} textAnchor="end" className="fill-muted text-[9px]">{h} h</text>
        </g>
      ))}
      {dias.map((d, i) => {
        const x = PAD_L + i * bw + bw * 0.18;
        const w = bw * 0.64;
        const tom = d.sono_h == null ? "" : d.sono_h < 6 ? "fill-warn" : d.sono_h < 7 ? "fill-warn/60" : "fill-go";
        return (
          <g key={d.data}>
            {d.sono_h != null ? (
              <rect x={x} y={y(d.sono_h)} width={w} height={y(0) - y(d.sono_h)} rx={3} className={tom}>
                <title>{`${diaMes(d.data)}: ${formatarDuracaoSono(d.sono_h)}`}</title>
              </rect>
            ) : (
              <rect x={x} y={y(0) - 2} width={w} height={2} rx={1} className="fill-white/10" />
            )}
            {dias.length <= 7 || i % 2 === 1 ? (
              <text x={x + w / 2} y={H - 4} textAnchor="middle" className="fill-muted text-[9px]">
                {rotuloDia(d.data)}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

function GraficoHorarios({ dias }: { dias: DiaSonoAgua[] }) {
  const com = dias.filter((d) => d.dormir_min != null && d.acordar_min != null);
  const H = 130;
  // eixo da noite: 20:00 (480) a 12:00 do dia seguinte (1440), ajustado aos dados
  const lo = Math.min(480, ...com.map((d) => d.dormir_min! - 30));
  const hi = Math.max(1200, ...com.map((d) => d.acordar_min! + 30));
  const y = (m: number) => 6 + (H - 22) * ((m - lo) / (hi - lo));
  const bw = (W - PAD_L) / dias.length;
  const marcas: number[] = [];
  for (let m = Math.ceil(lo / 120) * 120; m <= hi; m += 120) marcas.push(m);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Horário de dormir e de acordar" data-testid="grafico-sono-horarios">
      {marcas.map((m) => (
        <g key={m}>
          <line x1={PAD_L} x2={W} y1={y(m)} y2={y(m)} className="stroke-white/5" />
          <text x={PAD_L - 4} y={y(m) + 3} textAnchor="end" className="fill-muted text-[9px]">{horaDoEixo(m).slice(0, 2)}h</text>
        </g>
      ))}
      {dias.map((d, i) => {
        const cx = PAD_L + i * bw + bw / 2;
        if (d.dormir_min == null || d.acordar_min == null) return null;
        return (
          <g key={d.data}>
            <line x1={cx} x2={cx} y1={y(d.dormir_min)} y2={y(d.acordar_min)} className="stroke-accent/35" strokeWidth={Math.max(4, bw * 0.4)} strokeLinecap="round" />
            <circle cx={cx} cy={y(d.dormir_min)} r={3.5} className="fill-accent">
              <title>{`${diaMes(d.data)}: dormiu ${d.inicio}`}</title>
            </circle>
            <circle cx={cx} cy={y(d.acordar_min)} r={3.5} className="fill-bone-50">
              <title>{`${diaMes(d.data)}: acordou ${d.fim}`}</title>
            </circle>
          </g>
        );
      })}
      {dias.map((d, i) =>
        dias.length <= 7 || i % 2 === 1 ? (
          <text key={d.data} x={PAD_L + i * bw + bw / 2} y={H - 4} textAnchor="middle" className="fill-muted text-[9px]">
            {rotuloDia(d.data)}
          </text>
        ) : null,
      )}
    </svg>
  );
}

function GraficoAgua({ dias, meta }: { dias: DiaSonoAgua[]; meta: number }) {
  const H = 120;
  const max = Math.max(meta * 1.25, ...dias.map((d) => d.agua_ml ?? 0));
  const y = (ml: number) => 8 + (H - 24) * (1 - ml / max);
  const bw = (W - PAD_L) / dias.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Água por dia contra a meta" data-testid="grafico-agua">
      <line x1={PAD_L} x2={W} y1={y(meta)} y2={y(meta)} className="stroke-accent" strokeDasharray="4 3" />
      <text x={PAD_L - 4} y={y(meta) + 3} textAnchor="end" className="fill-accent text-[9px]">meta</text>
      {dias.map((d, i) => {
        const x = PAD_L + i * bw + bw * 0.18;
        const w = bw * 0.64;
        return (
          <g key={d.data}>
            {d.agua_ml != null ? (
              <rect x={x} y={y(d.agua_ml)} width={w} height={y(0) - y(d.agua_ml)} rx={3} className={d.agua_ml >= meta ? "fill-sky-400" : "fill-sky-400/40"}>
                <title>{`${diaMes(d.data)}: ${litros(d.agua_ml)}`}</title>
              </rect>
            ) : (
              <rect x={x} y={y(0) - 2} width={w} height={2} rx={1} className="fill-white/10" />
            )}
            {dias.length <= 7 || i % 2 === 1 ? (
              <text x={x + w / 2} y={H - 4} textAnchor="middle" className="fill-muted text-[9px]">{rotuloDia(d.data)}</text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

function Legenda({ itens }: { itens: { cor: string; txt: string }[] }) {
  return (
    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
      {itens.map((i) => (
        <span key={i.txt} className="flex items-center gap-1">
          <span className={`inline-block h-2 w-2 rounded-full ${i.cor}`} />
          {i.txt}
        </span>
      ))}
    </div>
  );
}

/** Seção completa do Progresso. */
export function SonoAguaSection() {
  const [janela, setJanela] = useState<7 | 14>(7);
  const { dias, meta, sono, agua, vazio } = useSonoAgua(janela);
  const temAlgum = dias.some((d) => d.sono_h != null || d.agua_ml != null);
  return (
    <section id="sono-agua" className="mb-6 scroll-mt-6" data-testid="secao-sono-agua">
      <SectionTitle
        title="Sono e água"
        action={
          <div className="flex rounded-full border border-line p-0.5 text-xs" role="tablist">
            {([7, 14] as const).map((j) => (
              <button
                key={j}
                type="button"
                role="tab"
                aria-selected={janela === j}
                onClick={() => setJanela(j)}
                className={`motion-press rounded-full px-3 py-1 font-semibold ${janela === j ? "bg-accent text-ink-950" : "text-muted"}`}
              >
                {j} dias
              </button>
            ))}
          </div>
        }
      />
      {vazio ? (
        <Card className="mb-3 border border-accent/20 bg-accent/5" >
          <p className="text-sm font-semibold text-accent" data-testid="sono-agua-vazio">🌙 {vazio.titulo}</p>
          <p className="mt-1 text-sm text-muted">{vazio.texto}</p>
          <Link href="/checkin" className="mt-3 inline-block text-sm font-semibold text-accent underline">
            Fazer check-in →
          </Link>
        </Card>
      ) : null}
      {temAlgum ? (
        <div className="space-y-3">
          {sono ? <Avaliacao a={sono} testId="avaliacao-sono" /> : null}
          {agua ? <Avaliacao a={agua} testId="avaliacao-agua" /> : null}
          <Card>
            <p className="text-sm font-semibold">🌙 Horas por noite</p>
            <GraficoDuracao dias={dias} />
            <Legenda itens={[{ cor: "bg-go", txt: "7 h ou mais" }, { cor: "bg-warn/60", txt: "6 a 7 h" }, { cor: "bg-warn", txt: "menos de 6 h" }]} />
          </Card>
          <Card>
            <p className="text-sm font-semibold">⏰ Quando você dormiu e acordou</p>
            <p className="text-xs text-muted">Quanto mais alinhados os pontos, mais regular o sono.</p>
            <GraficoHorarios dias={dias} />
            <Legenda itens={[{ cor: "bg-accent", txt: "dormiu" }, { cor: "bg-bone-50", txt: "acordou" }]} />
          </Card>
          <Card>
            <p className="text-sm font-semibold">💧 Água por dia</p>
            <p className="text-xs text-muted">Sua meta: {litros(meta)} por dia (35 ml por kg de peso).</p>
            <GraficoAgua dias={dias} meta={meta} />
            <Legenda itens={[{ cor: "bg-sky-400", txt: "meta batida" }, { cor: "bg-sky-400/40", txt: "abaixo da meta" }]} />
          </Card>
        </div>
      ) : null}
    </section>
  );
}

/** Resumo curto no Hoje: só a avaliação mais importante da semana. */
export function SonoAguaResumo() {
  const { sono, agua } = useSonoAgua(7);
  const ordem = { bloqueio: 0, atencao: 1, info: 2 } as const;
  const top = [sono, agua].filter((x): x is AlertaApresentado => !!x).sort((a, b) => ordem[a.urgencia] - ordem[b.urgencia])[0];
  if (!top) return null;
  return (
    <Link href="/progresso#sono-agua" className="motion-press mb-4 block" data-testid="resumo-sono-agua">
      <AlertaCard alerta={{ ...top, acao: undefined, dica: "Ver gráficos de sono e água →" }} testId="resumo-sono-agua-card" />
    </Link>
  );
}
