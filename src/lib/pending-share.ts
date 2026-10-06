// Remembers a shared note a visitor wants to keep, across sign-up and AI key setup.
const KEY = "studynova-pending-share";
export type ShareAction = "save" | "quiz" | "flashcards";

export function setPendingShare(token: string, action: ShareAction) {
  try { localStorage.setItem(KEY, JSON.stringify({ token, action, at: Date.now() })); } catch { /* ignore */ }
}

export function takePendingShare(): { token: string; action: ShareAction } | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    localStorage.removeItem(KEY);
    const v = JSON.parse(raw) as { token?: string; action?: ShareAction; at?: number };
    if (!v.token || (v.at && Date.now() - v.at > 7 * 864e5)) return null;
    return { token: v.token, action: v.action ?? "save" };
  } catch { return null; }
}
