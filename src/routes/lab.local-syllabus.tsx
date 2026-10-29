import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Download, FileText, FlaskConical, Loader2, Save, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BrandLogo } from "@/components/BrandLogo";
import { detectEvents, SAMPLE_SYLLABUS, type DetectedEvent, type LocalEventType } from "@/lib/local-syllabus/detect";
import { backupJson, clearEvents, listEvents, saveEvents, type SavedEvent } from "@/lib/local-syllabus/store";

export const Route = createFileRoute("/lab/local-syllabus")({
  head: () => ({
    meta: [
      { title: "Local Syllabus Reader (Test) — SyllabusStudy" },
      { name: "description", content: "Test reading a syllabus entirely on your device: no uploads, no AI key." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Local Syllabus Reader (Test) — SyllabusStudy" },
      { property: "og:description", content: "Find deadlines in a syllabus on your own device." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LocalSyllabusLab,
});

const TYPES: LocalEventType[] = ["exam", "final", "quiz", "assignment", "project", "presentation", "deadline"];

interface Stats { readMs: number | null; detectMs: number; pages: number | null; chars: number; found: number; uncertain: number }

async function readPdf(file: File): Promise<{ text: string; pages: number }> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const out: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const content = await (await pdf.getPage(p)).getTextContent();
    // Rebuild lines from y positions so table rows stay together.
    let lastY: number | null = null;
    let line = "";
    for (const it of content.items as { str: string; transform: number[] }[]) {
      const y = Math.round(it.transform[5]);
      if (lastY !== null && Math.abs(y - lastY) > 3) { out.push(line); line = ""; }
      line += (line && !line.endsWith(" ") ? " " : "") + it.str;
      lastY = y;
    }
    if (line) out.push(line);
  }
  return { text: out.join("\n"), pages: pdf.numPages };
}

function LocalSyllabusLab() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [course, setCourse] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<DetectedEvent[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [saved, setSaved] = useState<SavedEvent[]>([]);
  const [online, setOnline] = useState(true);
  const [idbOk, setIdbOk] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    if (typeof indexedDB === "undefined") setIdbOk(false);
    else listEvents().then(setSaved).catch(() => setIdbOk(false));
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  function analyze(text: string, readMs: number | null, pages: number | null) {
    const t0 = performance.now();
    const found = detectEvents(text);
    const detectMs = performance.now() - t0;
    setEvents(found);
    setStats({ readMs, detectMs, pages, chars: text.length, found: found.length, uncertain: found.filter((e) => e.confidence === "low").length });
    if (!course) setCourse(text.split("\n").find((l) => l.trim())?.trim().slice(0, 60) ?? "");
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (fileRef.current) fileRef.current.value = "";
    setError(null); setEvents(null); setBusy(true);
    try {
      const t0 = performance.now();
      let text = "", pages: number | null = null;
      if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) ({ text, pages } = await readPdf(file));
      else if (/^text\//.test(file.type) || /\.(txt|md)$/i.test(file.name)) text = await file.text();
      else throw new Error("This test reads PDF or plain-text files only.");
      const readMs = performance.now() - t0;
      if (text.replace(/\s/g, "").length < 40) {
        throw new Error("We couldn't find any text in this file. It looks like a scanned PDF (a picture of pages). This test can't read scans yet — try the original PDF from your class site.");
      }
      analyze(text, readMs, pages);
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't read that file.");
    } finally { setBusy(false); }
  }

  function edit(id: string, patch: Partial<DetectedEvent>) {
    setEvents((list) => list?.map((e) => (e.id === id ? { ...e, ...patch, confidence: "high", reason: null } : e)) ?? null);
  }

  async function confirm() {
    if (!events?.length) return;
    const now = new Date().toISOString();
    const rows: SavedEvent[] = events.map((e) => ({ ...e, id: crypto.randomUUID(), course: course || "My class", savedAt: now }));
    try {
      await saveEvents(rows);
      setSaved(await listEvents());
      setEvents(null);
      toast.success(`Saved ${rows.length} dates on this device`);
    } catch { toast.error("Your browser blocked saving on this device."); }
  }

  function exportJson() {
    const blob = new Blob([backupJson(saved)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `syllabusstudy-dates-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="app-canvas min-h-screen">
      <header className="mx-auto flex h-16 w-full max-w-4xl items-center gap-3 px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2.5"><BrandLogo /><span className="text-sm font-extrabold tracking-tight">SyllabusStudy</span></Link>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-card/60 px-3 py-1 text-xs font-semibold text-muted-foreground">
          <FlaskConical className="h-3.5 w-3.5" /> Test · {online ? "Online" : "Offline"}
        </span>
      </header>

      <main className="mx-auto w-full max-w-4xl space-y-6 px-4 pb-20 sm:px-6">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Local syllabus reader</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your file is read right here on your device. Nothing is uploaded, and no AI key is needed.</p>
        </div>

        <section className="rounded-2xl border border-border bg-card/70 p-5 backdrop-blur">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button onClick={() => fileRef.current?.click()} disabled={busy} className="flex-1">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Choose a syllabus PDF
            </Button>
            <Button variant="outline" disabled={busy} className="flex-1" onClick={() => { setError(null); setCourse("PSY 101"); analyze(SAMPLE_SYLLABUS, null, null); }}>
              <FileText className="h-4 w-4" /> Try the sample syllabus
            </Button>
            <input ref={fileRef} type="file" accept="application/pdf,.pdf,.txt,text/plain" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          </div>
          {error && <p role="alert" className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          {stats && (
            <dl className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
              {[
                ["Reading", stats.readMs === null ? "sample" : `${Math.round(stats.readMs)} ms`],
                ["Finding dates", `${stats.detectMs.toFixed(1)} ms`],
                ["Pages", stats.pages ?? "—"],
                ["Dates found", stats.found],
                ["Need a look", stats.uncertain],
              ].map(([k, v]) => (
                <div key={k as string} className="rounded-xl bg-muted/50 p-2"><dt className="text-muted-foreground">{k}</dt><dd className="font-bold">{v}</dd></div>
              ))}
            </dl>
          )}
        </section>

        {events && (
          <section className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-bold">Check these dates</h2>
                <p className="text-xs text-muted-foreground">Fix anything wrong, remove what you don't want, then save. Amber ones are guesses.</p>
              </div>
              <Input value={course} onChange={(e) => setCourse(e.target.value)} placeholder="Class name" className="w-full sm:w-56" />
            </div>
            {events.length === 0 && <p className="text-sm text-muted-foreground">No dated assignments or exams were found in this file.</p>}
            <ul className="space-y-2">
              {events.map((e) => (
                <li key={e.id} className={`rounded-xl border bg-card/70 p-3 ${e.confidence === "low" ? "border-warning/60" : "border-border"}`}>
                  <div className="grid gap-2 sm:grid-cols-[1fr_9rem_8rem_auto]">
                    <Input value={e.title} onChange={(ev) => edit(e.id, { title: ev.target.value })} aria-label="Title" />
                    <Input type="date" value={e.date} onChange={(ev) => edit(e.id, { date: ev.target.value })} aria-label="Date" />
                    <select value={e.type} onChange={(ev) => edit(e.id, { type: ev.target.value as LocalEventType })} aria-label="Type"
                      className="h-10 rounded-md border border-input bg-background px-2 text-sm capitalize">
                      {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <Button variant="ghost" size="icon" aria-label="Remove" onClick={() => setEvents((l) => l?.filter((x) => x.id !== e.id) ?? null)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                  <p className="mt-1.5 truncate text-[11px] text-muted-foreground">
                    {e.endDate && <>Through {e.endDate} · </>}{e.reason && <span className="font-semibold text-warning">{e.reason} · </span>}“{e.source}”
                  </p>
                </li>
              ))}
            </ul>
            {events.length > 0 && <Button onClick={confirm} className="w-full sm:w-auto"><Save className="h-4 w-4" /> Save {events.length} dates on this device</Button>}
          </section>
        )}

        <section className="rounded-2xl border border-border bg-card/70 p-5 backdrop-blur">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="mr-auto text-lg font-bold">Saved on this device ({saved.length})</h2>
            <Button variant="outline" size="sm" disabled={!saved.length} onClick={exportJson}><Download className="h-4 w-4" /> Download backup</Button>
            <Button variant="ghost" size="sm" disabled={!saved.length} onClick={async () => { if (confirm_("Remove all saved test dates from this device?")) { await clearEvents(); setSaved([]); } }}>Clear</Button>
          </div>
          {!idbOk && <p className="mt-2 text-sm text-destructive">This browser doesn't allow saving on the device (private mode can block it).</p>}
          <ul className="mt-3 divide-y divide-border text-sm">
            {saved.map((e) => (
              <li key={e.id} className="flex gap-3 py-2"><span className="w-24 shrink-0 font-mono text-xs text-muted-foreground">{e.date}</span><span className="min-w-0 flex-1 truncate">{e.title}</span><span className="text-xs capitalize text-muted-foreground">{e.course} · {e.type}</span></li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">These stay only in this browser. Clearing browser data removes them, so download a backup.</p>
        </section>
      </main>
    </div>
  );
}

function confirm_(msg: string) { return window.confirm(msg); }
