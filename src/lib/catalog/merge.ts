import type { Exercicio } from "@/lib/domain";
import { CATALOG_EXERCICIOS } from "./exercicios";

/**
 * Hidratação do catálogo para estados já gravados.
 *
 * O catálogo é a fonte da verdade para exercícios conhecidos: atualiza os
 * metadados de quem já existe (nome, padrão, equipamento, grupos) e adiciona
 * os novos ao final. Exercícios que não estão mais no catálogo são preservados
 * para não quebrar planos/históricos antigos.
 */
export function mergeCatalogoExercicios(
  existentes: Exercicio[] | null | undefined,
): Exercicio[] {
  const atuais = existentes ?? [];
  const canonicoPorId = new Map(CATALOG_EXERCICIOS.map((e) => [e.id, e]));
  const vistos = new Set<string>();
  const merged: Exercicio[] = [];

  for (const ex of atuais) {
    merged.push(canonicoPorId.get(ex.id) ?? ex);
    vistos.add(ex.id);
  }
  for (const ex of CATALOG_EXERCICIOS) {
    if (!vistos.has(ex.id)) merged.push(ex);
  }
  return merged;
}
