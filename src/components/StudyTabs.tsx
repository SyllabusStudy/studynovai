import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Bot,
  Brain,
  Camera,
  CalendarDays,
  ChartColumn,
  CheckSquare,
  BookOpen,
  FileQuestion,
  FileText,
  GraduationCap,
  Image as ImageIcon,
  LayoutDashboard,
  Mail,
  MessageSquare,
  Mic,
  Plus,
  ScanSearch,
  Settings,
  Shield,
  Sparkles,
  Video,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { clearTabMemory } from "@/lib/tab-memory";
import { useLectureRecorder } from "@/lib/lecture-recorder";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Tab = { path: string; label: string; icon: string };

const ICONS = {
  home: LayoutDashboard,
  classes: BookOpen,
  calendar: CalendarDays,
  assignments: CheckSquare,
  notes: FileText,
  grades: ChartColumn,
  flashcards: Brain,
  quizzes: FileQuestion,
  tutor: Bot,
  snap: Camera,
  video: Video,
  images: ImageIcon,
  checker: ScanSearch,
  mail: Mail,
  lectures: Mic,
  school: GraduationCap,
  settings: Settings,
  feedback: MessageSquare,
  upgrade: Sparkles,
  admin: Shield,
} as const;

type IconKey = keyof typeof ICONS;

const KNOWN: { prefix: string; label: string; icon: IconKey; tint?: string }[] = [
  { prefix: "/dashboard", label: "Home", icon: "home" },
  { prefix: "/classes", label: "My Classes", icon: "classes" },
  { prefix: "/calendar", label: "Calendar", icon: "calendar" },
  { prefix: "/assignments", label: "Assignments", icon: "assignments" },
  { prefix: "/notes", label: "Notes", icon: "notes" },
  { prefix: "/grades", label: "Grades", icon: "grades" },
  { prefix: "/flashcards", label: "Flashcards", icon: "flashcards", tint: "text-feature-flashcards" },
  { prefix: "/quizzes", label: "Quizzes", icon: "quizzes", tint: "text-feature-quiz" },
  { prefix: "/tutor", label: "AI Tutor", icon: "tutor", tint: "text-feature-ai" },
  { prefix: "/snapquick", label: "SnapQuick", icon: "snap", tint: "text-feature-ai" },
  { prefix: "/quickvideo", label: "QuickVideo", icon: "video", tint: "text-feature-video" },
  { prefix: "/lectures", label: "Lecture Notes", icon: "lectures", tint: "text-feature-ai" },
  { prefix: "/studio", label: "AI Images", icon: "images" },
  { prefix: "/ai-checker", label: "AI Checker", icon: "checker" },
  { prefix: "/email", label: "Email", icon: "mail" },
  { prefix: "/school", label: "School", icon: "school" },
  { prefix: "/settings", label: "Settings", icon: "settings" },
  { prefix: "/feedback", label: "Feedback", icon: "feedback" },
  { prefix: "/upgrade", label: "Upgrade", icon: "upgrade" },
  { prefix: "/admin", label: "Admin", icon: "admin" },
];

const LAUNCH: { to: string; label: string; icon: IconKey }[] = [
  { to: "/snapquick", label: "SnapQuick", icon: "snap" },
  { to: "/quickvideo", label: "QuickVideo", icon: "video" },
  { to: "/lectures", label: "Lecture Notes", icon: "lectures" },
  { to: "/tutor", label: "AI Tutor", icon: "tutor" },
  { to: "/flashcards", label: "Flashcards", icon: "flashcards" },
  { to: "/quizzes", label: "Quizzes", icon: "quizzes" },
  { to: "/ai-checker", label: "AI Checker", icon: "checker" },
  { to: "/studio", label: "AI Images", icon: "images" },
  { to: "/email", label: "Email", icon: "mail" },
  { to: "/calendar", label: "Calendar", icon: "calendar" },
  { to: "/assignments", label: "Assignments", icon: "assignments" },
  { to: "/notes", label: "Notes", icon: "notes" },
  { to: "/grades", label: "Grades", icon: "grades" },
  { to: "/classes", label: "My Classes", icon: "classes" },
  { to: "/school", label: "School", icon: "school" },
];

const HOME = "/dashboard";
const STORE = "studynova.tabs.v1";
const MAX_TABS = 12;

