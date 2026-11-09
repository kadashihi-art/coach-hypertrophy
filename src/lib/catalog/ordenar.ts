import type { Exercicio } from "@/lib/domain";
import { labelGrupo } from "@/lib/labels";

/** Ordenação da lista de exercícios (Adicionar e Trocar). Só muda a exibição; nada é gravado. */
/** "sugerido" = a ordem que chegou (ranking pelo histórico), só onde a lista tem ranking. */
export type ModoOrdem = "sugerido" | "grupo" | "az";
export const ORDEM_PADRAO: ModoOrdem = "grupo";
export const ROTULO_ORDEM: Record<ModoOrdem, string> = { sugerido: "Sugeridos", grupo: "Por grupo", az: "A–Z" };

/** Ordem dos grupos na lista: de cima pra baixo no corpo, opcionais junto da região. */
export const ORDEM_GRUPOS: string[] = [
  "peito", "costas", "ombros", "trapezio", "biceps", "triceps", "antebracos",
  "quadriceps", "isquiotibiais", "gluteos", "abdutores", "adutores", "panturrilhas", "abdomen",
];

const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });
export const compararNome = (a: string, b: string) => collator.compare(a, b);

type ComNome = Pick<Exercicio, "nome" | "grupo_primario">;

export function ordenarAZ<T>(itens: T[], ex: (t: T) => ComNome): T[] {
  return [...itens].sort((a, b) => compararNome(ex(a).nome, ex(b).nome));
}

export type GrupoLista<T> = { grupo: string; titulo: string; itens: T[] };

/** Agrupa por grupo muscular principal (ordem do corpo) e ordena cada grupo de A a Z. */
export function agruparPorGrupo<T>(itens: T[], ex: (t: T) => ComNome): GrupoLista<T>[] {
  const mapa = new Map<string, T[]>();
  for (const t of itens) {
    const g = ex(t).grupo_primario;
    if (!mapa.has(g)) mapa.set(g, []);
    mapa.get(g)!.push(t);
  }
  const pos = (g: string) => {
    const i = ORDEM_GRUPOS.indexOf(g);
    return i < 0 ? ORDEM_GRUPOS.length : i;
  };
  return [...mapa.entries()]
    .sort(([a], [b]) => pos(a) - pos(b) || compararNome(labelGrupo(a), labelGrupo(b)))
    .map(([grupo, lista]) => ({ grupo, titulo: labelGrupo(grupo), itens: ordenarAZ(lista, ex) }));
}
