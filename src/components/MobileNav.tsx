import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  BookOpen, Bot, Brain, CalendarDays, Camera, ChartColumn, CheckSquare, Crown, FileQuestion,
  GraduationCap, Image as ImageIcon, LayoutDashboard, Mail, MessageSquare, Mic, Moon, MoreHorizontal,
  Plus, ScanSearch, Settings, Sun, Upload, Video,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import { ToolsMascot } from "@/components/ToolsMascot";

type Tool = { to: string; label: string; desc: string; icon: typeof BookOpen; tint: string };

const SECTIONS: { label: string; items: Tool[] }[] = [
  {
    label: "Study",
    items: [
      { to: "/flashcards", label: "Flashcards", desc: "Flip cards from your notes", icon: Brain, tint: "text-feature-flashcards bg-feature-flashcards/15" },
      { to: "/quizzes", label: "Quizzes", desc: "Practice tests", icon: FileQuestion, tint: "text-feature-quiz bg-feature-quiz/15" },
      { to: "/tutor", label: "AI Tutor", desc: "Ask anything", icon: Bot, tint: "text-feature-ai bg-feature-ai/15" },
    ],
  },
  {
    label: "Tools",
    items: [
      { to: "/quickvideo", label: "QuickVideo", desc: "Videos into notes", icon: Video, tint: "text-feature-video bg-feature-video/15" },
      { to: "/lectures", label: "Lecture Notes", desc: "Record a class", icon: Mic, tint: "text-primary bg-primary/15" },
      { to: "/studio", label: "AI Images", desc: "Make study visuals", icon: ImageIcon, tint: "text-primary bg-primary/15" },
      { to: "/ai-checker", label: "AI Checker", desc: "Check & humanize", icon: ScanSearch, tint: "text-primary bg-primary/15" },
    ],
  },
  {
    label: "My work",
    items: [
      { to: "/assignments", label: "Assignments", desc: "Everything due", icon: CheckSquare, tint: "text-primary bg-primary/15" },
      { to: "/grades", label: "Grades", desc: "Track your scores", icon: ChartColumn, tint: "text-primary bg-primary/15" },
    ],
  },
  {
    label: "Resources",
    items: [
      { to: "/email", label: "Email", desc: "School inbox help", icon: Mail, tint: "text-primary bg-primary/15" },
      { to: "/school", label: "School Links", desc: "Portals & sites", icon: GraduationCap, tint: "text-primary bg-primary/15" },
    ],
  },
  {
    label: "Account",
    items: [
      { to: "/feedback", label: "Feedback", desc: "Tell us anything", icon: MessageSquare, tint: "text-muted-foreground bg-muted" },
      { to: "/settings", label: "Settings", desc: "Your preferences", icon: Settings, tint: "text-muted-foreground bg-muted" },
      { to: "/upgrade", label: "Upgrade", desc: "Go Pro", icon: Crown, tint: "text-primary bg-primary/15" },
    ],
  },
];

const QUICK: Tool[] = [
  { to: "/snapquick", label: "SnapQuick", desc: "Snap homework for help", icon: Camera, tint: "text-feature-ai bg-feature-ai/15" },
  { to: "/assignments", label: "Add assignment", desc: "Track something due", icon: CheckSquare, tint: "text-primary bg-primary/15" },
  { to: "/classes", label: "Upload syllabus", desc: "Build a class fast", icon: Upload, tint: "text-primary bg-primary/15" },
  { to: "/flashcards", label: "Make flashcards", desc: "From your notes", icon: Brain, tint: "text-feature-flashcards bg-feature-flashcards/15" },
  { to: "/quickvideo", label: "QuickVideo", desc: "Video into notes", icon: Video, tint: "text-feature-video bg-feature-video/15" },
  { to: "/tutor", label: "Ask AI", desc: "Instant help", icon: Bot, tint: "text-feature-ai bg-feature-ai/15" },
];

function ToolCard({ t, onPick, big }: { t: Tool; onPick: () => void; big?: boolean }) {
  return (
    <Link
      to={t.to}
      onClick={onPick}
      className={cn(
        "dash-glass flex min-w-0 items-center gap-3 rounded-2xl border border-border p-3 transition-transform active:scale-[0.98]",
        big && "col-span-2 p-4",
      )}
    >
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", t.tint)}>
        <t.icon className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold">{t.label}</span>
        <span className="block truncate text-xs text-muted-foreground">{t.desc}</span>
      </span>
    </Link>
  );
}

export function MobileNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [more, setMore] = useState(false);
  const [add, setAdd] = useState(false);
  const { theme, toggle } = useTheme();
  const close = () => { setMore(false); setAdd(false); };

  const tab = (to: string, label: string, Icon: typeof BookOpen) => {
    const active = pathname === to || pathname.startsWith(`${to}/`);
    return (
      <li>
        <Link
          to={to}
          aria-current={active ? "page" : undefined}
          className={cn("flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold", active ? "text-primary" : "text-muted-foreground")}
        >
          <Icon className="size-5" />
          {label}
        </Link>
      </li>
    );
  };

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/90 backdrop-blur-xl lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ToolsMascot pathname={pathname} onOpen={() => setMore(true)} />
        <ul className="grid grid-cols-5 items-end">
          {tab("/dashboard", "Home", LayoutDashboard)}
          {tab("/calendar", "Calendar", CalendarDays)}
          <li className="flex justify-center">
            <button
              type="button"
              onClick={() => setAdd(true)}
              aria-label="Quick add"
              className="-mt-6 mb-2 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_0_24px_var(--primary)] ring-4 ring-background"
            >
              <Plus className="size-7" />
            </button>
          </li>
          {tab("/classes", "Classes", BookOpen)}
          <li>
            <button
              type="button"
              onClick={() => setMore(true)}
              className={cn("flex w-full flex-col items-center gap-1 py-2.5 text-[11px] font-semibold", more ? "text-primary" : "text-muted-foreground")}
            >
              <MoreHorizontal className="size-5" />
              More
            </button>
          </li>
        </ul>
      </nav>

      <Sheet open={add} onOpenChange={setAdd}>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-3xl pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
          <SheetHeader><SheetTitle>Quick start</SheetTitle></SheetHeader>
          <div className="grid grid-cols-2 gap-2.5 px-4">
            {QUICK.map((t, i) => <ToolCard key={t.label} t={t} onPick={close} big={i === 0} />)}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={more} onOpenChange={setMore}>
        <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto rounded-t-3xl pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
          <SheetHeader><SheetTitle>Everything in SyllabusStudy</SheetTitle></SheetHeader>
          <div className="space-y-5 px-4">
            <Link
              to="/snapquick"
              onClick={close}
              className="flex items-center gap-3 rounded-2xl border border-primary/40 bg-primary/15 p-4 shadow-[0_0_20px_color-mix(in_oklab,var(--primary)_30%,transparent)]"
            >
              <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Camera className="size-5" /></span>
              <span><span className="block font-display font-bold">SnapQuick</span><span className="block text-xs text-muted-foreground">Snap a problem, learn every step</span></span>
            </Link>
            {SECTIONS.map((s) => (
              <div key={s.label}>
                <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">{s.label}</p>
                <div className="grid grid-cols-2 gap-2.5">
                  {s.items.map((t) => <ToolCard key={t.to} t={t} onPick={close} />)}
                </div>
              </div>
            ))}
            <button type="button" onClick={toggle} className="dash-glass flex w-full items-center gap-3 rounded-2xl border border-border p-3 text-sm font-bold">
              {theme === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