function describe(path: string): Tab | null {
  const match = KNOWN.find((k) => path === k.prefix || path.startsWith(`${k.prefix}/`));
  if (!match) return null;
  const rest = path.slice(match.prefix.length).replace(/^\//, "");
  const label = rest ? `${match.label} · open` : match.label;
  return { path, label, icon: match.icon };
}

export function StudyTabs() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const [tabs, setTabs] = useState<Tab[]>([]);
  const lecture = useLectureRecorder();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORE);
      if (raw) {
        const parsed = JSON.parse(raw) as Tab[];
        if (Array.isArray(parsed)) setTabs(parsed.filter((t) => t && typeof t.path === "string"));
      }
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const next = describe(pathname);
    if (!next) return;
    setTabs((current) => {
      if (current.some((t) => t.path === next.path)) return current;
      const merged = [...current, next];
      return merged.length > MAX_TABS ? merged.slice(merged.length - MAX_TABS) : merged;
    });
  }, [pathname, ready]);

  useEffect(() => {
    if (!ready) return;
    try {
      sessionStorage.setItem(STORE, JSON.stringify(tabs));
    } catch {
      /* ignore */
    }
  }, [tabs, ready]);

  const close = useCallback(
    (path: string) => {
      // Closing a tab forgets that tool's unfinished work.
      clearTabMemory(path);
      setTabs((current) => {
        const index = current.findIndex((t) => t.path === path);
        if (index < 0) return current;
        const remaining = current.filter((t) => t.path !== path);
        if (path === pathname) {
          const fallback = remaining[Math.max(0, index - 1)]?.path ?? HOME;
          void navigate({ to: fallback });
        }
        return remaining;
      });
    },
    [pathname, navigate],
  );

  const visible = useMemo(() => tabs.filter((t) => describe(t.path)), [tabs]);
  if (visible.length < 1 && !lecture.recording) return null;
  // Class workspaces have their own Quick Tools — skip the duplicate tab bar there.
  if ((pathname.startsWith("/classes/") || pathname.startsWith("/quickvideo")) && !lecture.recording) return null;

  return (
    <div className="sticky top-16 z-30 border-b border-border bg-card/85 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[90rem] items-center gap-1.5 px-2 py-1.5 sm:px-6 xl:px-10">
        {lecture.recording ? (
          <Link
            to="/lectures"
            aria-label="Recording lecture — open Lecture Notes"
            className="flex shrink-0 items-center gap-1.5 rounded-xl border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-xs font-semibold text-destructive"
          >
            <span className="size-2 animate-pulse rounded-full bg-destructive" />
            Recording {Math.floor(lecture.seconds / 60)}:{String(lecture.seconds % 60).padStart(2, "0")}
          </Link>
        ) : null}
        <div className="scroll-slim flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
          {visible.map((tab) => {
            const Icon = ICONS[(tab.icon as IconKey) in ICONS ? (tab.icon as IconKey) : "home"];
            const active = pathname === tab.path;
            const closable = tab.path !== HOME;
            return (
              <div
                key={tab.path}
                className={cn(
                  "group flex shrink-0 items-center gap-1 rounded-xl border px-1 transition-colors",
                  active
                    ? "border-primary/40 bg-primary/12 text-foreground"
                    : "border-transparent bg-muted/60 text-muted-foreground hover:text-foreground",
                )}
              >
                <Link
                  to={tab.path}
                  className="flex max-w-[11rem] items-center gap-2 py-1.5 pl-2 pr-1 text-xs font-semibold"
                >
                  <Icon className={cn("size-4 shrink-0", active && "text-primary")} />
                  <span className="truncate">{tab.label}</span>
                </Link>
                {closable ? (
                  <button
                    type="button"
                    aria-label={`Close ${tab.label}`}
                    onClick={() => close(tab.path)}
                    className="mr-1 rounded-md p-1 text-muted-foreground/70 transition-colors hover:bg-background hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                ) : (
                  <span className="mr-1 w-1" />
                )}
              </div>
            );
          })}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Open another tool"
              className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground transition-colors hover:text-foreground"
            >
              <Plus className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>Open in a new tab</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {LAUNCH.map((item) => {
              const Icon = ICONS[item.icon];
              return (
                <DropdownMenuItem key={item.to} onSelect={() => void navigate({ to: item.to })}>
                  <Icon className="size-4" />
                  {item.label}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
