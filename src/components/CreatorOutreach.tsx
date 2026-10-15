import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Download, Loader2, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { draftCreatorPitch, getOutreachStatus, sendCreatorPitch } from "@/lib/outreach.functions";

const SITE = "https://syllabusstudy.com";
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 40);
const qr = (code: string) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=10&data=${encodeURIComponent(`${SITE}/?ref=${code}`)}`;

export function CreatorOutreach() {
  const qc = useQueryClient();
  const status = useServerFn(getOutreachStatus);
  const draft = useServerFn(draftCreatorPitch);
  const send = useServerFn(sendCreatorPitch);
  const st = useQuery({ queryKey: ["outreach-status"], queryFn: () => status() });

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [channel, setChannel] = useState("");
  const [notes, setNotes] = useState("");
  const [sender, setSender] = useState("David");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const ref = code || slug(name);

  const write = useMutation({
    mutationFn: () => draft({ data: { name, code: ref, channel, notes, senderName: sender } }),
    onSuccess: (d) => { setSubject(d.subject); setBody(d.body); },
    onError: (e) => toast.error((e as Error).message),
  });
  const go = useMutation({
    mutationFn: () => send({ data: { to: email, subject, body, code: ref, senderName: sender } }),
    onSuccess: () => {
      toast.success(`Sent to ${email}`);
      setEmail(""); setName(""); setCode(""); setChannel(""); setNotes(""); setSubject(""); setBody("");
      qc.invalidateQueries({ queryKey: ["outreach-status"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const copyRich = async () => {
    const link = `${SITE}/?ref=${ref}`;
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const paras = body.trim().split(/\n{2,}/).map((p) => `<p style="margin:0 0 12px">${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">${paras}`
      + `<p style="margin:0 0 8px">Your link: <a href="${link}">${link}</a></p>`
      + `<p style="margin:0 0 12px"><img src="${qr(ref)}" alt="Referral QR code" width="140" height="140"></p>`
      + `<p style="margin:0 0 6px">${esc(sender || "David")}<br>Founder, SyllabusStudy</p>`
      + `<p style="margin:0"><img src="${SITE}/icon-192.png" alt="SyllabusStudy" width="48" height="48"></p></div>`;
    const text = `${body.trim()}\n\nYour link: ${link}\n\n${sender || "David"}\nFounder, SyllabusStudy`;
    try {
      await navigator.clipboard.write([new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([text], { type: "text/plain" }),
      })]);
      toast.success("Copied! Paste into a new Gmail message.");
    } catch {
      await navigator.clipboard.writeText(text);
      toast.success("Copied text (your browser blocked images).");
    }
  };


  return (
    <div className="surface-card space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-bold">Pitch a creator</h3>
        <span className="text-sm text-muted-foreground">
          {st.isLoading ? "Checking Gmail…" : st.data?.connected ? `Sending from ${st.data.email}` : "Team Gmail not connected"}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label>Creator name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jessica" /></div>
        <div><Label>Their email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jessica@business.com" /></div>
        <div><Label>Referral code</Label><Input value={ref} onChange={(e) => setCode(slug(e.target.value))} placeholder="jessica" /></div>
        <div><Label>Your name (signature)</Label><Input value={sender} onChange={(e) => setSender(e.target.value)} /></div>
        <div className="sm:col-span-2"><Label>Channel / video link (optional)</Label><Input value={channel} onChange={(e) => setChannel(e.target.value)} placeholder="youtube.com/@jessicastudies" /></div>
        <div className="sm:col-span-2">
          <Label>What should it say? (optional — a detail about their videos, or your own instructions)</Label>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Loved her nursing-school exam week vlog" />
        </div>
      </div>

      {ref && (
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border p-3">
          <img src={qr(ref)} alt="Referral QR code" className="size-24 rounded-lg bg-card" />
          <div className="min-w-0 space-y-2 text-sm">
            <p className="break-all font-semibold">{SITE}/?ref={ref}</p>
            <Button asChild size="sm" variant="outline">
              <a href={qr(ref)} target="_blank" rel="noreferrer" download={`${ref}-qr.png`}><Download className="size-4" /> QR code</a>
            </Button>
          </div>
        </div>
      )}

      <Button variant="secondary" disabled={!name || !ref || write.isPending} onClick={() => write.mutate()}>
        {write.isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} Write it with AI
      </Button>

      <div className="space-y-3">
        <div><Label>Subject</Label><Input value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
        <div>
          <Label>Message (type your own or edit the AI draft)</Label>
          <Textarea rows={9} value={body} onChange={(e) => setBody(e.target.value)} placeholder={"Hey Jessica,\n\n…"} />
          <p className="mt-1 text-xs text-muted-foreground">Their link, QR code, your signature and the SyllabusStudy logo are added at the bottom automatically.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={!body || !ref} onClick={copyRich}>
            <Copy className="size-4" /> Copy for Gmail (with QR + logo)
          </Button>
          <Button variant="outline" disabled={!subject} onClick={() => { navigator.clipboard.writeText(subject); toast.success("Subject copied"); }}>
            <Copy className="size-4" /> Copy subject
          </Button>
          <Button variant="outline" disabled={!st.data?.connected || !email || !subject || !body || go.isPending} onClick={() => go.mutate()}>
            {go.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Send from app
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Tip: for your first pitches, copy and paste into the regular Gmail website — it lands in inboxes more often.</p>
      </div>

      {!!st.data?.sent.length && (
        <div>
          <h4 className="mb-2 text-sm font-semibold">Recently pitched</h4>
          <ul className="space-y-1 text-sm">
            {st.data.sent.map((s) => (
              <li key={s.id} className="flex justify-between gap-3 border-t border-border pt-1">
                <span className="truncate">{s.to}</span>
                <span className="shrink-0 text-muted-foreground">{s.date ? new Date(s.date).toLocaleDateString() : ""}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
