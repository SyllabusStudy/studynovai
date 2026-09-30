import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { BookOpen, Bot, Brain, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useActiveClass } from "@/lib/active-class";
import { cn } from "@/lib/utils";

/** "📚 Biology — What do you want to study?" with working shortcuts for the active class. */
export function ClassActionBar({ className, hide }: { className?: string; hide?: Array<"quiz" | "flashcards" | "tutor"> }) {
  const { activeClass, classes, setActiveClassId } = useActiveClass();
  const [picking, setPicking] = useState(false);

  if (classes.length === 0) return null;

  const picker = (
    <Select
      value={activeClass?.id ?? ""}
      onValueChange={(v) => {
        void setActiveClassId(v);
        setPicking(false);
      }}
    >
      <SelectTrigger className="h-9 w-full sm:w-64" aria-label="Choose a class">
        <SelectValue placeholder="Choose a class" />
      </SelectTrigger>
      <SelectContent>
        {classes.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.class_name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  if (!activeClass) {
    return (
      <section className={cn("surface-card mb-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between", className)}>
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-primary/15 text-primary">
            <BookOpen className="size-5" />
          </span>
          <div>
            <p className="font-display font-bold">Which class are you studying?</p>
            <p className="text-sm text-muted-foreground">Pick one and SyllableStudy remembers it everywhere.</p>
          </div>
        </div>
        {picker}
      </section>
    );
  }

  const actions = [
    { key: "quiz" as const, to: "/quizzes" as const, label: "Make Quiz", icon: ListChecks },
    { key: "flashcards" as const, to: "/flashcards" as const, label: "Make Flashcards", icon: Brain },
    { key: "tutor" as const, to: "/tutor" as const, label: "Ask AI", icon: Bot },
  ].filter((a) => !hide?.includes(a.key));

  return (
    <section className={cn("surface-card mb-6 p-4 sm:p-5", className)}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="grid size-10 shrink-0 place-items-center rounded-xl text-lg"
            style={{ backgroundColor: `color-mix(in oklab, ${activeClass.color} 22%, transparent)` }}
            aria-hidden="true"
          >
            📚
          </span>
          <div className="min-w-0">
            <p className="truncate font-display text-lg font-bold">{activeClass.class_name}</p>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>What do you want to study?</span>
              <button
                type="button"
                className="font-semibold text-primary underline-offset-2 hover:underline"
                onClick={() => setPicking((p) => !p)}
              >
                Change class
              </button>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {actions.map((a) => (
            <Button key={a.key} asChild size="sm" variant={a.key === "quiz" ? "default" : "secondary"}>
              <Link to={a.to}>
                <a.icon className="size-4" /> {a.label}
              </Link>
            </Button>
          ))}
        </div>
      </div>
      {picking ? <div className="mt-3">{picker}</div> : null}
    </section>
  );
}
