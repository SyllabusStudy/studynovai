import { BrandLogo } from "@/components/BrandLogo";
import { useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  BookOpen,
  Bot,
  Camera,
  Crown,
  Brain,
  CalendarDays,
  CheckSquare,
  ChartColumn,
  FileQuestion,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  Search,
  Settings,
  Sparkles,
  Sun,
  Bell,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { signOut, useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { daysUntil, formatDate, relativeDay, urgencyDot, useAssignments, useEvents, useProfile } from "@/lib/data";
import { useReminderEngine } from "@/lib/reminders";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, GraduationCap, Image as ImageIcon, ScanSearch, ShieldCheck, Video } from "lucide-react";
import { checkAdmin } from "@/lib/admin.functions";
import { AskAiDock } from "@/components/AskAiDock";
import { GlobalSearch } from "@/components/GlobalSearch";


type NavItem = { to: string; label: string; icon: typeof BookOpen; tint?: string };
const GROUPS: { key: string; label: string; collapsible: boolean; items: NavItem[] }[] = [
  {
    key: "primary",
    label: "Primary",
    collapsible: false,
    items: [
      { to: "/dashboard", label: "Home", icon: LayoutDashboard },
      { to: "/classes", label: "My Classes", icon: BookOpen },
      { to: "/calendar", label: "Calendar", icon: CalendarDays },
      { to: "/assignments", label: "Assignments", icon: CheckSquare },
      { to: "/grades", label: "Grades", icon: ChartColumn },
    ],
  },
  {
    key: "study",
    label: "Study",
    collapsible: true,
    items: [
      { tint: "text-feature-flashcards", to: "/flashcards", label: "Flashcards", icon: Brain },
      { tint: "text-feature-quiz", to: "/quizzes", label: "Quizzes", icon: FileQuestion },
      { tint: "text-feature-ai", to: "/tutor", label: "AI Tutor", icon: Bot },
    ],
  },
  {
    key: "tools",
    label: "Tools",
    collapsible: true,
    items: [
      { tint: "text-feature-ai", to: "/snapquick", label: "SnapQuick", icon: Camera },
      { tint: "text-feature-video", to: "/quickvideo", label: "QuickVideo", icon: Video },
      { to: "/studio", label: "AI Images", icon: ImageIcon },
      { to: "/ai-checker", label: "AI Checker", icon: ScanSearch },
    ],
  },
  {
    key: "resources",
    label: "Resources",
    collapsible: false,
    items: [{ to: "/school", label: "School Links", icon: GraduationCap }],
  },
];
const BOTTOM: NavItem[] = [
  { to: "/feedback", label: "Feedback", icon: MessageSquare },
  { to: "/settings", label: "Settings", icon: Settings },
  { to: "/upgrade", label: "Upgrade", icon: Crown },
];

const MOBILE_NAV: NavItem[] = [
  GROUPS[0]!.items[0]!,
  GROUPS[0]!.items[1]!,
  GROUPS[0]!.items[3]!,
  GROUPS[2]!.items[0]!,
  GROUPS[1]!.items[2]!,
];

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-56 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <BrandBlock />
        <NavList pathname={pathname} />
        <SidebarFooter />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 bg-sidebar p-0">
          <BrandBlock />
          <NavList pathname={pathname} onNavigate={() => setMobileOpen(false)} compact />
          <SidebarFooter />
        </SheetContent>
      </Sheet>

      <div className="lg:pl-56">
        <TopBar onMenu={() => setMobileOpen(true)} onSearch={() => setSearchOpen(true)} />
        <main className="magazine-canvas mx-auto w-full max-w-[90rem] px-4 pb-28 pt-7 sm:px-8 lg:pb-16 lg:pt-10 xl:px-12">{children}</main>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="grid grid-cols-5">
          {MOBILE_NAV.map((item) => {
            const active = pathname.startsWith(item.to);
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className={cn(
                    "flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold transition-colors",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-9 items-center justify-center rounded-xl transition-colors",
                      active ? "bg-primary/12" : "bg-transparent",
                    )}
                  >
                    <item.icon className="size-5" />
                  </span>
                  {item.label.replace("My ", "")}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <AskAiDock />
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}

function BrandBlock() {
  return (
    <div className="flex h-20 items-center gap-3 border-b border-sidebar-border px-4">
      <BrandLogo className="size-10" />
      <span className="leading-tight text-sidebar-foreground">
        <span className="block font-display text-base font-extrabold">StudyNova</span>
        <span className="block text-[11px] text-sidebar-foreground/60">Your semester, made simple.</span>
      </span>
    </div>
  );
}

function NavLink({ item, pathname, onNavigate }: { item: NavItem; pathname: string; onNavigate?: (() => void) | undefined }) {
  const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
  return (
    <li>
      <Link
        to={item.to}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
          active
            ? "bg-sidebar-primary/15 text-sidebar-primary"
            : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        )}
      >
        <item.icon className={cn("size-4.5", !active && item.tint)} />
        {item.label}
      </Link>
    </li>
  );
}

function NavList({ pathname, onNavigate, compact }: { pathname: string; onNavigate?: () => void; compact?: boolean }) {
  const { user } = useAuth();
  const check = useServerFn(checkAdmin);
  const { data: adminInfo } = useQuery({
    queryKey: ["is-admin", user?.id],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    queryFn: () => check({}),
  });
  const inGroup = (key: string) =>
    GROUPS.find((g) => g.key === key)?.items.some((i) => pathname.startsWith(i.to)) ?? false;
  const [closed, setClosed] = useState<Record<string, boolean>>(() =>
    compact ? { study: !inGroup("study"), tools: !inGroup("tools") } : {},
  );
  const [moreOpen, setMoreOpen] = useState(false);
  const bottom = adminInfo?.admin
    ? [...BOTTOM, { to: "/admin", label: "Admin", icon: ShieldCheck }]
    : BOTTOM;
  return (
    <nav className="flex flex-1 flex-col overflow-y-auto px-3 py-4 scroll-slim">
      <div className="flex-1 space-y-5">
        {GROUPS.map((g) => {
          const isClosed = g.collapsible && closed[g.key];
          return (
            <div key={g.key}>
              {g.key === "primary" ? null : g.collapsible ? (
                <button
                  type="button"
                  data-tour-group={g.key}
                  onClick={() => setClosed((c) => ({ ...c, [g.key]: !c[g.key] }))}
                  aria-expanded={!isClosed}
                  className="mb-1.5 flex w-full items-center justify-between px-3 text-[11px] font-extrabold uppercase tracking-wider text-sidebar-foreground/50 hover:text-sidebar-foreground"
                >
                  {g.label}
                  <ChevronDown className={cn("size-3.5 transition-transform", isClosed && "-rotate-90")} />
                </button>
              ) : (
                <p className="mb-1.5 px-3 text-[11px] font-extrabold uppercase tracking-wider text-sidebar-foreground/50">
                  {g.label}
                </p>
              )}
              {isClosed ? null : (
                <ul className="space-y-0.5">
                  {g.items.map((item) => (
                    <NavLink key={item.to} item={item} pathname={pathname} onNavigate={onNavigate} />
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-5 border-t border-sidebar-border pt-4">
        {compact ? (
          <button
            type="button"
            onClick={() => setMoreOpen((o) => !o)}
            aria-expanded={moreOpen}
            className="mb-1.5 flex w-full items-center justify-between px-3 text-[11px] font-extrabold uppercase tracking-wider text-sidebar-foreground/50 hover:text-sidebar-foreground"
          >
            More
            <ChevronDown className={cn("size-3.5 transition-transform", !moreOpen && "-rotate-90")} />
          </button>
        ) : null}
        {!compact || moreOpen ? (
          <ul className="space-y-0.5">
            {bottom.map((item) => (
              <NavLink key={item.to} item={item} pathname={pathname} onNavigate={onNavigate} />
            ))}
          </ul>
        ) : null}
      </div>
    </nav>
  );
}

function SidebarFooter() {
  const { theme, toggle } = useTheme();
  return (
    <div className="border-t border-sidebar-border p-3">
      <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={toggle}>
        {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        {theme === "dark" ? "Light mode" : "Dark mode"}
      </Button>
    </div>
  );
}

function TopBar({ onMenu, onSearch }: { onMenu: () => void; onSearch: () => void }) {
  const { user } = useAuth();
  const { data: profile } = useProfile(user?.id);
  const navigate = useNavigate();
  const initials = (profile?.name ?? user?.email ?? "S").slice(0, 1).toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur sm:px-8 xl:px-12">
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0 lg:hidden"
        onClick={onMenu}
        aria-label="Open menu"
      >
        <Menu className="size-5" />
      </Button>

      <Button
        variant="outline"
        onClick={onSearch}
        className="h-10 min-w-0 flex-1 max-w-md justify-start gap-2 rounded-lg bg-card px-3 text-sm font-normal text-muted-foreground shadow-none hover:border-primary/50 hover:bg-card hover:text-foreground"
      >
        <Search className="size-4 shrink-0" />
        <span className="truncate">Search classes, notes, deadlines…</span>
        <span className="ml-auto hidden rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-bold sm:inline">⌘ K</span>
      </Button>

      <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
        <NotificationBell />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="shrink-0" aria-label="Profile menu">
              <Avatar className="size-8">
                <AvatarFallback className="bg-secondary text-xs font-semibold text-secondary-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="truncate">
              {profile?.name ?? "Student"}
              <span className="block text-xs font-normal text-muted-foreground">{user?.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate({ to: "/settings" })}>
              <Settings className="size-4" /> Settings
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate({ to: "/feedback" })}>
              <MessageSquare className="size-4" /> Feedback
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={async () => {
                await signOut();
                navigate({ to: "/auth" });
              }}
            >
              <LogOut className="size-4" /> Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

function NotificationBell() {
  const { user } = useAuth();
  const { data: assignments = [] } = useAssignments(user?.id);
  const { data: events = [] } = useEvents(user?.id);
  const { data: profile } = useProfile(user?.id);
  useReminderEngine(user?.id, assignments, events, profile);

  const items = [
    ...assignments
      .filter((a) => a.status !== "completed" && a.due_date)
      .map((a) => ({
        id: a.id,
        title: a.title,
        date: a.due_date,
        kind: "Assignment",
        reminder: Math.ceil((a.reminder_minutes ?? 1440) / 1440),
      })),
    ...events.map((e) => ({
      id: e.id,
      title: e.title,
      date: e.event_date,
      kind: e.event_type,
      reminder: Math.ceil((e.reminder_minutes ?? 1440) / 1440),
    })),
  ]
    .filter((i) => {
      const d = daysUntil(i.date);
      return d !== null && d >= -7 && d <= Math.max(i.reminder, 3);
    })
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""))
    .slice(0, 8);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Notifications" className="relative">
          <Bell className="size-5" />
          {items.length ? (
            <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-destructive" />
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b border-border px-4 py-3 text-sm font-semibold">Reminders</div>
        {items.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">You're all caught up. Nothing due soon.</p>
        ) : (
          <ul className="max-h-80 divide-y divide-border overflow-y-auto scroll-slim">
            {items.map((i) => (
              <li key={`${i.kind}-${i.id}`} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{i.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {i.kind} · {formatDate(i.date)}
                    </p>
                  </div>
                  <span className={cn("shrink-0 text-xs font-semibold", urgencyDot(daysUntil(i.date)))}>
                    {relativeDay(i.date)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function InlineCloseButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="icon" onClick={onClick} aria-label="Close">
      <X className="size-4" />
    </Button>
  );
}

export { Input };
