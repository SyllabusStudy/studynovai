import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
      { title: "Email — SyllabusStudy" },
      {
        name: "description",
        content:
          "Read your school email inside SyllabusStudy and turn professor announcements into assignments and calendar dates.",
      },
      { property: "og:title", content: "Email — SyllabusStudy" },
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
  { id: "all", label: "All Mail", icon: Mail },
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

const RELAY_KEY = "studynova.mailOAuthResult";
const RELAY_CHANNEL = "studynova-mail-oauth";

type RelayPayload = { type?: string; connectorId?: string; code?: unknown; at?: number };

function readRelay(raw: unknown): RelayPayload | null {
  const data = raw as RelayPayload | null;
  if (!data || data.connectorId !== "google_mail") return null;
  if (
    data.type !== "appUserConnectorOAuthComplete" &&
    data.type !== "appUserConnectorOAuthFailed"
  )
    return null;
  // Ignore anything left over from an earlier attempt.
  if (typeof data.at === "number" && Date.now() - data.at > 10 * 60 * 1000) return null;
  return data;
}

function clearRelay() {
  try {
    window.localStorage.removeItem(RELAY_KEY);
  } catch {
    /* storage unavailable */
  }
}

/**
 * Waits for the Google sign-in window to report back. Google's own page can cut
 * the direct link between the two windows, so the result also travels through
 * shared browser storage and a same-origin channel.
 */
function waitForOAuth(cancel: AbortSignal) {
  clearRelay();
  return new Promise<string | null>((resolve, reject) => {
    let poll: number | undefined;
    let timeout: number | undefined;
    let channel: BroadcastChannel | null = null;
    let settled = false;

    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      cancel.removeEventListener("abort", onCancel);
      if (poll !== undefined) window.clearInterval(poll);
      if (timeout !== undefined) window.clearTimeout(timeout);
      channel?.close();
    };

    const settle = (data: RelayPayload) => {
      if (settled) return;
      settled = true;
      cleanup();
      clearRelay();
      if (data.type === "appUserConnectorOAuthComplete") {
        resolve(typeof data.code === "string" ? data.code : null);
        return;
      }
      reject(new Error("We couldn't finish connecting your email."));
    };

    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      clearRelay();
      reject(new Error(message));
    };

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = readRelay(event.data);
      if (data) settle(data);
    };
    window.addEventListener("message", onMessage);

    const onCancel = () => fail("Connecting your email was cancelled.");
    cancel.addEventListener("abort", onCancel);

    try {
      channel = new BroadcastChannel(RELAY_CHANNEL);
      channel.onmessage = (event) => {
        const data = readRelay(event.data);
        if (data) settle(data);
      };
    } catch {
      channel = null;
    }

    // Storage fallback: works even when Google's page severs the window link,
    // which is what browsers do on the way through Google sign-in.
    poll = window.setInterval(() => {
      let stored: string | null = null;
      try {
        stored = window.localStorage.getItem(RELAY_KEY);
      } catch {
        stored = null;
      }
      if (!stored) return;
      try {
        const data = readRelay(JSON.parse(stored));
        if (data) settle(data);
      } catch {
        /* ignore malformed value */
      }
    }, 600);

    timeout = window.setTimeout(
      () => fail("That took too long. Please try connecting your email again."),
      5 * 60 * 1000,
    );
  });
}

const PROVIDER_KEY = "studynova.emailProvider";
const OUTLOOK_URL = "https://outlook.office.com/mail/";

function EmailPage() {
  const qc = useQueryClient();
  const status = useServerFn(getMailStatus);
  const [provider, setProvider] = useState<"google" | "outlook" | null>(null);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(PROVIDER_KEY);
      if (saved === "outlook") setProvider("outlook");
    } catch {
      /* storage unavailable */
    }
  }, []);
  function choose(next: "google" | "outlook") {
    setProvider(next);
    try {
      window.localStorage.setItem(PROVIDER_KEY, next);
    } catch {
      /* storage unavailable */
    }
  }
  const { data: connection, isLoading } = useQuery({
    queryKey: ["mail-status"],
    queryFn: () => status({}),
    enabled: provider !== "outlook",
  });

  if (provider === "outlook") {
    return <OutlookView onUseGoogle={() => choose("google")} />;
  }

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
        onChooseOutlook={() => choose("outlook")}
      />
    );
  }

  return <Mailbox accountEmail={connection.email} />;
}

/** Outlook can't be shown inside another website (Microsoft blocks it), so the
 *  page stays a SyllabusStudy panel: it launches Outlook in a small focused window
 *  and keeps a quick-capture box for turning email text into SyllabusStudy items. */
