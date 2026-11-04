"use client";

import { Fragment, useState, type ReactNode } from "react";
import type { Exercicio } from "@/lib/domain";
import { agruparPorGrupo, ordenarAZ, ORDEM_PADRAO, ROTULO_ORDEM, type ModoOrdem } from "@/lib/catalog/ordenar";

/**
 * Lista de exercícios com seletor "Por grupo" (padrão, com cabeçalho por grupo muscular) ou "A–Z".
 * Não filtra nada: recebe a lista já filtrada (equipamento, restrições, usados) e só reordena.
 */
export function ListaExerciciosOrdenada<T>({
  itens,
  exercicio,
  render,
  chave,
  className = "space-y-2",
}: {
  itens: T[];
  exercicio: (t: T) => Pick<Exercicio, "nome" | "grupo_primario">;
  render: (t: T) => ReactNode;
  chave: (t: T) => string;
  className?: string;
}) {
  const [modo, setModo] = useState<ModoOrdem>(ORDEM_PADRAO);
  if (itens.length === 0) return null;
  const grupos = agruparPorGrupo(itens, exercicio);
  return (
    <div data-testid="lista-exercicios" data-ordem={modo}>
      <div className="mb-3 flex items-center gap-2" role="radiogroup" aria-label="Ordenar lista">
        <span className="text-xs text-muted">Ordenar:</span>
        {(["grupo", "az"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={modo === m}
            data-testid={`ordem-${m}`}
            onClick={() => setModo(m)}
            className={`chip-motion text-xs ${modo === m ? "on" : ""}`}
          >
            {ROTULO_ORDEM[m]}
          </button>
        ))}
      </div>
      {modo === "az" ? (
        <div className={className}>
          {ordenarAZ(itens, exercicio).map((t) => <Fragment key={chave(t)}>{render(t)}</Fragment>)}
        </div>
      ) : (
        <div className="space-y-4">
          {grupos.map((g) => (
            <section key={g.grupo} aria-label={g.titulo}>
              <h3 data-testid="grupo-cabecalho" className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                {g.titulo}
              </h3>
              <div className={className}>
                {g.itens.map((t) => <Fragment key={chave(t)}>{render(t)}</Fragment>)}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
