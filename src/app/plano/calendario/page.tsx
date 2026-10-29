"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useApp } from "@/components/AppProvider";
import { PlanoTabs } from "@/components/PlanoTabs";
import { Badge, Button, Card, SectionTitle } from "@/components/ui";
import {
  derivarCalendario,
  parseIsoDate,
  type CalendarioDiaView,
} from "@/lib/plan/calendario";
import { hojeIsoSaoPaulo, proximaSessao } from "@/lib/plan/proxima-sessao";

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
    default:
      return "bg-ink-800 text-faint";
  }
}

/** Calendário mensal mínimo gamer — planejado / feito / pulado */
export default function CalendarioPage() {
  const { state, markCalendario, setDataInicio } = useApp();
  const [year, setYear] = useState(2026);
  const [month0, setMonth0] = useState(9); // Oct 0-indexed fallback; hydrated below
  // Guarda só a data: o card lê o dia sempre do estado atual (não de uma cópia).
  const [selectedData, setSelectedData] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const n = new Date();
    setYear(n.getFullYear());
    setMonth0(n.getMonth());
    setHydrated(true);
  }, []);

  const days = useMemo(
    () => derivarCalendario(state.sessoes, year, month0),
    [state.sessoes, year, month0],
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

  const [hojeIso, setHojeIso] = useState<string | null>(null);
  useEffect(() => {
    setHojeIso(hojeIsoSaoPaulo());
  }, []);
  const next = hydrated ? proximaSessao(state, hojeIso) : undefined;
  const dataInicio = state.plano?.mesociclo?.data_inicio;

  function prevMonth() {
    if (month0 === 0) {
      setYear((y) => y - 1);
      setMonth0(11);
    } else setMonth0((m) => m - 1);
  }
  function nextMonth() {
    if (month0 === 11) {
      setYear((y) => y + 1);
      setMonth0(0);
    } else setMonth0((m) => m + 1);
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
              onClick={() => setSelectedData(d.data)}
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
      </div>

      {selected ? (
        <Card className="mb-4" data-testid="card-dia">
          <p className="font-semibold">
            {dataHumana(selected.data)}
            {selected.nome ? ` · ${selected.nome}` : ""}
          </p>
          {selected.sessao_id ? (
            <div className="mt-3 flex flex-col gap-2">
              {(
                [
                  ["planejar", "planejado", "Planejado", "bg-accent/20 text-accent"],
                  ["feito", "feito", "Feito", "bg-go text-ink-950"],
                  ["pular", "pulado", "Pular", "bg-warn/30 text-warn"],
                ] as const
              ).map(([acao, st, label, ativo]) => {
                const on = selected.status === st;
                return (
                  <Button
                    key={acao}
                    variant="ghost"
                    aria-pressed={on}
                    disabled={selected.status === "em_andamento"}
                    className={`min-h-11 text-sm ${on ? `${ativo} ring-2 ring-current` : ""}`}
                    onClick={() => markCalendario(selected.sessao_id!, acao)}
                  >
                    {on ? `✓ ${label}` : label}
                  </Button>
                );
              })}
              {selected.status === "em_andamento" ? (
                <p className="text-xs text-muted">Treino em andamento.</p>
              ) : null}
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted">
              Sem treino neste dia.{" "}
              {!dataInicio ? (
                <Link href="/plano/ajustar" className="text-accent">
                  Definir início →
                </Link>
              ) : null}
            </p>
          )}
        </Card>
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
