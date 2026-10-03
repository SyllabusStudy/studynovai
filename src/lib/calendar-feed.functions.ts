import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type IcsEvent = { uid: string; summary: string; description: string; date: string; time: string | null };

function normalizeUrl(raw: string): string {
  const url = new URL(raw.trim().replace(/^webcals?:\/\//i, "https://"));
  if (url.protocol !== "https:") throw new Error("Use the https or webcal link from your school calendar.");
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || /^[\d.]+$/.test(host) || host.includes(":") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("That doesn't look like a school calendar link.");
  }
  return url.toString();
}

function unescape(v: string) {
  return v.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1").trim();
}

function toLocal(value: string, params: string, tz: string): { date: string; time: string | null } | null {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [, y = "", mo = "", d = "", h, mi = "00", , z] = m;
  if (!h || /VALUE=DATE(?!-)/i.test(params)) return { date: `${y}-${mo}-${d}`, time: null };
  if (!z) return { date: `${y}-${mo}-${d}`, time: `${h}:${mi}` };
  const at = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi));
  const parts: { year?: string; month?: string; day?: string; hour?: string; minute?: string } = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

function parseIcs(text: string, tz: string): IcsEvent[] {
  const lines = text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "").split(/\r?\n/);
  const out: IcsEvent[] = [];
  type Prop = { params: string; value: string };
  let cur: { DTSTART?: Prop; SUMMARY?: Prop; UID?: Prop; DESCRIPTION?: Prop; [k: string]: Prop | undefined } | null = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") cur = {};
    else if (line === "END:VEVENT" && cur) {
      const start = cur.DTSTART ? toLocal(cur.DTSTART.value, cur.DTSTART.params, tz) : null;
      const summary = cur.SUMMARY ? unescape(cur.SUMMARY.value) : "";
      if (start && summary) {
        out.push({
          uid: cur.UID?.value ?? `${summary}-${cur.DTSTART!.value}`,
          summary,
          description: cur.DESCRIPTION ? unescape(cur.DESCRIPTION.value).slice(0, 2000) : "",
          ...start,
        });
      }
      cur = null;
    } else if (cur) {
      const idx = line.indexOf(":");
      if (idx < 0) continue;
      const [name, ...params] = line.slice(0, idx).split(";");
      cur[(name ?? "").toUpperCase()] = { params: params.join(";"), value: line.slice(idx + 1) };
    }
  }
  return out;
}

function eventType(title: string): string {
  const t = title.toLowerCase();
  if (/\bfinal\b/.test(t)) return "final";
  if (/(exam|midterm|test)/.test(t)) return "exam";
  if (/quiz/.test(t)) return "quiz";
  if (/project/.test(t)) return "project";
  if (/presentation/.test(t)) return "presentation";
  return "assignment";
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export const listCalendarFeeds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("calendar_feeds")
      .select("id,label,url,class_id,last_synced_at,last_count")
      .order("created_at");
    if (error) throw new Error(error.message);
    return data.map((f) => ({ ...f, url: new URL(f.url).hostname }));
  });

