"use client";

import { useEffect, useRef, useState, type ButtonHTMLAttributes, type KeyboardEvent, type PropsWithChildren, type ReactNode } from "react";
import type { Evidencia, NivelAlerta } from "@/lib/domain";

export function Card({
  children,
  className = "",
}: PropsWithChildren<{ className?: string }>) {
  return (
    <div
      className={`card-motion rounded-[var(--radius-card)] bg-card p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.04)] ${className}`}
    >
      {children}
    </div>
  );
}

export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "go" | "ghost" | "danger" | "warn";
}) {
  const base =
    "motion-press inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] px-4 text-base font-semibold disabled:opacity-50";
  const variants: Record<string, string> = {
    primary: "motion-cta-glow bg-accent text-ink-950",
    go: "bg-go text-ink-950",
    ghost: "bg-white/5 text-bone-50",
    danger: "bg-danger/20 text-danger",
    warn: "bg-warn/20 text-warn",
  };
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function Badge({
  children,
  tone = "accent",
}: PropsWithChildren<{
  tone?: "accent" | "go" | "muted" | "danger" | "warn";
}>) {
  const tones = {
    accent: "bg-accent/15 text-accent",
    go: "bg-go/15 text-go",
    muted: "bg-white/8 text-muted",
    danger: "bg-danger/15 text-danger",
    warn: "bg-warn/15 text-warn",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/** Badge de evidência (P6) — forte/moderado/contextual/prática */
export function EvidenciaBadge({ evidencia }: { evidencia: Evidencia }) {
  const label: Record<Evidencia, string> = {
    forte: "evidência forte",
    moderado: "evidência moderada",
    contextual: "contextual",
    pratica: "prática",
  };
  return <span className={`ev ev-${evidencia}`}>{label[evidencia]}</span>;
}

/** Alertas N0 / N1 / N2 — vermelho só em N2 */
export function AlertaBanner({
  nivel,
  motivo,
  recomendacao,
}: {
  nivel: NivelAlerta;
  motivo: string;
  recomendacao: string;
}) {
  if (nivel === "N0") {
    return (
      <div className="card alert-n0 px-3 py-2 text-xs text-muted">
        <span className="mr-2 inline-block h-2 w-2 rounded-full bg-go" />
        N0 · {motivo}
      </div>
    );
  }
  if (nivel === "N1") {
    return (
      <div className="card alert-n1 px-3 py-3 text-sm">
        <div className="font-semibold">N1 · Atenção</div>
        <p className="mt-1 text-bone-50/90">{motivo}</p>
        <p className="mt-1 text-xs text-muted">{recomendacao}</p>
      </div>
    );
  }
  return (
    <div className="card alert-n2 px-3 py-3 text-sm">
      <div className="font-semibold">N2 · Plano bloqueado</div>
      <p className="mt-1 text-bone-50/90">{motivo}</p>
      <p className="mt-1 text-xs text-muted">{recomendacao}</p>
    </div>
  );
}

export function ProgressBar({
  value,
  max = 100,
  tone = "go",
  minMarker,
  maxMarker,
}: {
  value: number;
  max?: number;
  tone?: "accent" | "go" | "danger" | "warn";
  minMarker?: number;
  maxMarker?: number;
}) {
  const pct = Math.min(100, Math.round((value / Math.max(max, 1)) * 100));
  const colors = {
    accent: "bg-accent",
    go: "bg-go",
    danger: "bg-danger",
    warn: "bg-warn",
  };
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-ink-700">
      <div
        className={`h-full rounded-full ${colors[tone]} transition-all`}
        style={{ width: `${pct}%` }}
      />
      {minMarker != null && (
        <div
          className="absolute top-0 h-full w-0.5 bg-white/40"
          style={{ left: `${(minMarker / max) * 100}%` }}
        />
      )}
      {maxMarker != null && (
        <div
          className="absolute top-0 h-full w-0.5 bg-white/40"
          style={{ left: `${(maxMarker / max) * 100}%` }}
        />
      )}
    </div>
  );
}

export function SectionTitle({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
        {title}
      </h2>
      {action}
    </div>
  );
}

export function Stat({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | number;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted">{label}</span>
      <span className={`text-xl font-bold ${mono ? "load-num" : ""}`}>
        {value}
      </span>
    </div>
  );
}

/** Stepper ± para carga/reps — números ≥40px, editáveis no toque.
 * Motion: key={value} remonta o span e dispara num-tick / load-flash (CSS).
 * flash="load" → glow lime (carga); default → num-tick leve (reps).
 * API: value/onChange/step/unit/label; flash, min, hint opcionais.
 */
export function NumStepper({
  value,
  onChange,
  step,
  unit,
  label,
  flash,
  min = 0,
  hint,
  className = "",
}: {
  value: number;
  onChange: (n: number) => void;
  step: number;
  unit?: string;
  label?: string;
  /** "load" = load-flash (kg); "num" | omit = num-tick */
  flash?: "load" | "num";
  /** mínimo ao confirmar (kg ≥ 0, reps ≥ 1) */
  min?: number;
  /** linha auxiliar sob o valor (ex.: sugestão de reps) */
  hint?: string;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function clamp(n: number) {
    const rounded = Math.round(n * 10) / 10;
    return Math.max(min, rounded);
  }

  function commitDraft() {
    const raw = draft.replace(",", ".").trim();
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      onChange(clamp(parsed));
    }
    setEditing(false);
  }

  function startEdit() {
    setDraft(
      Number.isInteger(value) ? String(value) : value.toFixed(1),
    );
    setEditing(true);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitDraft();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setEditing(false);
    }
  }

  const tick =
    flash === "load"
      ? "big-num load-flash"
      : "big-num num-tick";
  return (
    <div className={`flex flex-col items-center gap-1 ${className}`.trim()}>
      {label && (
        <span className="mb-1 text-[10px] uppercase tracking-wide text-muted">
          {label}
        </span>
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="diminuir"
          className="btn motion-press flex h-14 w-14 items-center justify-center rounded-[14px] border border-border bg-transparent text-2xl font-semibold text-bone-50"
          onClick={() => onChange(clamp(value - step))}
        >
          −
        </button>
        <div className="min-w-[120px] flex-1 text-center">
          {editing ? (
            <input
              ref={inputRef}
              type="text"
              inputMode="decimal"
              aria-label={label ?? "valor"}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitDraft}
              onKeyDown={onKeyDown}
              className="big-num w-full max-w-[140px] border-0 bg-transparent text-center outline-none ring-1 ring-accent/50 rounded-lg px-1"
            />
          ) : (
            <button
              type="button"
              onClick={startEdit}
              className="w-full rounded-lg px-1 text-center active:bg-white/5"
              aria-label={`Editar ${label ?? "valor"}`}
            >
              <span key={value} className={tick}>
                {Number.isInteger(value) ? value : value.toFixed(1)}
              </span>
              {unit && <span className="ml-1 text-sm text-muted">{unit}</span>}
            </button>
          )}
        </div>
        <button
          type="button"
          aria-label="aumentar"
          className="btn motion-press flex h-14 w-14 items-center justify-center rounded-[14px] border border-border bg-transparent text-2xl font-semibold text-bone-50"
          onClick={() => onChange(clamp(value + step))}
        >
          +
        </button>
      </div>
      {hint ? (
        <span className="mt-1 text-[10px] font-medium text-accent/80">
          {hint}
        </span>
      ) : null}
    </div>
  );
}