function OutlookView({ onUseGoogle }: { onUseGoogle: () => void }) {
  const winRef = useRef<Window | null>(null);
  const [open, setOpen] = useState(false);
  const [pasted, setPasted] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    const t = window.setInterval(() => {
      setOpen(!!winRef.current && !winRef.current.closed);
    }, 1000);
    return () => window.clearInterval(t);
  }, []);

  const suggestions = useMemo(
    () => (pasted.trim() ? extractSuggestions("", pasted) : []),
    [pasted],
  );

  function openOutlook() {
    const existing = winRef.current;
    if (existing && !existing.closed) {
      existing.focus();
      return;
    }
    const win = window.open(
      OUTLOOK_URL,
      "studynova-outlook",
      "width=600,height=720,menubar=no,toolbar=no,location=yes,status=no",
    );

    if (!win) {
      toast.error("Allow pop-ups for SyllabusStudy, then try again.");
      return;
    }
    try {
      win.opener = null;
    } catch {
      /* ignore */
    }
    winRef.current = win;
    setOpen(true);
    win.focus();
  }

  return (
    <div>
      <PageHeader
        title="Email"
        description="Use your school Outlook next to your classes, and save what matters into SyllabusStudy."
      />
      <div className="mx-auto max-w-xl space-y-4">
        <div className="surface-card p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary">
              <Mail className="size-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-lg font-extrabold">Outlook</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Microsoft doesn't allow Outlook to be shown inside other sites, so it opens in a
                small window right on top of SyllabusStudy. Your password and messages stay with
                Microsoft.
              </p>
            </div>
          </div>
          <Button className="mt-4 w-full gap-2" onClick={openOutlook}>
            <Mail className="size-4" />
            {open ? "Go to Outlook window" : "Open Outlook"}
          </Button>
          {open ? (
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Outlook is open in its own small window.
            </p>
          ) : null}
        </div>

        <div className="surface-card p-5 sm:p-6">
          <h3 className="font-display text-base font-extrabold">Save something from an email</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Copy a line from Outlook and paste it here. SyllabusStudy pulls out the date and makes an
            assignment or calendar item.
          </p>
          <Textarea
            className="mt-3 min-h-24"
            placeholder="Paste from your email, e.g. Exam 2 is on Friday, October 10 in room 214."
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
          />
          {suggestions.length ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Found {suggestions.length} {suggestions.length === 1 ? "item" : "items"} to add.
            </p>
          ) : null}
          <Button
            className="mt-3 w-full gap-2"
            variant="secondary"
            disabled={!pasted.trim()}
            onClick={() => setAddOpen(true)}
          >
            <Plus className="size-4" />
            Add to SyllabusStudy
          </Button>
        </div>

        <div className="surface-card p-5 text-sm text-muted-foreground sm:p-6">
          <h3 className="font-display text-base font-extrabold text-foreground">
            Signing in with a school account
          </h3>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Use your full school email address, not a nickname.</li>
            <li>Your school may send you to its own sign-in page — that's normal.</li>
            <li>Approve the two-step prompt (like Duo) on your phone if one appears.</li>
          </ul>
        </div>

        <div className="text-center">
          <Button variant="ghost" size="sm" onClick={onUseGoogle}>
            Use Google / Gmail instead
          </Button>
        </div>
      </div>

      <AddToSyllabusStudy
        open={addOpen}
        onOpenChange={setAddOpen}
        suggestions={suggestions}
        fallbackTitle={pasted.trim().slice(0, 80) || "From email"}
      />
    </div>
  );
}


