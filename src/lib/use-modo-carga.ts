"use client";

/**
 * Preferência de exibição da carga por exercício (total ↔ por lado), só neste aparelho.
 * Fica no navegador (não vai para a conta) e nunca muda o valor gravado.
 */
import { useCallback, useSyncExternalStore } from "react";

const CHAVE = "coach-hypertrophy:exibicao-carga";
const ouvintes = new Set<() => void>();
let cache: string | null = null;

function ler(): string {
  if (cache != null) return cache;
  try {
    cache = localStorage.getItem(CHAVE) ?? "[]";
  } catch {
    cache = "[]";
  }
  return cache;
}

function lista(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function useModoCarga() {
  const raw = useSyncExternalStore(
    (cb) => {
      ouvintes.add(cb);
      return () => ouvintes.delete(cb);
    },
    ler,
    () => "[]",
  );
  const alternados = lista(raw);
  const alternado = useCallback((id: string | null | undefined) => !!id && alternados.includes(id), [alternados]);
  const alternar = useCallback((id: string) => {
    const atual = lista(ler());
    const nova = atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id];
    cache = JSON.stringify(nova);
    try {
      localStorage.setItem(CHAVE, cache);
    } catch {
      /* sem armazenamento: vale só nesta tela */
    }
    ouvintes.forEach((f) => f());
  }, []);
  return { alternado, alternar };
}
