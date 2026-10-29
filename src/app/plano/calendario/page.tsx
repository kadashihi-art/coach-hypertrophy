"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useApp } from "@/components/AppProvider";
import { PlanoTabs } from "@/components/PlanoTabs";
import { Badge, Button, Card, SectionTitle } from "@/components/ui";
import {
  derivarCalendario,
  type CalendarioDiaView,
} from "@/lib/plan/calendario";
import { hojeIsoSaoPaulo, proximaSessao } from "@/lib/plan/proxima-sessao";

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
  const [selected, setSelected] = useState<CalendarioDiaView | null>(null);
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
    <main className="motion-fade-up px-5 pb-10 pt-8">
      <PlanoTabs />
      <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-accent">
        Calendário
      </p>
      <h1 className="mb-2 text-2xl font-bold capitalize">{titulo}</h1>
      <p className="mb-3 text-sm text-muted">
        {dataInicio
          ? `Início do meso: ${dataInicio}`
          : "Defina a data de início em Meu treino."}{" "}
        {next ? `· Próximo: ${next.nome}` : ""}
      </p>

      <div className="mb-3 flex gap-2">
        <Button variant="ghost" className="min-h-10 flex-1 text-sm" onClick={prevMonth}>
          ←
        </Button>
        <Button variant="ghost" className="min-h-10 flex-1 text-sm" onClick={nextMonth}>
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
              onClick={() => setSelected(d)}
              className={`aspect-square rounded-xl text-xs font-bold transition ${statusColor(d.status)} ${
                selected?.data === d.data ? "ring-2 ring-accent" : ""
              }`}
              title={d.nome ?? d.status}
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
        <Card className="mb-4">
          <p className="font-semibold">
            {selected.data}
            {selected.nome ? ` · ${selected.nome}` : ""}
          </p>
          <p className="mt-1 text-xs text-muted capitalize">
            Status: {selected.status}
          </p>
          {selected.sessao_id ? (
            <div className="mt-3 flex flex-col gap-2">
              <Button
                variant="ghost"
                className="min-h-11 text-sm"
                onClick={() => {
                  markCalendario(selected.sessao_id!, "planejar");
                  setSelected({ ...selected, status: "planejado" });
                }}
              >
                Marcar planejado
              </Button>
              <Button
                variant="primary"
                className="min-h-11 text-sm"
                onClick={() => {
                  markCalendario(selected.sessao_id!, "feito");
                  setSelected({ ...selected, status: "feito" });
                }}
              >
                Marcar feito
              </Button>
              <Button
                variant="warn"
                className="min-h-11 text-sm"
                onClick={() => {
                  markCalendario(selected.sessao_id!, "pular");
                  setSelected({ ...selected, status: "pulado" });
                }}
              >
                Pular (proximaSessao ignora)
              </Button>
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted">
              Sem sessão neste dia.{" "}
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
              const iso = new Date().toISOString().slice(0, 10);
              setDataInicio(iso);
            }}
          >
            Começar hoje
          </Button>
        </Card>
      ) : null}

    </main>
  );
}
