"use client";
/**
 * VolumeBar — barra "gamer" reutilizável (só apresentação; dados não mudam).
 * Fill por scaleX (transform-origin left) com overshoot leve, stagger por índice,
 * sweep neon único, contador antes→depois, chip +N/−N, faixa ideal marcada.
 * prefers-reduced-motion: estado final direto, sem vibrate.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";

export const STAGGER_MS = 70;

function prefereSemMovimento(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** Vibração curta (Android), no máximo uma vez por chave (ex.: id da abertura do Ver ajuste). */
const jaVibrou = new Set<string>();
export function hapticUmaVez(chave: string, ms = 18): void {
  if (jaVibrou.has(chave) || prefereSemMovimento()) return;
  jaVibrou.add(chave);
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(ms);
  } catch {
    /* sem suporte */
  }
}

function useContagem(de: number, ate: number, atrasoMs: number, duracaoMs = 650): number {
  const [v, setV] = useState(prefereSemMovimento() ? ate : de);
  useEffect(() => {
    if (prefereSemMovimento() || de === ate) {
      const id = requestAnimationFrame(() => setV(ate));
      return () => cancelAnimationFrame(id);
    }
    let raf = 0;
    const t0 = performance.now() + atrasoMs;
    const step = (now: number) => {
      const p = Math.min(1, Math.max(0, (now - t0) / duracaoMs));
      const e = 1 - Math.pow(1 - p, 3);
      setV(Math.round(de + (ate - de) * e));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [de, ate, atrasoMs, duracaoMs]);
  return v;
}

export type VolumeBarProps = {
  /** valor final (depois) */
  valor: number;
  /** valor anterior; se ausente, conta de 0 e não mostra delta */
  antes?: number;
  /** escala da trilha */
  max: number;
  /** faixa ideal marcada na trilha (ex.: [10, 20]); null = sem faixa */
  faixa?: readonly [number, number] | null;
  label?: string;
  /** posição na lista, pro stagger */
  index?: number;
  /** unidade pro aria-label */
  unidade?: string;
  /** mostra cabeçalho (label + números) */
  cabecalho?: boolean;
  /** tom fixo; padrão = accent, verde se ganho, âmbar se perda */
  tom?: "accent" | "go" | "warn";
  /** altura da trilha */
  fina?: boolean;
  className?: string;
};

export function VolumeBar({
  valor, antes, max, faixa = [10, 20], label, index = 0, unidade = "séries/semana", cabecalho = true, tom, fina, className = "",
}: VolumeBarProps) {
  const temAntes = typeof antes === "number";
  const delta = temAntes ? valor - (antes as number) : 0;
  const estado: "ganho" | "perda" | "igual" = !temAntes || delta === 0 ? "igual" : delta > 0 ? "ganho" : "perda";
  const atraso = index * STAGGER_MS;
  const n = useContagem(temAntes ? (antes as number) : 0, valor, atraso + 120);
  const escala = max > 0 ? Math.min(1, Math.max(0, valor / max)) : 0;
  const escalaAntes = temAntes && max > 0 ? Math.min(1, Math.max(0, (antes as number) / max)) : 0;
  const naFaixa = !!faixa && valor >= faixa[0] && valor <= faixa[1];
  const corTom = tom ?? (estado === "ganho" ? "go" : estado === "perda" ? "warn" : "accent");
  const ref = useRef<HTMLDivElement>(null);
  const aria = [
    label,
    temAntes ? `antes ${antes}, depois ${valor} ${unidade}` : `${valor} ${unidade}`,
    estado === "ganho" ? `mais ${delta}` : estado === "perda" ? `menos ${Math.abs(delta)}` : null,
    faixa ? (naFaixa ? `dentro da faixa ideal ${faixa[0]}–${faixa[1]}` : `faixa ideal ${faixa[0]}–${faixa[1]}`) : null,
  ].filter(Boolean).join(", ");
  const vars = { "--vb-s": escala, "--vb-a": escalaAntes, "--vb-d": `${atraso}ms` } as CSSProperties;

  return (
    <div ref={ref} role="img" aria-label={aria} className={`vb vb-${estado} ${naFaixa ? "vb-in" : ""} ${className}`} style={vars}>
      {cabecalho ? (
        <div className="flex items-center justify-between gap-2 text-xs" aria-hidden>
          <span className="capitalize text-muted">{label}</span>
          <span className="flex items-center gap-1.5">
            {estado !== "igual" ? (
              <span className={`vb-chip ${estado === "ganho" ? "vb-chip-go" : "vb-chip-warn"}`}>
                {estado === "ganho" ? `+${delta}` : `−${Math.abs(delta)}`}
              </span>
            ) : null}
            <span className="num">
              {temAntes ? <span className="text-muted">{antes} → </span> : null}
              <span className={estado === "perda" ? "text-warn" : estado === "ganho" ? "text-go" : "text-accent"}>{n}</span>
            </span>
          </span>
        </div>
      ) : null}
      <div className={`vb-track ${fina ? "h-1.5" : "h-2"} mt-1`} aria-hidden>
        {faixa && max > 0 ? (
          <span
            className="vb-band"
            style={{ left: `${(Math.min(faixa[0], max) / max) * 100}%`, width: `${((Math.min(faixa[1], max) - Math.min(faixa[0], max)) / max) * 100}%` }}
          />
        ) : null}
        {temAntes ? <span className="vb-ghost" /> : null}
        <span className={`vb-fill vb-${corTom}`} />
        <span className="vb-sweep" />
      </div>
    </div>
  );
}