export const removeCalendarFeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("calendar_feeds").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const syncCalendarFeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid().optional(),
        url: z.string().min(10).max(2000).optional(),
        icsText: z.string().max(5_000_000).optional(),
        classId: z.string().uuid().nullable().optional(),
        tz: z.string().max(80).default("UTC"),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    let tz = data.tz;
    try { new Intl.DateTimeFormat("en", { timeZone: tz }); } catch { tz = "UTC"; }

    let feed: { id: string; url: string; class_id: string | null };
    if (data.id) {
      const { data: row, error } = await supabase.from("calendar_feeds").select("id,url,class_id").eq("id", data.id).single();
      if (error) throw new Error("Calendar link not found.");
      feed = row;
    } else if (data.icsText) {
      const url = `https://upload.local-file/${userId}.ics`;
      const { data: row, error } = await supabase
        .from("calendar_feeds")
        .upsert({ user_id: userId, url, label: "Uploaded calendar", class_id: data.classId ?? null }, { onConflict: "user_id,url" })
        .select("id,url,class_id")
        .single();
      if (error) throw new Error(error.message);
      feed = row;
    } else {
      if (!data.url) throw new Error("Paste your calendar link first.");
      const url = normalizeUrl(data.url);
      const host = new URL(url).hostname;
      const label = /instructure|canvas/.test(host) ? "Canvas" : host.includes("blackboard") ? "Blackboard" : "School calendar";
      const { data: row, error } = await supabase
        .from("calendar_feeds")
        .upsert({ user_id: userId, url, label, class_id: data.classId ?? null }, { onConflict: "user_id,url" })
        .select("id,url,class_id")
        .single();
      if (error) throw new Error(error.message);
      feed = row;
    }

    let text = data.icsText ?? "";
    if (!data.icsText) {
      if (feed.url.startsWith("https://upload.local-file/")) throw new Error("This calendar was uploaded as a file. Drop the new file to update it.");
      const blocked = "Your school calendar couldn't be reached. In Canvas, open the Calendar Feed link in your browser to download the .ics file, then drop it here instead.";
      let res: Response | null = null;
      for (let i = 0; i < 2 && !res?.ok; i++) {
        try {
          res = await fetch(feed.url, {
            redirect: "follow",
            headers: {
              "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
              Accept: "text/calendar, text/plain, */*",
              "Accept-Language": "en-US,en;q=0.9",
            },
          });
        } catch { res = null; }
      }
      if (!res?.ok) throw new Error(res && (res.status === 404 || res.status === 401) ? "That calendar link no longer works. Copy a fresh Calendar Feed link from Canvas." : blocked);
      text = (await res.text()).slice(0, 5_000_000);
    }
    if (!text.includes("BEGIN:VCALENDAR")) throw new Error("That isn't a calendar feed. Copy the Calendar Feed link (or .ics file) from Canvas or Blackboard.");

    const cutoff = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    const items = parseIcs(text, tz).filter((e) => e.date >= cutoff).slice(0, 1500);

    const { data: classes } = await supabase.from("classes").select("id,class_name,course_code");
    const keys = (classes ?? []).flatMap((c) =>
      [c.course_code, c.class_name].filter((v): v is string => !!v && squash(v).length >= 3).map((v) => ({ id: c.id, key: squash(v) })),
    );
    const matchClass = (title: string) => {
      const tag = title.match(/\[([^\]]+)\]\s*$/)?.[1] ?? title;
      const s = squash(tag);
      return keys.find((k) => s.includes(k.key))?.id ?? feed.class_id;
    };

    const { data: existing } = await supabase
      .from("calendar_events")
      .select("id,sync_key,title,event_date,event_time,class_id")
      .like("sync_key", `ics:${feed.id}:%`);
    const byUid = new Map((existing ?? []).map((e) => [e.sync_key!, e]));

    const inserts = [];
    let updated = 0;
    for (const e of items) {
      const src = `ics:${feed.id}:${e.uid}`.slice(0, 500);
      const title = e.summary.replace(/\s*\[[^\]]+\]\s*$/, "").slice(0, 300) || e.summary.slice(0, 300);
      const row = {
        title,
        event_date: e.date,
        event_time: e.time,
        event_type: eventType(title),
        description: e.description || null,
        class_id: matchClass(e.summary),
      };
      const prev = byUid.get(src);
      if (!prev) inserts.push({ ...row, user_id: userId, sync_key: src });
      else if (prev.title !== row.title || prev.event_date !== row.event_date || prev.event_time !== row.event_time) {
        await supabase.from("calendar_events").update(row).eq("id", prev.id);
        updated++;
      }
    }
    for (let i = 0; i < inserts.length; i += 200) {
      const { error } = await supabase.from("calendar_events").insert(inserts.slice(i, i + 200));
      if (error) throw new Error(error.message);
    }
    await supabase
      .from("calendar_feeds")
      .update({ last_synced_at: new Date().toISOString(), last_count: items.length })
      .eq("id", feed.id);
    return { added: inserts.length, updated, total: items.length };
  });
