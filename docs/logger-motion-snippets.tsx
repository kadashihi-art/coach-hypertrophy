/**
 * Snippets de motion — Logger (T4)
 * Copiar/adaptar em src/app/treino/page.tsx + ui.tsx NumStepper
 *
 * CSS: globals.css → chip-motion, chip-rir, num-tick, load-flash,
 *      is-anchor, set-anchor-pulse, hit-flash
 * Spec: docs/motion-spec.md § Logger (T4) — crítico
 * Demo: /workspace/hypertrophy-prototype/logger-motion/index.html
 *
 * Preferência: CSS only. Framer só se AnimatePresence no set ativo.
 */

"use client";

import { useRef, useState } from "react";

/* ——— Tipo série chips ——— */
export function TipoChips({
  value,
  onChange,
  options = ["trabalho", "top_set", "back_off", "aquecimento"],
}: {
  value: string;
  onChange: (t: string) => void;
  options?: string[];
}) {
  return (
    <div className="mb-3 flex flex-wrap gap-2">
      {options.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          className={`chip-motion text-xs ${value === t ? "on" : ""}`}
        >
          {t.replace("_", " ")}
        </button>
      ))}
    </div>
  );
}

/* ——— RIR chips ——— */
export function RirChips({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex justify-center gap-2">
      {[0, 1, 2, 3, 4].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`chip-rir flex h-11 w-11 items-center justify-center ${
            value === n ? "on" : ""
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

/* ——— Âncora pulse helper ——— */
export function useAnchorPulse(tipo: string) {
  const [anchorPulse, setAnchorPulse] = useState(false);
  const timer = useRef<number | null>(null);

  function pulse() {
    if (tipo !== "trabalho" && tipo !== "top_set") return;
    setAnchorPulse(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setAnchorPulse(false), 300);
  }

  return { anchorPulse, pulse };
}

/* ——— Hit no alvo (≤300ms) ——— */
export function useHitFlash() {
  const [hitFlash, setHitFlash] = useState(false);
  const timer = useRef<number | null>(null);

  function flashIfHit(opts: {
    reps: number;
    rir: number;
    faixa: [number, number];
    rirAlvo: number;
    tipo: string;
  }) {
    const inReps = opts.reps >= opts.faixa[0] && opts.reps <= opts.faixa[1];
    const inRir = opts.rir <= opts.rirAlvo;
    if (!inReps || !inRir || opts.tipo === "aquecimento") return;
    setHitFlash(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setHitFlash(false), 300);
  }

  return { hitFlash, flashIfHit };
}

/* ——— Wiring NumStepper (já em ui.tsx) ———
 *
 * <div className={tipo === "trabalho" || tipo === "top_set" ? "is-anchor" : ""}>
 *   <NumStepper value={carga} onChange={handleCarga} step={2.5} unit="kg" flash="load" />
 * </div>
 * <NumStepper value={reps} onChange={setReps} step={1} flash="num" />
 *
 * handleCarga = (n) => { setCarga(n); pulse(); }
 *
 * Row aquecimento:
 *   className={`set-card ... ${anchorPulse ? "set-anchor-pulse" : ""}`}
 *
 * Card done hit:
 *   className={`... ${hitFlash && isLast ? "hit-flash" : ""}`}
 */
