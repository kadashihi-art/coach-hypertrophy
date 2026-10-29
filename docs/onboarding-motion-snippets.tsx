/**
 * Snippets de motion — Onboarding (rico)
 * Copiar/adaptar em src/app/onboarding/page.tsx
 *
 * CSS: globals.css → chip-motion, bar-track/bar-fill, vol-chart, obj-card
 * Spec: docs/motion-spec.md § Onboarding (rico)
 * Demo: /workspace/hypertrophy-prototype/onboarding-motion/index.html
 *
 * Preferência: CSS only. Framer Motion NÃO é necessário aqui.
 * A heurística de volume é PRESENTACIONAL — Dev/motor dono da matemática real.
 */

"use client";

import type { ReactNode } from "react";

/* ——— Chip com spring ——— */
type ChipProps = {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
};

export function Chip({ selected, onClick, children, className = "" }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`chip-motion ${selected ? "on" : ""} ${className}`.trim()}
    >
      {children}
    </button>
  );
}

/* ——— TimeBar (TEMPO) ——— */
type TimeBarProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (n: number) => void;
};

export function TimeBar({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  onChange,
}: TimeBarProps) {
  const pct = Math.round(((value - min) / (max - min)) * 100);
  return (
    <div className="mb-5">
      <label className="mb-2 block text-xs text-muted">
        {label}:{" "}
        <span className="load-num font-semibold text-bone-50">{value}</span>
        {unit ? ` ${unit}` : ""}
      </label>
      <div className="bar-track mb-2">
        {/* key força .enter no mount do step; width transition cobre mudanças */}
        <span
          key={`${label}-enter`}
          className="bar-fill enter"
          style={{ width: `${pct}%` }}
        />
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#B8FF3C]"
        aria-label={label}
      />
    </div>
  );
}

/* ——— Volume / semana preview ——— */
const GROUPS = ["peito", "costas", "ombro", "bíceps", "tríceps", "pernas"] as const;

const OBJ_MULT: Record<string, number> = {
  hipertrofia: 1,
  forca: 0.75,
  recomposicao: 0.9,
  saude: 0.7,
};

const OBJ_SHARE: Record<string, number[]> = {
  hipertrofia: [1.05, 1.1, 0.95, 0.85, 0.9, 1.15],
  forca: [1.15, 1.1, 0.85, 0.7, 0.75, 1.2],
  recomposicao: [1, 1.05, 0.95, 0.9, 0.9, 1.1],
  saude: [0.95, 1, 1, 0.85, 0.85, 1.15],
};

/** Heurística fake/plausível. Dev substitui pelo motor (faixa efetiva 10–20). */
export function estimateWeeklyVolume(
  dias: number,
  mins: number,
  objetivo: string,
): { grupo: string; sets: number }[] {
  const base = (dias * mins) / 20;
  const mult = OBJ_MULT[objetivo] ?? 1;
  const shares = OBJ_SHARE[objetivo] ?? OBJ_SHARE.hipertrofia;
  return GROUPS.map((g, i) => ({
    grupo: g,
    sets: Math.round(Math.min(22, Math.max(4, base * mult * (shares[i] ?? 1)))),
  }));
}

type VolumeWeekPreviewProps = {
  dias: number;
  mins: number;
  objetivo: string;
  /** escala visual do eixo (default 24 → banda 10–20 fica ~42–83%) */
  scaleMax?: number;
  className?: string;
};

export function VolumeWeekPreview({
  dias,
  mins,
  objetivo,
  scaleMax = 24,
  className = "",
}: VolumeWeekPreviewProps) {
  const rows = estimateWeeklyVolume(dias, mins, objetivo);
  return (
    <div className={`vol-chart ${className}`.trim()}>
      <div className="vol-head">
        <span className="vol-title">Volume / semana</span>
        <span className="vol-hint">faixa 10–20</span>
      </div>
      {rows.map((r) => {
        const w = Math.min(100, Math.round((r.sets / scaleMax) * 100));
        return (
          <div key={r.grupo} className="vol-row">
            <span className="vol-label">{r.grupo}</span>
            <div className="vol-track">
              <span className="vol-band" aria-hidden />
              <span
                className="bar-fill enter"
                style={{ width: `${w}%` }}
                // key opcional se quiser re-enter ao mudar objetivo:
                // key={`${r.grupo}-${objetivo}-${r.sets}`}
              />
            </div>
            <span className="vol-num">{r.sets}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ——— Exemplo de wiring (não importar — colar no page.tsx) ———
 *
 * // PERFIL — chips
 * <div className="flex flex-wrap gap-2">
 *   {(["iniciante","intermediario","avancado"] as Experiencia[]).map((e) => (
 *     <Chip key={e} selected={exp === e} onClick={() => setExp(e)}>
 *       {e === "intermediario" ? "Intermediário" : e === "avancado" ? "Avançado" : "Iniciante"}
 *     </Chip>
 *   ))}
 * </div>
 *
 * // TEMPO
 * <TimeBar label="Dias / semana" value={dias} min={2} max={6} onChange={setDias} />
 * <TimeBar label="Minutos / sessão" value={mins} min={30} max={90} step={5} unit="min" onChange={setMins} />
 * <TimeBar label="Cardio min / semana" value={cardio} min={0} max={180} step={15} unit="min" onChange={setCardio} />
 * <VolumeWeekPreview dias={dias} mins={mins} objetivo={objetivo} />
 *
 * // CONTEXTO — mesmo Chip
 * <Chip selected={equips.includes(e)} onClick={() => toggleEquip(e)}>{e.replace("_"," ")}</Chip>
 *
 * // OBJETIVO
 * <Card className={`obj-card cursor-pointer ${objetivo === id ? "on" : ""}`}>...</Card>
 *
 * // CTA
 * <Button className="motion-press motion-cta-glow" onClick={next}>...</Button>
 *
 * // Painel (já parcialmente):
 * <div key={step} className="motion-swap flex flex-1 flex-col">
 *   <div className="motion-stagger flex flex-1 flex-col">...</div>
 * </div>
 */
