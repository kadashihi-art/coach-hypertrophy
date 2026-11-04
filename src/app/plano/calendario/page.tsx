"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { PlanoTabs } from "@/components/PlanoTabs";
import { Badge, Button, Card, SectionTitle } from "@/components/ui";
import {
  derivarCalendario,
  parseIsoDate,
  type CalendarioDiaView,
} from "@/lib/plan/calendario";
import { comparacaoMeta, duracaoDaSessao, resumoDuracao } from "@/lib/engine/duracao-treino";
import { useClientValue } from "@/lib/use-client-value";
import { hojeIsoSaoPaulo, proximaSessao } from "@/lib/plan/proxima-sessao";
import { agendaEfetiva, sessoesDoCalendario } from "@/lib/plan/pendente";
import { DiaAcoes } from "@/components/DiaAcoes";

/** "2026-10-29" → "Qui, 29 out" (pt-BR, sem pontos). */
function dataHumana(iso: string): string {
  const d = parseIsoDate(iso);
  const dow = d
    .toLocaleDateString("pt-BR", { weekday: "short", timeZone: "UTC" })
    .replace(".", "");
  const mes = d
    .toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" })
    .replace(".", "");
  return `${dow.charAt(0).toUpperCase()}${dow.slice(1)}, ${d.getUTCDate()} ${mes}`;
}

const STATUS_LABEL: Record<CalendarioDiaView["status"], string> = {
  planejado: "Planejado",
  feito: "Feito",
  pulado: "Pulado",
  vazio: "Sem treino",
  em_andamento: "Em andamento",
  limpo: "Dia limpo",
};

const DOW = ["S", "T", "Q", "Q", "S", "S", "D"]; // Seg→Dom labels short

function statusColor(s: CalendarioDiaView["status"]) {
  switch (s) {
    case "feito":
      return "bg-go text-ink-950";
    case "pulado":
      return "bg-warn/30 text-warn border border-warn/40";
    case "em_andamento":
      return "bg-accent text-ink-950";
    case "planejado":
      return "bg-accent/20 text-accent border border-accent/40";
    case "limpo":
      return "bg-ink-900 text-faint border border-dashed border-ink-700";
    default:
      return "bg-ink-800 text-faint";
  }
}

