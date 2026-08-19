import { useEffect, useState } from "react";

/** State that survives navigating between pages (and reloads) for the same key. */
export function useStickyState<T>(key: string, initial: T) {
  const storageKey = `studymate:${key}`;
  const [value, setValue] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw !== null) setValue(JSON.parse(raw) as T);
    } catch {
      /* ignore unreadable storage */
    }
    setLoaded(true);
  }, [storageKey]);

  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      /* ignore full/blocked storage */
    }
  }, [loaded, storageKey, value]);

  return [value, setValue] as const;
}