function ConnectScreen({
  reconnect,
  onConnected,
  onChooseOutlook,
}: {
  reconnect: boolean;
  onConnected: () => void;
  onChooseOutlook: () => void;
}) {
  const start = useServerFn(startMailConnect);
  const complete = useServerFn(completeMailConnect);
  const [busy, setBusy] = useState(false);
  const cancelRef = useRef<AbortController | null>(null);

  async function connect() {
    setBusy(true);
    const popup = window.open("", "studynova-email", "width=600,height=720");
    if (!popup) {
      setBusy(false);
      toast.error("Allow pop-ups for SyllabusStudy, then try again.");
      return;
    }
    const controller = new AbortController();
    cancelRef.current = controller;
    try {
      const { authorizationUrl } = await start({
        data: { origin: window.location.origin },
      });
      const completion = waitForOAuth(controller.signal);
      popup.location.href = authorizationUrl;
      const code = await completion;
      if (!code) throw new Error("We couldn't finish connecting your email. Please try again.");
      await complete({ data: { code } });
      toast.success(reconnect ? "Your email is reconnected." : "Your email is connected.");
      onConnected();
    } catch (error) {
      try {
        popup.close();
      } catch {
        /* already closed */
      }
      toast.error(error instanceof Error ? error.message : "We couldn't connect your email.");
    } finally {
      cancelRef.current = null;
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
              : "Sign in with your email provider. SyllabusStudy never sees your password, and only you can see your messages."}
          </p>
          <Button className="mt-6 w-full gap-2" onClick={connect} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
            {busy
              ? "Waiting for Google…"
              : reconnect
                ? "Reconnect Gmail"
                : "Connect with Google"}
          </Button>
          {busy ? (
            <>
              <p className="mt-3 text-xs text-muted-foreground">
                Finish signing in on the Google window. This page updates on its own.
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-1"
                onClick={() => cancelRef.current?.abort()}
              >
                Cancel
              </Button>
            </>
          ) : null}
          <div className="mt-6 space-y-2 text-left">
            <p className="text-xs font-bold uppercase text-muted-foreground">Other providers</p>
            <button
              type="button"
              onClick={onChooseOutlook}
              className="flex w-full items-center justify-between rounded-xl border border-border px-3 py-2 text-sm transition-colors hover:border-primary/50 hover:bg-primary/5"
            >
              <span className="font-semibold">Microsoft / Outlook</span>
              <span className="text-xs font-semibold text-primary">Use Outlook</span>
            </button>
            {MAIL_PROVIDERS.filter((p) => !p.available && p.id !== "microsoft_outlook").map((p) => (
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

  // Keyed by the connected account so a different Google account never
  // sees another account's cached mail.
  const account = accountEmail ?? "gmail";
  const listQuery = useInfiniteQuery({
    queryKey: ["mail-list", account, folder, search],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      list({ data: { folder, search, ...(pageParam ? { pageToken: pageParam } : {}) } }),
    getNextPageParam: (last) => (last.ok ? (last.data.nextPageToken ?? undefined) : undefined),
  });

  const messageQuery = useQuery({
    queryKey: ["mail-message", account, openId],
    enabled: !!openId,
    queryFn: () => read({ data: { id: openId! } }),
  });

  useEffect(() => {
    setOpenId(null);
  }, [folder, search]);

  const pages = listQuery.data?.pages ?? [];
  const firstPage = pages[0];
  const rows = useMemo(() => {
    const seen = new Set<string>();
    const out: NonNullable<Extract<(typeof pages)[number], { ok: true }>["data"]["rows"]> = [];
    for (const p of pages) {
      if (!p.ok) continue;
      for (const r of p.data.rows) {
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        out.push(r);
      }
    }
    return out;
  }, [pages]);

  // Keep loading older mail as the student scrolls to the bottom.
  const sentinelRef = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && listQuery.hasNextPage && !listQuery.isFetchingNextPage) {
        void listQuery.fetchNextPage();
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [listQuery, rows.length]);

  function refreshMailbox() {
    qc.removeQueries({ queryKey: ["mail-message"] });
    void qc.resetQueries({ queryKey: ["mail-list"] });
    void qc.invalidateQueries({ queryKey: ["mail-status"] });
  }
  const needsReconnect =
    (firstPage && !firstPage.ok && firstPage.reason === "reconnect") ||
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
            <Button variant="outline" className="gap-2" onClick={refreshMailbox}>
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
              qc.removeQueries({ queryKey: ["mail-list"] });
              qc.removeQueries({ queryKey: ["mail-message"] });
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
              <li ref={sentinelRef} className="flex justify-center px-4 py-3">
                {listQuery.hasNextPage ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={listQuery.isFetchingNextPage}
                    onClick={() => void listQuery.fetchNextPage()}
                  >
                    {listQuery.isFetchingNextPage ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      "Load older messages"
                    )}
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {rows.length} message{rows.length === 1 ? "" : "s"} · end of folder
                  </span>
                )}
              </li>
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
            <Plus className="size-4" /> Add to SyllabusStudy
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

      <AddToSyllabusStudy
        open={addOpen}
        onOpenChange={setAddOpen}
        suggestions={suggestions}
        fallbackTitle={message.subject}
      />
    </div>
  );
}

function AddToSyllabusStudy({
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
      toast.success("Added to SyllabusStudy.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "We couldn't add that."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add to SyllabusStudy</DialogTitle>
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