/** Calendário mensal mínimo gamer — planejado / feito / pulado */
export default function CalendarioPage() {
  const { state, setDataInicio } = useApp();
  // Mês do relógio do aparelho (no servidor: outubro/2026 até hidratar) + navegação relativa.
  const mesBase = useClientValue(() => {
    const n = new Date();
    return n.getFullYear() * 12 + n.getMonth();
  }, 2026 * 12 + 9);
  const hydrated = useClientValue(() => true, false);
  const [deslocMes, setDeslocMes] = useState(0);
  const year = Math.floor((mesBase + deslocMes) / 12);
  const month0 = (mesBase + deslocMes) % 12;
  // Guarda só a data: o card lê o dia sempre do estado atual (não de uma cópia).
  const [escolhido, setSelectedData] = useState<string | null>(null);
  // Chips da semana em Hoje abrem o calendário já no dia tocado (?dia=AAAA-MM-DD).
  const diaUrl = useClientValue<string | null>(() => {
    const d = new URLSearchParams(window.location.search).get("dia");
    return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
  }, null);
  const selectedData = escolhido ?? diaUrl;

  const hojeCal = useClientValue<string | null>(hojeIsoSaoPaulo, null);
  // Treino não feito anda pra frente (só leitura); pulo explícito continua no dia.
  const days = useMemo(
    () => derivarCalendario(sessoesDoCalendario(agendaEfetiva(state, hojeCal)), year, month0, state.dias_limpos ?? []),
    [state, hojeCal, year, month0],
  );

  const selected = selectedData
    ? (days.find((d) => d.data === selectedData) ?? null)
    : null;

  const firstDow = useMemo(() => {
    // Mon=0 … Sun=6 for grid padding
    const d = new Date(Date.UTC(year, month0, 1, 12));
    return (d.getUTCDay() + 6) % 7;
  }, [year, month0]);

  const titulo = new Date(year, month0, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

  const hojeIso = useClientValue<string | null>(hojeIsoSaoPaulo, null);
  const next = hydrated ? proximaSessao(state, hojeIso) : undefined;
  const dataInicio = state.plano?.mesociclo?.data_inicio;

  function prevMonth() {
    setDeslocMes((d) => d - 1);
  }
  function nextMonth() {
    setDeslocMes((d) => d + 1);
  }

  return (
    <main className="motion-fade-up px-5 pb-28 pt-8">
      <PlanoTabs />
      <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-accent">
        Calendário
      </p>
      <h1 className="mb-2 text-2xl font-bold capitalize">{titulo}</h1>
      <p className="mb-3 text-sm text-muted">
        {dataInicio
          ? `Início do meso: ${dataHumana(dataInicio)}`
          : "Defina a data de início em Meu treino."}{" "}
        {next ? `· Próximo: ${next.nome}` : ""}
      </p>

      <div className="mb-3 flex gap-2">
        <Button variant="ghost" className="min-h-10 flex-1 text-sm" onClick={prevMonth} aria-label="Mês anterior">
          ←
        </Button>
        <Button variant="ghost" className="min-h-10 flex-1 text-sm" onClick={nextMonth} aria-label="Próximo mês">
          →
        </Button>
      </div>

      <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-faint">
        {DOW.map((d, i) => (
          <span key={`${d}-${i}`}>{d}</span>
        ))}
      </div>
      <div className="mb-4 grid grid-cols-7 gap-1">
        {Array.from({ length: firstDow }).map((_, i) => (
          <span key={`pad-${i}`} className="aspect-square" />
        ))}
        {days.map((d) => {
          const dayNum = Number(d.data.slice(-2));
          return (
            <button
              key={d.data}
              type="button"
              onClick={() => {
                setSelectedData(d.data);
              }}
              data-status={d.status}
              aria-label={`${dataHumana(d.data)}${d.nome ? ` · ${d.nome}` : ""} · ${STATUS_LABEL[d.status]}`}
              className={`aspect-square rounded-xl text-xs font-bold transition ${statusColor(d.status)} ${
                selected?.data === d.data ? "ring-2 ring-accent" : ""
              }`}
              title={d.nome ?? STATUS_LABEL[d.status]}
            >
              {dayNum}
            </button>
          );
        })}
      </div>

      <div className="mb-4 flex flex-wrap gap-2 text-[10px]">
        <Badge tone="accent">planejado</Badge>
        <Badge tone="go">feito</Badge>
        <Badge tone="warn">pulado</Badge>
        <Badge tone="muted">vazio</Badge>
        <Badge tone="muted">limpo</Badge>
      </div>

      {selected ? (
        <section data-testid="card-dia" aria-label="Dia selecionado">
        <Card className="mb-4">
          <p className="font-semibold">
            {dataHumana(selected.data)}
            {selected.nome ? ` · ${selected.nome}` : ""}
          </p>
          {(() => {
            if (!selected.sessao_id || selected.status !== "feito") return null;
            const sess = state.sessoes.find((x) => x.id === selected.sessao_id);
            const dt = sess ? duracaoDaSessao(sess, state.registros) : null;
            if (!dt) return null;
            const meta = comparacaoMeta(dt.duracao_min, state.perfil?.minutos_por_sessao);
            return (
              <p className="mt-1 text-sm text-muted" data-testid="duracao-dia">
                ⏱ {resumoDuracao(dt)}{meta ? `. ${meta}` : ""}
              </p>
            );
          })()}
          <DiaAcoes key={selected.data} dia={selected} />
        </Card>
        </section>
      ) : null}

      {!dataInicio && state.plano ? (
        <Card>
          <SectionTitle title="Atalho" />
          <p className="mb-2 text-sm text-muted">
            Começar o mesociclo hoje e agendar as sessões.
          </p>
          <Button
            onClick={() => {
              setDataInicio(hojeIsoSaoPaulo());
            }}
          >
            Começar hoje
          </Button>
        </Card>
      ) : null}

    </main>
  );
}
