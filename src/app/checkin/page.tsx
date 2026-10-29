"use client";

import { useEffect, useMemo, useState } from "react";
// date only on save (event handler) — ok for prerender
import { useRouter } from "next/navigation";
import { useApp } from "@/components/AppProvider";
import { Button, NumStepper } from "@/components/ui";
import { AGUA_MIN_ML } from "@/lib/engine/checkin-deload";
import {
  calcularDuracaoSono,
  feedbackSono,
  formatarDuracaoSono,
} from "@/lib/domain/sono";

const AGUA_CHIPS: { label: string; ml: number }[] = [
  { label: "1 L", ml: 1000 },
  { label: "1,5 L", ml: 1500 },
  { label: "2 L+", ml: 2000 },
];

const DEFAULT_INICIO = "23:00";
const DEFAULT_FIM = "07:00";

function defaultsFromHistory(
  checkins: { sono_inicio?: string; sono_fim?: string; data: string }[],
): { inicio: string; fim: string } {
  const comHora = [...checkins]
    .filter((c) => c.sono_inicio && c.sono_fim)
    .sort((a, b) => b.data.localeCompare(a.data));
  if (comHora[0]?.sono_inicio && comHora[0]?.sono_fim) {
    return { inicio: comHora[0].sono_inicio, fim: comHora[0].sono_fim };
  }
  return { inicio: DEFAULT_INICIO, fim: DEFAULT_FIM };
}

