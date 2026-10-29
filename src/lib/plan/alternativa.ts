import type { EstadoExercicio, Exercicio, Padrao, Prescricao } from "@/lib/domain";

/** F4: primeira alternativa do mesmo padrão (prioriza equipamentos disponíveis). */
export function findAlt(
  catalog: Exercicio[],
  padrao: Padrao,
  equips: Set<string> | null,
  excludeId: string,
): string | null {
  const ok = (e: Exercicio) => e.padrao === padrao && e.id !== excludeId;
  const alt =
    (equips && catalog.find((e) => ok(e) && equips.has(e.equipamento))) ||
    (equips ? undefined : catalog.find(ok));
  return alt?.id ?? null;
}

/** Resolve alternativa da prescrição; fallback runtime por padrão quando nula. */
export function resolverAlternativa(
  presc: Pick<Prescricao, "exercicio_id" | "alternativa_equipamento_ocupado">,
  catalog: Exercicio[],
  equips: Set<string> | null = null,
): Exercicio | null {
  if (presc.alternativa_equipamento_ocupado) {
    const e = catalog.find((x) => x.id === presc.alternativa_equipamento_ocupado);
    if (e) return e;
  }
  const prim = catalog.find((x) => x.id === presc.exercicio_id);
  if (!prim) return null;
  const id =
    (equips && findAlt(catalog, prim.padrao, equips, prim.id)) ||
    findAlt(catalog, prim.padrao, null, prim.id);
  return id ? (catalog.find((x) => x.id === id) ?? null) : null;
}

/** Carga sugerida do EstadoExercicio (alvo > atual), senão fallback. */
export function cargaDoEstado(
  estados: EstadoExercicio[],
  exercicioId: string,
  fallback: number,
): number {
  const est = estados.find((e) => e.exercicio_id === exercicioId);
  return est?.alvo_proxima_sessao?.carga_kg ?? est?.carga_atual_kg ?? fallback;
}
