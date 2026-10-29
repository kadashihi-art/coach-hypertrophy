"use client";

import { AppStateSchema, type AppState } from "./domain";
import { seedState } from "./seed";

/** v5: zero fake progress (volumes/PRs/decisões só com registros). */
export const STORAGE_KEY = "coach-hypertrophy:v5";
export const SYNCED_AT_KEY = "coach-hypertrophy:v5:synced_at";

export function loadState(): AppState {
  if (typeof window === "undefined") return seedState;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      saveState(seedState);
      return structuredClone(seedState);
    }
    const parsed = AppStateSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      console.warn("Estado inválido no localStorage, usando seed.", parsed.error);
      saveState(seedState);
      return structuredClone(seedState);
    }
    return parsed.data;
  } catch {
    return structuredClone(seedState);
  }
}

export function saveState(state: AppState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function loadSyncedAt(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(SYNCED_AT_KEY);
}

export function saveSyncedAt(iso: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SYNCED_AT_KEY, iso);
}

export function resetState(): AppState {
  const next = structuredClone(seedState);
  saveState(next);
  saveSyncedAt(new Date().toISOString());
  return next;
}

/** Seed-like: sem onboarding e sem histórico do usuário. */
export function isSeedLike(state: AppState): boolean {
  return (
    !state.perfil?.onboarding_concluido &&
    state.registros.length === 0 &&
    state.checkins.length === 0 &&
    state.decisoes.length === 0
  );
}
