"use client";

import type { Diagnostico, PrevisaoForca } from "@/lib/inteligencia/diagnostico";

/** Linha de previsão + "por que travou?" (expansível) no cartão de força do Progresso. */
export function DiagnosticoExercicio({ diag, prev }: { diag: Diagnostico | null; prev: PrevisaoForca | null }) {
  if (!diag && !prev) return null;
  return (
    <div className="mt-2 space-y-1">
      {prev ? <p className="text-xs text-accent">{prev.texto}</p> : null}
      {diag ? (
        <details className="text-xs">
          <summary className="cursor-pointer font-semibold text-warn">
            Parado há {diag.sessoes_sem_progresso} treinos. Por quê?
          </summary>
          <ul className="mt-2 space-y-2">
            {diag.causas.map((c) => (
              <li key={c.id}>
                <p className="font-semibold text-bone-50">{c.titulo}</p>
                <p className="text-muted">{c.evidencia}</p>
                <p className="text-bone-50/90">{c.acao}</p>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
