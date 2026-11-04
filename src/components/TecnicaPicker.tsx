"use client";

import { useState } from "react";
import type { TecnicaFinal } from "@/lib/domain";
import { useApp } from "@/components/AppProvider";
import { liberacaoTecnicas } from "@/lib/engine/proximidade-falha";
import { useClientValue } from "@/lib/use-client-value";
import { LIMITE_TECNICAS_SESSAO, TECNICAS, infoTecnica, nomeTecnica } from "@/lib/engine/tecnicas";

/**
 * Técnica opcional na última série. Só aparece em isoladores/máquinas.
 * Nada grava aqui: a escolha entra no rascunho e só vale depois de "Confirmar".
 */
export function TecnicaPicker({
  exNome,
  valor,
  onChange,
  usadas,
  temProximo,
  bloqueio,
}: {
  exNome: string;
  valor: TecnicaFinal | null | undefined;
  onChange: (t: TecnicaFinal | null) => void;
  /** Técnicas já usadas no treino (contando esta). */
  usadas: number;
  /** Existe exercício depois (pra bi-set). */
  temProximo: boolean;
  /** Motivo pra não deixar mudar (ex.: última série já feita). */
  bloqueio?: string | null;
}) {
  const [aberto, setAberto] = useState(false);
  const { state } = useApp();
  const hojeIso = useClientValue(() => new Date().toISOString().slice(0, 10), "2026-01-01");
  // Técnica só é sugerida quando você já chega perto da falha de forma confiável e está recuperado.
  const lib = liberacaoTecnicas({
    registros: state.registros,
    hojeIso,
    checkin: state.checkins.find((c) => c.data === hojeIso) ?? null,
    deload: state.plano?.mesociclo.foco === "deload",
  });
  const atual = valor ?? null;
  const cheio = !atual && usadas >= LIMITE_TECNICAS_SESSAO;
  return (
    <div className="mt-2 rounded-xl border border-border/70 bg-ink-950/60 p-2" data-testid="tecnica-picker">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-label={`Técnica na última série de ${exNome}`}
        className="flex min-h-9 w-full items-center justify-between gap-2 text-left text-[11px]"
      >
        <span className="text-muted">Técnica na última série <span className="text-faint">(opcional)</span></span>
        <span className={`font-semibold ${atual ? "text-accent" : "text-bone-50/80"}`}>{nomeTecnica(atual)} {aberto ? "▴" : "▾"}</span>
      </button>
      {aberto ? (
        <div className="mt-2">
          {bloqueio ? <p className="mb-2 text-[11px] text-muted">{bloqueio}</p> : null}
          {!bloqueio ? (
            <p data-testid="tecnica-liberacao" className={`mb-2 text-[11px] leading-snug ${lib.liberado ? "text-go" : "text-warn"}`}>
              {lib.liberado ? lib.texto : `Ainda não recomendo. ${lib.texto}`}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-1.5">
            <button type="button" disabled={!!bloqueio} onClick={() => onChange(null)} className={`chip-motion text-[11px] ${!atual ? "on" : ""}`}>
              Nenhuma
            </button>
            {TECNICAS.map((t) => {
              const desab = !!bloqueio || (cheio && atual !== t.tipo) || (t.tipo === "bi_set" && !temProximo);
              return (
                <button
                  key={t.tipo}
                  type="button"
                  disabled={desab}
                  onClick={() => onChange(t.tipo)}
                  className={`chip-motion text-[11px] disabled:opacity-30 ${atual === t.tipo ? "on" : ""}`}
                >
                  {t.nome}
                </button>
              );
            })}
          </div>
          {cheio ? <p className="mt-2 text-[11px] text-muted">Já tem {LIMITE_TECNICAS_SESSAO} técnicas nesse treino, que é o limite pra não pesar na recuperação.</p> : null}
          {atual ? <ExplicacaoTecnica tipo={atual} /> : <p className="mt-2 text-[11px] leading-snug text-muted">Opcional. Serve pra dar um estímulo extra no fim, sem somar séries. As cargas continuam vindo do Coach.</p>}
        </div>
      ) : null}
    </div>
  );
}

export function ExplicacaoTecnica({ tipo }: { tipo: TecnicaFinal }) {
  const t = infoTecnica(tipo);
  return (
    <div className="mt-2 text-[11px] leading-snug text-bone-50/90" data-testid="tecnica-explicacao">
      <p className="mb-1"><span className="font-semibold text-accent">Quando usar · </span>{t.quando}</p>
      <p className="mb-0.5 font-semibold text-accent">Como fazer</p>
      <ol className="list-decimal pl-4 text-muted">
        {t.como.map((c) => <li key={c}>{c}</li>)}
      </ol>
    </div>
  );
}

/** Card no logger: aparece só na última série de um exercício com técnica ligada. */
export function TecnicaNaSerie({
  plano,
  feita,
  onFeita,
  reps,
  onReps,
  Passo,
}: {
  plano: import("@/lib/engine/tecnicas").PlanoTecnica;
  feita: boolean;
  onFeita: (v: boolean) => void;
  reps: number[];
  onReps: (r: number[]) => void;
  Passo: (p: { label: string; valor: number; onMenos: () => void; onMais: () => void; min: number; max: number }) => React.ReactNode;
}) {
  const [ver, setVer] = useState(false);
  return (
    <div data-testid="tecnica-serie" className="mt-4 rounded-2xl border border-accent/50 bg-accent/10 p-3 text-left">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-accent">Última série · {plano.nome}</p>
        <button type="button" onClick={() => setVer((v) => !v)} className="text-[11px] text-muted underline">
          {ver ? "Fechar" : "Como fazer"}
        </button>
      </div>
      <p className="mt-1 text-[12px] leading-snug text-bone-50">{plano.texto}</p>
      {ver ? <ExplicacaoTecnica tipo={plano.tipo} /> : null}
      {plano.campos.length > 0 ? (
        <>
          <label className="mt-2 flex min-h-9 items-center gap-2 text-[12px] text-bone-50">
            <input type="checkbox" checked={feita} onChange={(e) => onFeita(e.target.checked)} className="h-4 w-4 accent-current" />
            Fiz a técnica
          </label>
          {feita ? (
            <div className="mt-1 space-y-1.5">
              {plano.campos.map((c, i) => (
                <div key={c.rotulo} className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted">{c.rotulo}</span>
                  {Passo({
                    label: c.rotulo,
                    valor: reps[i] ?? 0,
                    min: 0,
                    max: 30,
                    onMenos: () => onReps(reps.map((x, j) => (j === i ? Math.max(0, x - 1) : x))),
                    onMais: () => onReps(reps.map((x, j) => (j === i ? Math.min(30, x + 1) : x))),
                  })}
                </div>
              ))}
              <p className="text-[10px] text-faint">Essas reps extras não mudam seu recorde nem a carga da próxima vez.</p>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
