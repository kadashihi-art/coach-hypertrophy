import type {
  AppState,
  EstadoExercicio,
  Exercicio,
  GrupoMuscular,
  Padrao,
  Prescricao,
} from "@/lib/domain";
import {
  cargaSugeridaParaExercicio,
  type CargaSugerida,
} from "@/lib/engine/memoria-carga";
import {
  exerciseAllowed,
  patternBlocked,
  restricaoBane,
  type RestricaoKey,
} from "./restricoes";

export type FindAltOpts = {
  /** Restrições do perfil: nunca sugere um exercício banido. */
  restr?: Set<RestricaoKey>;
  /** Ids já usados na sessão (não repete exercício). */
  excludeIds?: Iterable<string>;
  /** Grupo primário do principal: mantém o alvo quando possível. */
  grupo?: GrupoMuscular;
};

/**
 * F4: alternativa do mesmo padrão para quando o equipamento está ocupado.
 * Prioriza equipamento disponível, mesmo músculo-alvo e respeita restrições;
 * nunca repete um exercício que já está na sessão.
 */
export function findAlt(
  catalog: Exercicio[],
  padrao: Padrao,
  equips: Set<string> | null,
  excludeId: string,
  opts: FindAltOpts = {},
): string | null {
  const restr = opts.restr ?? new Set<RestricaoKey>();
  if (patternBlocked(padrao, restr)) return null;

  const excluir = new Set(opts.excludeIds ?? []);
  const equipamentos = equips ?? new Set(catalog.map((e) => e.equipamento));
  const candidatos = catalog.filter(
    (e) =>
      e.padrao === padrao &&
      e.id !== excludeId &&
      !excluir.has(e.id) &&
      exerciseAllowed(e, equipamentos, restr),
  );
  if (candidatos.length === 0) return null;

  const doGrupo = opts.grupo
    ? candidatos.filter((e) => e.grupo_primario === opts.grupo)
    : [];
  return (doGrupo[0] ?? candidatos[0])!.id;
}

/** Resolve alternativa da prescrição; fallback runtime por padrão quando nula. */
export function resolverAlternativa(
  presc: Pick<Prescricao, "exercicio_id" | "alternativa_equipamento_ocupado">,
  catalog: Exercicio[],
  opts: {
    equips?: Set<string> | null;
    restr?: Set<RestricaoKey>;
    excludeIds?: Iterable<string>;
  } = {},
): Exercicio | null {
  const restr = opts.restr ?? new Set<RestricaoKey>();
  const equips = opts.equips ?? null;

  // Alternativa gravada no plano: só vale se ainda existe e não é banida.
  if (presc.alternativa_equipamento_ocupado) {
    const salva = catalog.find((x) => x.id === presc.alternativa_equipamento_ocupado);
    if (salva && !restricaoBane(salva, restr)) return salva;
  }

  const prim = catalog.find((x) => x.id === presc.exercicio_id);
  if (!prim) return null;
  const comum = {
    restr,
    excludeIds: opts.excludeIds,
    grupo: prim.grupo_primario,
  };
  const id =
    (equips && findAlt(catalog, prim.padrao, equips, prim.id, comum)) ||
    findAlt(catalog, prim.padrao, null, prim.id, comum);
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

/**
 * Carga com memória: estado calibrado → histórico exato → mesmo padrão → estimativa.
 * Use em troca/edição/remontagem e no logger.
 */
export function cargaParaExercicio(
  state: Pick<AppState, "estados" | "registros" | "exercicios">,
  exercicioId: string,
  fallback: number,
  opts: { excluirSessaoId?: string } = {},
): CargaSugerida {
  return cargaSugeridaParaExercicio(
    {
      estados: state.estados ?? [],
      registros: state.registros ?? [],
      exercicios: state.exercicios ?? [],
    },
    exercicioId,
    fallback,
    opts,
  );
}
