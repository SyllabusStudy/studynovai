import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Archive,
  ArrowLeft,
  CalendarPlus,
  Inbox,
  Loader2,
  Mail,
  MailOpen,
  Paperclip,
  Pencil,
  Plus,
  RefreshCw,
  Reply,
  Search,
  Send,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { classLabel, useClasses } from "@/lib/data";
import { useActiveClass } from "@/lib/active-class";
import { extractSuggestions, type MailSuggestion } from "@/lib/mail-extract";
import {
  completeMailConnect,
  disconnectMail,
  getMailStatus,
  listMailPage,
  readMailMessage,
  sendMailMessage,
  startMailConnect,
  updateMailMessage,
  MAIL_PROVIDERS,
} from "@/lib/mail.functions";

export const Route = createFileRoute("/_authenticated/email")({
  head: () => ({
    meta: [
      { title: "Email — StudyNova" },
      {
        name: "description",
        content:
          "Read your school email inside StudyNova and turn professor announcements into assignments and calendar dates.",
      },
      { property: "og:title", content: "Email — StudyNova" },
      {
        property: "og:description",
        content: "Your student inbox, right next to your classes and deadlines.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EmailPage,
});

const FOLDERS = [
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "unread", label: "Unread", icon: Mail },
  { id: "starred", label: "Starred", icon: Star },
  { id: "important", label: "Important", icon: MailOpen },
  { id: "attachments", label: "Attachments", icon: Paperclip },
  { id: "sent", label: "Sent", icon: Send },
  { id: "drafts", label: "Drafts", icon: Pencil },
  { id: "archive", label: "Archive", icon: Archive },
  { id: "trash", label: "Trash", icon: Trash2 },
] as const;

function shortDate(raw: string) {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function waitForOAuth(popup: Window) {
  return new Promise<string | null>((resolve, reject) => {
    let poll: number | undefined;
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      if (poll !== undefined) window.clearInterval(poll);
    };
    const onMessage = (event: MessageEvent) => {
      const type = (event.data as { type?: string } | null)?.type;
      if (
        event.origin !== window.location.origin ||
        event.source !== popup ||
        (event.data as { connectorId?: string } | null)?.connectorId !== "google_mail" ||
        (type !== "appUserConnectorOAuthComplete" && type !== "appUserConnectorOAuthFailed")
      )
        return;
      cleanup();
      if (type === "appUserConnectorOAuthComplete") {
        const code = (event.data as { code?: unknown }).code;
        resolve(typeof code === "string" ? code : null);
        return;
      }
      popup.close();
      reject(new Error("We couldn't finish connecting your email."));
    };
    window.addEventListener("message", onMessage);
    poll = window.setInterval(() => {
      if (!popup.closed) return;
      cleanup();
      reject(new Error("The sign-in window closed before finishing."));
    }, 500);
  });
}

function EmailPage() {
  const qc = useQueryClient();
  const status = useServerFn(getMailStatus);
  const { data: connection, isLoading } = useQuery({
    queryKey: ["mail-status"],
    queryFn: () => status({}),
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!connection?.connected) {
    return (
      <ConnectScreen
        reconnect={!!connection?.reconnectRequired}
        onConnected={() => qc.invalidateQueries({ queryKey: ["mail-status"] })}
      />
    );
  }

  return <Mailbox accountEmail={connection.email} />;
}

function ConnectScreen({
  reconnect,
  onConnected,
}: {
  reconnect: boolean;
  onConnected: () => void;
}) {
  const start = useServerFn(startMailConnect);
  const complete = useServerFn(completeMailConnect);
  const [busy, setBusy] = useState(false);

  async function connect() {
    setBusy(true);
    const popup = window.open("", "studynova-email", "width=600,height=720");
    if (!popup) {
      setBusy(false);
      toast.error("Allow pop-ups for StudyNova, then try again.");
      return;
    }
    try {
      const { authorizationUrl } = await start({});
      const completion = waitForOAuth(popup);
      popup.location.href = authorizationUrl;
      const code = await completion;
      if (code) await complete({ data: { code } });
      toast.success(reconnect ? "Your email is reconnected." : "Your email is connected.");
      onConnected();
    } catch (error) {
      popup.close();
      toast.error(error instanceof Error ? error.message : "We couldn't connect your email.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Email"
        description="Read your school email right here, and turn professor announcements into assignments and calendar dates."
      />
      <div className="mx-auto max-w-xl">
        <div className="surface-card p-6 text-center sm:p-8">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/12 text-primary">
            <Mail className="size-7" />
          </div>
          <h2 className="mt-4 font-display text-xl font-extrabold">
            {reconnect ? "Reconnect your email" : "Connect your email"}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {reconnect
              ? "Your email access needs to be renewed. Nothing else changes."
              : "Sign in with your email provider. StudyNova never sees your password, and only you can see your messages."}
          </p>
          <Button className="mt-6 w-full gap-2" onClick={connect} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
            {reconnect ? "Reconnect Gmail" : "Connect with Google"}
          </Button>
          <div className="mt-6 space-y-2 text-left">
            <p className="text-xs font-bold uppercase text-muted-foreground">Other providers</p>
            {MAIL_PROVIDERS.filter((p) => !p.available).map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm"
              >
                <span className="font-semibold text-muted-foreground">{p.label}</span>
                <span className="text-xs font-semibold text-muted-foreground">Coming soon</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Mailbox({ accountEmail }: { accountEmail: string | null }) {
  const qc = useQueryClient();
  const [folder, setFolder] = useState<string>("inbox");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeThread, setComposeThread] = useState<string | undefined>(undefined);

  const list = useServerFn(listMailPage);
  const read = useServerFn(readMailMessage);
  const update = useServerFn(updateMailMessage);
  const send = useServerFn(sendMailMessage);
  const disconnect = useServerFn(disconnectMail);

  const listQuery = useQuery({
    queryKey: ["mail-list", folder, search],
    queryFn: () => list({ data: { folder, search } }),
  });

  const messageQuery = useQuery({
    queryKey: ["mail-message", openId],
    enabled: !!openId,
    queryFn: () => read({ data: { id: openId! } }),
  });

  useEffect(() => {
    setOpenId(null);
  }, [folder, search]);

  const rows = listQuery.data?.ok ? listQuery.data.data.rows : [];
  const needsReconnect =
    (listQuery.data && !listQuery.data.ok && listQuery.data.reason === "reconnect") ||
    (messageQuery.data && !messageQuery.data.ok && messageQuery.data.reason === "reconnect");

  useEffect(() => {
    if (needsReconnect) qc.invalidateQueries({ queryKey: ["mail-status"] });
  }, [needsReconnect, qc]);

  const act = useMutation({
    mutationFn: (input: { id: string; action: string }) =>
      update({ data: input as never }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mail-list"] });
      qc.invalidateQueries({ queryKey: ["mail-message"] });
    },
    onError: () => toast.error("That didn't go through. Please try again."),
  });

  const sendNow = useMutation({
    mutationFn: () =>
      send({
        data: {
          to: composeTo,
          subject: composeSubject,
          body: composeBody,
          ...(composeThread ? { threadId: composeThread } : {}),
        },
      }),
    onSuccess: () => {
      setComposeOpen(false);
      setComposeTo("");
      setComposeSubject("");
      setComposeBody("");
      setComposeThread(undefined);
      toast.success("Email sent.");
      qc.invalidateQueries({ queryKey: ["mail-list"] });
    },
    onError: () => toast.error("We couldn't send that email. Please try again."),
  });

  const message = messageQuery.data?.ok ? messageQuery.data.data : null;

  function openCompose(prefill?: { to: string; subject: string; threadId?: string; quote?: string }) {
    setComposeTo(prefill?.to ?? "");
    setComposeSubject(prefill?.subject ?? "");
    setComposeBody(prefill?.quote ?? "");
    setComposeThread(prefill?.threadId);
    setComposeOpen(true);
  }

  return (
    <div>
      <PageHeader
        title="Email"
        description={
          accountEmail
            ? `Connected to ${accountEmail}. Turn announcements into assignments and calendar dates.`
            : "Your school email, right next to your classes and deadlines."
        }
        actions={
          <>
            <Button variant="outline" className="gap-2" onClick={() => listQuery.refetch()}>
              <RefreshCw className={cn("size-4", listQuery.isFetching && "animate-spin")} />
              Refresh
            </Button>
            <Button className="gap-2" onClick={() => openCompose()}>
              <Pencil className="size-4" /> Compose
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setSearch(searchDraft.trim());
            }}
            placeholder="Search your email…"
            className="pl-9"
          />
        </div>
        <Button variant="secondary" onClick={() => setSearch(searchDraft.trim())}>
          Search
        </Button>
        <div className="lg:hidden">
          <Select value={folder} onValueChange={setFolder}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FOLDERS.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[180px_minmax(0,340px)_minmax(0,1fr)]">
        <nav className="hidden lg:block">
          <ul className="space-y-1">
            {FOLDERS.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => setFolder(f.id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
                    folder === f.id
                      ? "bg-primary/12 text-primary"
                      : "text-muted-foreground hover:bg-secondary",
                  )}
                >
                  <f.icon className="size-4" /> {f.label}
                </button>
              </li>
            ))}
          </ul>
          <Button
            variant="ghost"
            className="mt-4 w-full justify-start text-xs text-muted-foreground"
            onClick={async () => {
              await disconnect({});
              qc.invalidateQueries({ queryKey: ["mail-status"] });
              toast.success("Email disconnected.");
            }}
          >
            Disconnect email
          </Button>
        </nav>

        <div className={cn("surface-card overflow-hidden p-0", openId && "hidden lg:block")}>
          {listQuery.isPending ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Inbox}
                title="Nothing here"
                description="No messages match this folder or search."
              />
            </div>
          ) : (
            <ul className="max-h-[70vh] divide-y divide-border overflow-y-auto">
              {rows.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(row.id)}
                    className={cn(
                      "flex w-full flex-col items-start gap-1 px-4 py-3 text-left transition-colors hover:bg-secondary/60",
                      openId === row.id && "bg-secondary",
                    )}
                  >
                    <span className="flex w-full items-center gap-2">
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate text-sm",
                          row.unread ? "font-extrabold" : "font-semibold text-muted-foreground",
                        )}
                      >
                        {row.fromName || row.fromEmail}
                      </span>
                      {row.starred ? (
                        <Star className="size-3.5 shrink-0 fill-warning text-warning" />
                      ) : null}
                      {row.hasAttachment ? (
                        <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
                      ) : null}
                      <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">
                        {shortDate(row.date)}
                      </span>
                    </span>
                    <span className={cn("w-full truncate text-sm", row.unread && "font-semibold")}>
                      {row.subject}
                    </span>
                    <span className="w-full truncate text-xs text-muted-foreground">
                      {row.snippet}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={cn("min-w-0", !openId && "hidden lg:block")}>
          {!openId ? (
            <div className="surface-card flex h-full min-h-[240px] items-center justify-center p-6 text-sm text-muted-foreground">
              Pick a message to read it here.
            </div>
          ) : messageQuery.isPending ? (
            <div className="surface-card flex h-40 items-center justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : !message ? (
            <div className="surface-card p-6 text-sm text-muted-foreground">
              We couldn't open that message. Try refreshing.
            </div>
          ) : (
            <MessageView
              message={message}
              onBack={() => setOpenId(null)}
              onAct={(action) => act.mutate({ id: message.id, action })}
              onReply={() =>
                openCompose({
                  to: message.fromEmail,
                  subject: message.subject.startsWith("Re:")
                    ? message.subject
                    : `Re: ${message.subject}`,
                  threadId: message.threadId,
                  quote: `\n\nOn ${message.date}, ${message.fromName} wrote:\n> ${message.bodyText
                    .split("\n")
                    .slice(0, 20)
                    .join("\n> ")}`,
                })
              }
            />
          )}
        </div>
      </div>

      <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New email</DialogTitle>
            <DialogDescription>
              {accountEmail ? `Sending from ${accountEmail}.` : "Sending from your connected email."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="mail-to">To</Label>
              <Input
                id="mail-to"
                value={composeTo}
                onChange={(e) => setComposeTo(e.target.value)}
                placeholder="professor@school.edu"
              />
            </div>
            <div>
              <Label htmlFor="mail-subject">Subject</Label>
              <Input
                id="mail-subject"
                value={composeSubject}
                onChange={(e) => setComposeSubject(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="mail-body">Message</Label>
              <Textarea
                id="mail-body"
                rows={8}
                value={composeBody}
                onChange={(e) => setComposeBody(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setComposeOpen(false)}>
              Cancel
            </Button>
            <Button
              className="gap-2"
              disabled={!composeTo.trim() || sendNow.isPending}
              onClick={() => sendNow.mutate()}
            >
              {sendNow.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type MailBodyView = {
  id: string;
  threadId: string;
  fromName: string;
  fromEmail: string;
  to: string;
  subject: string;
  date: string;
  unread: boolean;
  starred: boolean;
  bodyText: string;
  attachments: { filename: string; mimeType: string; size: number }[];
};

function MessageView({
  message,
  onBack,
  onAct,
  onReply,
}: {
  message: MailBodyView;
  onBack: () => void;
  onAct: (action: string) => void;
  onReply: () => void;
}) {
  const suggestions = useMemo(
    () => extractSuggestions(message.subject, message.bodyText),
    [message.subject, message.bodyText],
  );
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="surface-card p-4 sm:p-6">
      <div className="mb-3 flex items-center gap-1">
        <Button variant="ghost" size="sm" className="gap-1.5 lg:hidden" onClick={onBack}>
          <ArrowLeft className="size-4" /> Back
        </Button>
        <div className="ml-auto flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            aria-label={message.starred ? "Remove star" : "Star"}
            onClick={() => onAct(message.starred ? "unstar" : "star")}
          >
            <Star className={cn("size-4", message.starred && "fill-warning text-warning")} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Mark unread"
            onClick={() => onAct("unread")}
          >
            <Mail className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Archive" onClick={() => onAct("archive")}>
            <Archive className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Move to trash"
            onClick={() => {
              onAct("trash");
              onBack();
            }}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      <h2 className="text-balance font-display text-lg font-extrabold sm:text-xl">
        {message.subject}
      </h2>
      <p className="mt-1 text-sm font-semibold">
        {message.fromName}{" "}
        <span className="font-normal text-muted-foreground">&lt;{message.fromEmail}&gt;</span>
      </p>
      <p className="text-xs text-muted-foreground">{message.date}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" className="gap-1.5" onClick={onReply}>
          <Reply className="size-4" /> Reply
        </Button>
        {suggestions.length > 0 ? (
          <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
            <Plus className="size-4" /> Add to StudyNova
          </Button>
        ) : null}
      </div>

      {message.attachments.length > 0 ? (
        <ul className="mt-4 flex flex-wrap gap-2">
          {message.attachments.map((a) => (
            <li
              key={a.filename}
              className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold"
            >
              <Paperclip className="size-3.5" /> {a.filename}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-5 max-h-[50vh] overflow-y-auto whitespace-pre-wrap break-words text-sm leading-relaxed">
        {message.bodyText || "(no message text)"}
      </div>

      <AddToStudyNova
        open={addOpen}
        onOpenChange={setAddOpen}
        suggestions={suggestions}
        fallbackTitle={message.subject}
      />
    </div>
  );
}

function AddToStudyNova({
  open,
  onOpenChange,
  suggestions,
  fallbackTitle,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  suggestions: MailSuggestion[];
  fallbackTitle: string;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: classes = [] } = useClasses(user?.id);
  const { activeClass } = useActiveClass();
  const [picked, setPicked] = useState(0);
  const [classId, setClassId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [kind, setKind] = useState<MailSuggestion["kind"]>("assignment");

  useEffect(() => {
    if (!open) return;
    const s = suggestions[picked];
    setTitle(s?.title ?? fallbackTitle);
    setDate(s?.date ?? "");
    setKind(s?.kind ?? "assignment");
  }, [open, picked, suggestions, fallbackTitle]);

  useEffect(() => {
    if (open && !classId) setClassId(activeClass?.id ?? "");
  }, [open, activeClass?.id, classId]);

  const save = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Please sign in again.");
      if (!classId) throw new Error("Pick which class this is for.");
      if (!title.trim()) throw new Error("Give this a name first.");
      if (kind === "assignment") {
        const { error } = await supabase.from("assignments").insert({
          user_id: user.id,
          class_id: classId,
          title: title.trim(),
          due_date: date || null,
          status: "pending",
          priority: "medium",
          category: "From email",
        });
        if (error) throw error;
      } else {
        if (!date) throw new Error("Add the date for this one.");
        const { error } = await supabase.from("calendar_events").insert({
          user_id: user.id,
          class_id: classId,
          title: title.trim(),
          event_type: kind === "event" ? "other" : kind,
          event_date: date,
          description: "Added from email",
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assignments"] });
      qc.invalidateQueries({ queryKey: ["events"] });
      onOpenChange(false);
      toast.success("Added to StudyNova.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "We couldn't add that."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add to StudyNova</DialogTitle>
          <DialogDescription>
            We found these in this email. Check the details before adding.
          </DialogDescription>
        </DialogHeader>

        {suggestions.length > 1 ? (
          <div className="space-y-1.5">
            {suggestions.map((s, i) => (
              <button
                key={s.title}
                type="button"
                onClick={() => setPicked(i)}
                className={cn(
                  "w-full rounded-lg border px-3 py-2 text-left text-sm",
                  picked === i ? "border-primary bg-primary/10" : "border-border",
                )}
              >
                <span className="block truncate font-semibold">{s.title}</span>
                <span className="text-xs text-muted-foreground">
                  {s.date ? s.date : "no date found"}
                </span>
              </button>
            ))}
          </div>
        ) : null}

        <div className="space-y-3">
          <div>
            <Label htmlFor="add-title">Name</Label>
            <Input id="add-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="add-date">Date</Label>
              <Input
                id="add-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as MailSuggestion["kind"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="assignment">Assignment</SelectItem>
                  <SelectItem value="exam">Exam</SelectItem>
                  <SelectItem value="quiz">Quiz</SelectItem>
                  <SelectItem value="event">Calendar event</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Which class is this for?</Label>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a class" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {classLabel(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="gap-2" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CalendarPlus className="size-4" />
            )}
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
