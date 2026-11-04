"use client";

import type { AppState, Exercicio } from "@/lib/domain";
import { infoVariacao } from "@/lib/catalog/variacoes";

/** Linha curta abaixo do nome: "Variação de leg press · última vez aqui: 110 kg". */
export function VariacaoInfo({ ex, state }: { ex: Exercicio; state: AppState }) {
  const t = infoVariacao(ex, state.exercicios, state.registros ?? []);
  if (!t) return null;
  return <span data-testid="variacao-info" className="block text-[11px] text-accent">{t}</span>;
}
