import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Activity, AdminStats, Tool } from "@/lib/admin.server";

export const TOOL_LABELS: Record<Tool, string> = {
  scans: "Scans",
  ai_helps: "AI Helps",
  quizzes: "Quizzes",
  flashcards: "Flashcards",
  study_guides: "Study Guides",
  assignments: "Assignments",
  syllabus: "Syllabus",
  tutor: "AI Tutor",
  essays: "Essays/Writing",
  humanizer: "Humanizer",
  video: "QuickVideo",
};
const COLS: Tool[] = ["scans", "ai_helps", "quizzes", "flashcards", "study_guides", "assignments", "syllabus", "tutor", "essays", "humanizer"];
const AI_TOOLS: Tool[] = ["scans", "ai_helps", "quizzes", "flashcards", "study_guides", "syllabus", "tutor", "essays", "humanizer", "video"];

type Student = AdminStats["students"][number];
const fmt = (d: string) => new Date(d).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
const sel = "h-9 rounded-md border border-input bg-background px-2 text-sm";

export function AdminUsers({ data, onManage }: { data: AdminStats; onManage: (s: Student) => void }) {
  const [q, setQ] = useState("");
  const [plan, setPlan] = useState("all");
  const [tool, setTool] = useState<"all" | Tool>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [detail, setDetail] = useState<{ s: Student; tool: Tool | "all" } | null>(null);

  const acts = useMemo(
    () =>
      data.activity.filter(
        (a) =>
          (tool === "all" || a.tool === tool) &&
          (!from || a.at >= from) &&
          (!to || a.at.slice(0, 10) <= to),
      ),
    [data.activity, tool, from, to],
  );
  const byUser = useMemo(() => {
    const m = new Map<string, Activity[]>();
    for (const a of acts) (m.get(a.u) ?? m.set(a.u, []).get(a.u)!).push(a);
    return m;
  }, [acts]);
  const lastActive = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of data.activity) if (!m.has(a.u)) m.set(a.u, a.at); // sorted newest first
    return m;
  }, [data.activity]);

  const rows = data.students.filter((s) => {
    const t = q.trim().toLowerCase();
    if (t && !`${s.name ?? ""} ${s.email ?? ""}`.toLowerCase().includes(t)) return false;
    if (plan !== "all" && s.plan !== plan) return false;
    if ((tool !== "all" || from || to) && !byUser.has(s.id)) return false;
    return true;
  });

  const detailList = detail
    ? (byUser.get(detail.s.id) ?? []).filter((a) => detail.tool === "all" || a.tool === detail.tool)
    : [];

  const Num = ({ s, t, n }: { s: Student; t: Tool | "all"; n: number }) => (
    <button
      className={n ? "font-semibold text-primary hover:underline" : "text-muted-foreground"}
      disabled={!n}
      onClick={() => setDetail({ s, tool: t })}
    >
      {n}
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <Input className="h-9 w-56" placeholder="Search student or email" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={sel} value={plan} onChange={(e) => setPlan(e.target.value)}>
          <option value="all">All plans</option>
          <option value="free">Free</option>
          <option value="pro">Pro</option>
        </select>
        <select className={sel} value={tool} onChange={(e) => setTool(e.target.value as Tool | "all")}>
          <option value="all">All tools</option>
          {(Object.keys(TOOL_LABELS) as Tool[]).map((t) => (
            <option key={t} value={t}>{TOOL_LABELS[t]}</option>
          ))}
        </select>
        <label className="text-xs text-muted-foreground">From<Input type="date" className="h-9" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="text-xs text-muted-foreground">To<Input type="date" className="h-9" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        {(q || plan !== "all" || tool !== "all" || from || to) && (
          <Button variant="ghost" size="sm" onClick={() => { setQ(""); setPlan("all"); setTool("all"); setFrom(""); setTo(""); }}>Clear</Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{rows.length} students · click any number to see the activity behind it</p>

      <div className="surface-card overflow-x-auto">
        <table className="w-full whitespace-nowrap text-sm">
          <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-3 font-semibold">Student</th>
              <th className="p-3 font-semibold">Plan</th>
              <th className="p-3 font-semibold">AI Key</th>
              {COLS.map((c) => <th key={c} className="p-3 text-right font-semibold">{TOOL_LABELS[c]}</th>)}
              <th className="p-3 text-right font-semibold">Classes</th>
              <th className="p-3 font-semibold">Last active</th>
              <th className="p-3 text-right font-semibold">Total</th>
              <th className="p-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const list = byUser.get(s.id) ?? [];
              const n = (t: Tool) => list.filter((a) => a.tool === t).length;
              const last = lastActive.get(s.id);
              return (
                <tr key={s.id} className="border-b border-border/50 last:border-0">
                  <td className="p-3">
                    <p className="font-semibold">{s.name ?? "Student"}</p>
                    <p className="text-xs text-muted-foreground">{s.email}</p>
                  </td>
                  <td className="p-3">
                    {s.plan === "pro" ? <span className="font-semibold text-primary">Pro · {s.status}</span> : <span className="text-muted-foreground">Free</span>}
                  </td>
                  <td className="p-3">
                    {s.hasAiKey ? (
                      <span className="font-semibold text-primary">Connected · {s.aiProvider}</span>
                    ) : (
                      <span className="text-muted-foreground">None</span>
                    )}
                  </td>
                  {COLS.map((c) => <td key={c} className="p-3 text-right"><Num s={s} t={c} n={n(c)} /></td>)}
                  <td className="p-3 text-right">{s.classes}</td>
                  <td className="p-3 text-xs text-muted-foreground">{last ? fmt(last) : "—"}</td>
                  <td className="p-3 text-right"><Num s={s} t="all" n={list.length} /></td>
                  <td className="p-3 text-right">
                    <Button variant="outline" size="sm" onClick={() => onManage(s)}>Manage</Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{detail?.s.name ?? "Student"} · {detail ? (detail.tool === "all" ? "All activity" : TOOL_LABELS[detail.tool]) : ""}</DialogTitle>
            <DialogDescription>{detailList.length} uses{detail?.s.email ? ` · ${detail.s.email}` : ""}</DialogDescription>
          </DialogHeader>
          <ul className="max-h-[60vh] space-y-1.5 overflow-y-auto">
            {detailList.map((a, i) => (
              <li key={i} className="rounded-lg border border-border px-3 py-2 text-sm">
                <p className="font-medium">{a.detail}</p>
                <p className="text-xs text-muted-foreground">{TOOL_LABELS[a.tool]} · {fmt(a.at)}</p>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function AdminAiUsage({ data }: { data: AdminStats }) {
  const ai = data.activity.filter((a) => AI_TOOLS.includes(a.tool));
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const week = Date.now() - 7 * 864e5;
  const month = Date.now() - 30 * 864e5;
  const since = (t: number) => ai.filter((a) => new Date(a.at).getTime() >= t).length;
  const counts = AI_TOOLS.map((t) => ({ t, n: ai.filter((a) => a.tool === t).length })).sort((a, b) => b.n - a.n);
  const max = counts[0]?.n || 1;
  const cards = [
    ["Total AI tool uses", ai.length],
    ["Most-used AI tool", counts[0]?.n ? TOOL_LABELS[counts[0].t] : "—"],
    ["Active users (30 days)", new Set(ai.filter((a) => new Date(a.at).getTime() >= month).map((a) => a.u)).size],
    ["Usage today", since(today)],
    ["Usage this week", since(week)],
    ["Usage this month", since(month)],
  ] as const;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map(([l, v]) => (
          <div key={l} className="surface-card min-w-0 p-4">
            <p className="truncate text-xl font-bold tracking-tight">{v}</p>
            <p className="text-xs text-muted-foreground">{l}</p>
          </div>
        ))}
      </div>
      <div className="surface-card space-y-2 p-4">
        <p className="text-sm font-semibold">Usage by AI tool</p>
        {counts.map(({ t, n }) => (
          <div key={t} className="flex items-center gap-3 text-sm">
            <span className="w-32 shrink-0">{TOOL_LABELS[t]}</span>
            <div className="h-2 flex-1 rounded-full bg-muted">
              <div className="h-2 rounded-full bg-primary" style={{ width: `${(n / max) * 100}%` }} />
            </div>
            <span className="w-10 text-right font-semibold">{n}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Essays/Writing, Humanizer and study-coach plans are counted from today on; other tools include past history.</p>
    </div>
  );
}
