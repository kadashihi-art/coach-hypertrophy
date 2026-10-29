import type { AppState } from "@/lib/domain";
import { AppStateSchema } from "@/lib/domain";
import { blobGetJson, blobPutJson } from "@/lib/blob";

export type StoredAppState = {
  updated_at: string;
  state: AppState;
};

function statePath(userId: string) {
  return `state/${userId}.json`;
}

export async function readUserState(
  userId: string,
): Promise<StoredAppState | null> {
  const raw = await blobGetJson<StoredAppState>(statePath(userId));
  if (!raw?.state) return null;
  const parsed = AppStateSchema.safeParse(raw.state);
  if (!parsed.success) return null;
  return { updated_at: raw.updated_at, state: parsed.data };
}

export async function writeUserState(
  userId: string,
  state: AppState,
): Promise<StoredAppState> {
  const parsed = AppStateSchema.parse(state);
  const stored: StoredAppState = {
    updated_at: new Date().toISOString(),
    state: parsed,
  };
  await blobPutJson(statePath(userId), stored);
  return stored;
}