/** T2 — Check-in ≤4 toques / ~30s. Aciona R9 se prontidão≤2 ou sono<6. */
export default function CheckinPage() {
  const { saveCheckin, state } = useApp();
  const router = useRouter();
  const [sonoInicio, setSonoInicio] = useState(DEFAULT_INICIO);
  const [sonoFim, setSonoFim] = useState(DEFAULT_FIM);
  const [horariosHydrated, setHorariosHydrated] = useState(false);
  useEffect(() => {
    if (horariosHydrated) return;
    if (state.checkins.length === 0) return;
    const d = defaultsFromHistory(state.checkins);
    setSonoInicio(d.inicio);
    setSonoFim(d.fim);
    setHorariosHydrated(true);
  }, [state.checkins, horariosHydrated]);
  const [prontidao, setProntidao] = useState(4);
  const [peso, setPeso] = useState<number | null>(null);
  const [aguaMl, setAguaMl] = useState<number | null>(null);
  const [dorRegiao, setDorRegiao] = useState<string | null>(null);
  const [showPeso, setShowPeso] = useState(false);
  const [showDor, setShowDor] = useState(false);

  const sonoH = useMemo(
    () => calcularDuracaoSono(sonoInicio, sonoFim),
    [sonoInicio, sonoFim],
  );
  const sonoLabel = formatarDuracaoSono(sonoH);

  const historicoDuracoes = useMemo(
    () =>
      [...state.checkins]
        .sort((a, b) => b.data.localeCompare(a.data))
        .slice(0, 5)
        .map((c) => c.sono_h),
    [state.checkins],
  );
  const fb = useMemo(
    () => feedbackSono(sonoH, historicoDuracoes),
    [sonoH, historicoDuracoes],
  );

  function salvar() {
    saveCheckin({
      data: new Date().toISOString().slice(0, 10),
      sono_h: sonoH,
      sono_inicio: sonoInicio,
      sono_fim: sonoFim,
      prontidao,
      peso_kg: peso ?? undefined,
      agua_ml: aguaMl ?? undefined,
      dor: dorRegiao ? [{ regiao: dorRegiao }] : [],
    });
    router.push("/hoje");
  }

  const r9 = prontidao <= 2 || sonoH < 6;
  const aguaBaixa = aguaMl != null && aguaMl < AGUA_MIN_ML;

  const fbTone =
    fb.nivel === "baixo"
      ? "text-warn bg-warn/10"
      : fb.nivel === "ok"
        ? "text-go bg-go/10"
        : fb.nivel === "inconsistente"
          ? "text-warn bg-warn/10"
          : "text-muted bg-white/5";

  return (
    <main className="sheet-enter motion-fade-up flex min-h-dvh flex-col px-5 pb-8 pt-8">
      <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-accent">
        Check-in
      </p>
      <h1 className="mb-1 text-2xl font-bold">Como você está?</h1>
      <p className="mb-6 text-sm text-muted">~30 segundos. No máximo 4 toques.</p>

      <p className="mb-2 text-xs text-muted">Sono</p>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted">
            Foi dormir
          </span>
          <input
            type="time"
            value={sonoInicio}
            onChange={(e) => setSonoInicio(e.target.value || DEFAULT_INICIO)}
            className="h-12 rounded-xl border border-line bg-card px-3 font-mono text-base text-bone-50 outline-none focus:border-accent focus:shadow-[0_0_0_2px_rgba(184,255,60,.25)]"
            style={{ colorScheme: "dark" }}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted">
            Acordou
          </span>
          <input
            type="time"
            value={sonoFim}
            onChange={(e) => setSonoFim(e.target.value || DEFAULT_FIM)}
            className="h-12 rounded-xl border border-line bg-card px-3 font-mono text-base text-bone-50 outline-none focus:border-accent focus:shadow-[0_0_0_2px_rgba(184,255,60,.25)]"
            style={{ colorScheme: "dark" }}
          />
        </label>
      </div>
      <p className="mt-2 text-sm">
        Dormiu <strong className="text-accent">{sonoLabel}</strong>
        <span className="text-muted">
          {" "}
          ({sonoInicio}–{sonoFim})
        </span>
      </p>
      <p className={`mt-2 rounded-xl px-3 py-2 text-xs ${fbTone}`}>
        <strong>{fb.titulo}.</strong> {fb.dica}
      </p>

      <p className="mb-2 mt-6 text-xs text-muted">Prontidão (1–5)</p>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setProntidao(n)}
            className={`chip-motion flex h-12 flex-1 items-center justify-center rounded-xl text-lg font-bold ${
              prontidao === n
                ? "on bg-accent text-black"
                : "bg-card border border-line text-bone-50"
            }`}
          >
            {n}
          </button>
        ))}
      </div>

      {r9 && (
        <p className="mt-3 rounded-xl bg-warn/10 px-3 py-2 text-xs text-warn">
          R9: prontidão baixa ou sono &lt; 6h — a <strong>sessão do dia será
          ajustada</strong>: manter carga e −1 série nos compostos.
        </p>
      )}

      <p className="mb-2 mt-6 text-xs text-muted">Água hoje (opcional)</p>
      <div className="flex gap-2">
        {AGUA_CHIPS.map((c) => (
          <button
            key={c.ml}
            type="button"
            onClick={() => setAguaMl(aguaMl === c.ml ? null : c.ml)}
            className={`chip-motion flex-1 rounded-xl border py-2.5 text-sm font-semibold ${
              aguaMl === c.ml
                ? "on border-accent bg-[rgba(184,255,60,.12)] text-accent"
                : "border-line text-bone-50"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
      {aguaBaixa && (
        <p className="mt-2 text-xs text-muted">
          Hidratação &lt; {AGUA_MIN_ML / 1000} L — alerta N1 (não corta séries).
        </p>
      )}

      <div className="mt-6 flex gap-2">
        <button
          type="button"
          onClick={() => setShowPeso(!showPeso)}
          className="rounded-full border border-line px-3 py-1.5 text-xs text-muted"
        >
          {showPeso ? "Ocultar peso" : "+ Peso (opcional)"}
        </button>
        <button
          type="button"
          onClick={() => setShowDor(!showDor)}
          className="rounded-full border border-line px-3 py-1.5 text-xs text-muted"
        >
          {showDor ? "Ocultar dor" : "+ Dor (opcional)"}
        </button>
      </div>

      {showPeso && (
        <div className="mt-4">
          <NumStepper
            value={peso ?? 82}
            onChange={(n) => setPeso(n)}
            step={0.1}
            unit="kg"
            label="Peso"
            flash="load"
          />
        </div>
      )}

      {showDor && (
        <div className="mt-4 flex flex-wrap gap-2">
          {["ombro", "lombar", "joelho", "punho", "cotovelo"].map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setDorRegiao(dorRegiao === r ? null : r)}
              className={`chip-motion capitalize ${
                dorRegiao === r
                  ? "border-danger bg-danger/20 text-danger"
                  : "border-line text-bone-50"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      )}

      <div className="mt-auto pt-8">
        <Button onClick={salvar}>Salvar e ver o dia</Button>
        <button
          type="button"
          className="mt-3 w-full text-center text-sm text-muted"
          onClick={() => router.push("/hoje")}
        >
          Pular
        </button>
      </div>
    </main>
  );
}
