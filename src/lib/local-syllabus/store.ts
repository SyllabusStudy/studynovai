// IndexedDB storage for the local syllabus test. Browser-only; call from handlers/effects.
import type { DetectedEvent } from "./detect";

const DB_NAME = "syllabusstudy-local";
const DB_VERSION = 1;
const STORE = "events";

export interface SavedEvent extends DetectedEvent { course: string; savedAt: string }

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" }).createIndex("date", "date");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); resolve(r ? r.result : undefined); };
    t.onerror = () => { db.close(); reject(t.error); };
  });
}

export async function saveEvents(events: SavedEvent[]) {
  await tx("readwrite", (s) => { for (const e of events) s.put(e); });
}
export async function listEvents(): Promise<SavedEvent[]> {
  const all = (await tx<SavedEvent[]>("readonly", (s) => s.getAll() as IDBRequest<SavedEvent[]>)) ?? [];
  return all.sort((a, b) => a.date.localeCompare(b.date));
}
export async function clearEvents() { await tx("readwrite", (s) => { s.clear(); }); }

export function backupJson(events: SavedEvent[]) {
  return JSON.stringify({ app: "SyllabusStudy", kind: "local-events", version: 1, exportedAt: new Date().toISOString(), events }, null, 2);
}
