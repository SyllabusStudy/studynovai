import { useSyncExternalStore } from "react";

/** Tracks app recorders that need the microphone so Glo can go quiet. */
const owners = new Set<string>();
const listeners = new Set<() => void>();

export function setMicBusy(owner: string, busy: boolean) {
  const had = owners.has(owner);
  if (busy === had) return;
  if (busy) owners.add(owner);
  else owners.delete(owner);
  listeners.forEach((l) => l());
}

export function useMicBusy() {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => owners.size > 0,
    () => false,
  );
}
