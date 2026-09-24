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
import { GraduationCap, Image as ImageIcon, ShieldCheck, Video } from "lucide-react";
import { checkAdmin } from "@/lib/admin.functions";
import { AskAiDock } from "@/components/AskAiDock";
import { GlobalSearch } from "@/components/GlobalSearch";


const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/classes", label: "My Classes", icon: BookOpen },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/assignments", label: "Assignments", icon: CheckSquare },
  { to: "/flashcards", label: "Flashcards", icon: Brain },
  { to: "/quizzes", label: "Quizzes", icon: FileQuestion },
  { to: "/grades", label: "Grades", icon: ChartColumn },
  { to: "/tutor", label: "AI Tutor", icon: Bot },
  { to: "/snapquick", label: "SnapQuick", icon: Camera },
  { to: "/quickvideo", label: "QuickVideo", icon: Video },
  { to: "/studio", label: "AI Images", icon: ImageIcon },
  { to: "/school", label: "School links", icon: GraduationCap },
  { to: "/upgrade", label: "Upgrade", icon: Crown },
  { to: "/feedback", label: "Feedback", icon: MessageSquare },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

const MOBILE_NAV = [NAV[0], NAV[1], NAV[3], NAV[8], NAV[7]] as const;

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
          <NavList pathname={pathname} onNavigate={() => setMobileOpen(false)} />
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
                    "flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition-colors",
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
      <span className="flex size-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shadow-card">
        <Sparkles className="size-5" />
      </span>
      <span className="leading-tight">
        <span className="block font-display text-sm font-extrabold">StudyMate AI</span>
        <span className="block text-[10px] font-bold uppercase text-sidebar-foreground/55">Campus edition</span>
      </span>
    </div>
  );
}

function NavList({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const { user } = useAuth();
  const check = useServerFn(checkAdmin);
  const { data: adminInfo } = useQuery({
    queryKey: ["is-admin", user?.id],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    queryFn: () => check({}),
  });
  const items = adminInfo?.admin
    ? [...NAV, { to: "/admin", label: "Owner stats", icon: ShieldCheck } as const]
    : NAV;
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-5 scroll-slim">
      <p className="mb-3 px-3 text-[10px] font-extrabold uppercase text-sidebar-foreground/45">Your desk</p>
      <ul className="space-y-0.5">
        {items.map((item) => {

          const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
          return (
            <li key={item.to}>
              <Link
                to={item.to}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-all",
                  active
                    ? "bg-sidebar-primary/15 text-sidebar-primary shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-sidebar-primary),transparent_70%)]"
                    : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <item.icon className="size-4.5" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
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
