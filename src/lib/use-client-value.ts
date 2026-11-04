"use client";
import { useSyncExternalStore } from "react";

const semAssinatura = () => () => {};

/**
 * Valor que só existe no navegador (data local, semana ISO, localStorage…).
 * No servidor e na hidratação usa `servidor`; no cliente lê `cliente()`.
 * Substitui o padrão `useEffect(() => setX(...), [])` sem render em cascata.
 */
export function useClientValue<T>(cliente: () => T, servidor: T): T {
  return useSyncExternalStore(semAssinatura, cliente, () => servidor);
}
