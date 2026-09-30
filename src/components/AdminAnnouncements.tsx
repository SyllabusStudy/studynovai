import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Mail, Send, Sparkles, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getAnnouncementAudience, sendAnnouncementEmail, writeAnnouncement } from "@/lib/announce.functions";
import type { Draft } from "@/lib/announce";

const TONES = [
  { value: "exciting", label: "Exciting" },
  { value: "academic", label: "Academic" },
  { value: "helpful", label: "Helpful" },
  { value: "short", label: "Short & sweet" },
];

export function AdminAnnouncements() {
  const qc = useQueryClient();
  const loadAudience = useServerFn(getAnnouncementAudience);
  const write = useServerFn(writeAnnouncement);
  const send = useServerFn(sendAnnouncementEmail);

  const [prompt, setPrompt] = useState("");
  const [tone, setTone] = useState("helpful");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [testTo, setTestTo] = useState("");
  const [busy, setBusy] = useState<"draft" | "test" | "send" | null>(null);

  const { data: audience } = useQuery({
    queryKey: ["announcement-audience"],
    queryFn: () => loadAudience({}),
  });

  async function handleDraft() {
    setBusy("draft");
    try {
      const result = await write({ data: { prompt, tone } });
      setDraft(result);
      toast.success("Draft ready — read it over before sending.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not write the email.");
    } finally {
      setBusy(null);
    }
  }

  async function handleSend(test: boolean) {
    if (!draft) return;
    if (!test && !window.confirm(`Send "${draft.subject}" to ${audience?.count ?? 0} students?`)) return;
    setBusy(test ? "test" : "send");
    try {
      const result = await send({ data: { draft, prompt, testTo: test ? testTo : undefined } });
      toast.success(test ? `Test sent to ${testTo}.` : `Sent to ${result.sent} students.`);
      if (!test) {
        setDraft(null);
        setPrompt("");
        await qc.invalidateQueries({ queryKey: ["announcement-audience"] });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send the email.");
    } finally {
      setBusy(null);
    }
  }

  function updateDraft(patch: Partial<Draft>) {
    setDraft((d) => (d ? { ...d, ...patch } : d));
  }

  return (
    <div className="space-y-5">
      <div className="surface-card p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Users className="size-4 text-primary" />
          {audience?.count ?? 0} students will get this
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Sent from news@studynova.link. Anyone who unsubscribes is skipped automatically.
        </p>
      </div>

      <div className="surface-card space-y-3 p-4">
        <div>
          <Label htmlFor="ann-prompt">What's the news?</Label>
          <Textarea
            id="ann-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            className="mt-1.5"
            placeholder="30% off Pro this week for midterms, code MIDTERM30, ends Sunday"
          />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-40">
            <Label htmlFor="ann-tone">Tone</Label>
            <Select value={tone} onValueChange={setTone}>
              <SelectTrigger id="ann-tone" className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TONES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleDraft} disabled={busy !== null || prompt.trim().length < 5}>
            {busy === "draft" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            Write it with AI
          </Button>
        </div>
      </div>

      {draft ? (
        <div className="surface-card space-y-4 p-4">
          <div>
            <Label htmlFor="ann-subject">Subject</Label>
            <Input
              id="ann-subject"
              value={draft.subject}
              onChange={(e) => updateDraft({ subject: e.target.value })}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="ann-body">Email</Label>
            <Textarea
              id="ann-body"
              value={draft.paragraphs.join("\n\n")}
              onChange={(e) => updateDraft({ paragraphs: e.target.value.split(/\n{2,}/).filter((p) => p.trim()) })}
              rows={8}
              className="mt-1.5"
            />
          </div>

          <div className="rounded-xl border border-border bg-background p-4">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Preview</p>
            <p className="mt-3 text-sm font-bold text-primary">SyllabusNova</p>
            <h3 className="mt-2 text-lg font-bold leading-snug">{draft.heading}</h3>
            {draft.paragraphs.map((p, i) => (
              <p key={i} className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
                {p}
              </p>
            ))}
            {draft.ctaLabel && draft.ctaUrl ? (
              <p className="mt-4">
                <span className="inline-block rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
                  {draft.ctaLabel}
                </span>
              </p>
            ) : null}
            <p className="mt-5 border-t border-border pt-3 text-xs text-muted-foreground">
              SyllabusNova — Your semester, made simple. Unsubscribe from announcements.
            </p>
          </div>

          <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Label htmlFor="ann-test">Send a test to yourself first</Label>
              <Input
                id="ann-test"
                type="email"
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                className="mt-1.5"
                placeholder="you@example.com"
              />
            </div>
            <Button variant="outline" disabled={busy !== null || !testTo} onClick={() => handleSend(true)}>
              {busy === "test" ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
              Send test
            </Button>
          </div>

          <Button className="w-full" disabled={busy !== null} onClick={() => handleSend(false)}>
            {busy === "send" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Send to all {audience?.count ?? 0} students
          </Button>
        </div>
      ) : null}

      {audience?.history?.length ? (
        <div className="surface-card p-4">
          <p className="mb-3 text-xs font-semibold uppercase text-muted-foreground">Already sent</p>
          <ul className="space-y-2">
            {audience.history.map((h) => (
              <li key={h.id} className="rounded-lg border border-border px-3 py-2 text-sm">
                <p className="font-medium">{h.subject}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(h.sent_at).toLocaleString()} · {h.recipients} sent
                  {h.failed ? ` · ${h.failed} failed` : ""}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
