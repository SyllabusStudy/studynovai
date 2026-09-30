import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Brain,
  Calculator,
  FileQuestion,
  Layers,
  Mic,
  ScanSearch,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/* ---------------------------------- gate --------------------------------- */

function AuthGate({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            You&apos;re one step away <Sparkles className="size-5 text-primary" />
          </DialogTitle>
          <DialogDescription>
            Create a free account to see your full results — and keep every quiz, deck and note saved
            across your devices.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <Button asChild className="flex-1 gap-2">
            <Link to="/auth" search={{ mode: "signup" }}>
              Create free account <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" className="flex-1">
            <Link to="/auth" search={{ mode: "login" }}>
              Log in
            </Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------------- shell -------------------------------- */

function ToolCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Brain;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <article className="surface-card group flex flex-col gap-3 p-5 transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-[var(--shadow-pop)]">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary transition-colors group-hover:bg-primary/15">
          <Icon className="size-5" />
        </span>
        <div>
          <h3 className="text-base font-bold tracking-tight">{title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="mt-1 flex flex-1 flex-col justify-end gap-3">{children}</div>
    </article>
  );
}

function CardAction({
  label,
  onClick,
  variant = "default",
}: {
  label: string;
  onClick: () => void;
  variant?: "default" | "outline" | "secondary";
}) {
  return (
    <Button size="sm" variant={variant} className="w-full justify-center gap-1.5" onClick={onClick}>
      {label}
      <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
    </Button>
  );
}

/* ---------------------------------- cards -------------------------------- */

const SAMPLE_NOTES =
  "The cell membrane is a phospholipid bilayer that controls what enters and leaves the cell. " +
  "Osmosis is the movement of water across that membrane toward the higher solute concentration. " +
  "Active transport uses ATP to move molecules against their gradient.";

const DEMO_QUESTIONS = [
  "What structure controls what enters and leaves the cell?",
  "In osmosis, which direction does water move?",
  "Which transport type requires ATP?",
];

function QuizCard({ gate }: { gate: () => void }) {
  const [notes, setNotes] = useState("");
  const [shown, setShown] = useState(false);

  return (
    <ToolCard
      icon={Brain}
      title="Make a quiz from your notes"
      description="Paste your notes and let AI turn them into a practice quiz."
    >
      {!shown ? (
        <>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Paste a few lines of your notes…"
            rows={3}
            className="resize-none text-sm"
          />
          <button
            type="button"
            className="self-start text-xs font-semibold text-primary hover:underline"
            onClick={() => setNotes(SAMPLE_NOTES)}
          >
            Use sample notes
          </button>
          <CardAction label="Try it" onClick={() => setShown(true)} />
        </>
      ) : (
        <>
          <ol className="space-y-2 text-sm">
            {DEMO_QUESTIONS.map((q, i) => (
              <li key={q} className="rounded-xl border border-border bg-secondary/50 p-2.5">
                <span className="font-semibold text-primary">{i + 1}.</span> {q}
                <span className="mt-1 block text-xs text-muted-foreground">Answer hidden</span>
              </li>
            ))}
          </ol>
          <CardAction label="Reveal answers" onClick={gate} />
        </>
      )}
    </ToolCard>
  );
}

function LectureCard({ gate }: { gate: () => void }) {
  return (
    <ToolCard
      icon={Mic}
      title="Turn your lecture into notes"
      description="Record or upload a lecture and get organized study notes."
    >
      <div className="rounded-xl border border-border bg-secondary/50 p-3 text-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Sample lecture · 48 min
        </p>
        <ul className="mt-2 space-y-1.5 text-muted-foreground">
          <li>• Three drivers of inflation, with the 1970s example</li>
          <li>• How central banks use interest rates</li>
          <li>• Exam hint: know the difference from deflation</li>
        </ul>
      </div>
      <CardAction label="Record my lecture" onClick={gate} />
    </ToolCard>
  );
}

function FlashcardCard({ gate }: { gate: () => void }) {
  const [flipped, setFlipped] = useState(false);
  return (
    <ToolCard
      icon={Layers}
      title="Make flashcards instantly"
      description="Turn your notes or study materials into flashcards in seconds."
    >
      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        className={cn(
          "flex h-28 w-full flex-col items-center justify-center rounded-xl border border-border px-4 text-center text-sm font-semibold transition-colors",
          flipped ? "bg-primary/10 text-primary" : "bg-secondary/50",
        )}
      >
        {flipped ? "Mitochondria" : "What is the powerhouse of the cell?"}
        <span className="mt-2 text-xs font-medium text-muted-foreground">
          {flipped ? "Tap to flip back" : "Tap to flip"}
        </span>
      </button>
      <CardAction label="Create my flashcards" onClick={gate} />
    </ToolCard>
  );
}

const SAMPLE_ESSAY =
  "In today's rapidly evolving world, it is important to note that technology plays a crucial role " +
  "in shaping society. Furthermore, it can be argued that these developments have fundamentally " +
  "transformed the way in which individuals communicate with one another.";

function AiCheckerCard({ gate }: { gate: () => void }) {
  const [text, setText] = useState("");
  const [checked, setChecked] = useState(false);

  return (
    <ToolCard
      icon={ScanSearch}
      title="AI checker & humanizer"
      description="See how AI-written your draft looks, then make it sound like you."
    >
      {!checked ? (
        <>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste a paragraph from your draft…"
            rows={3}
            className="resize-none text-sm"
          />
          <button
            type="button"
            className="self-start text-xs font-semibold text-primary hover:underline"
            onClick={() => setText(SAMPLE_ESSAY)}
          >
            Use sample text
          </button>
          <CardAction label="Check" onClick={() => setChecked(true)} />
        </>
      ) : (
        <>
          <div className="rounded-xl border border-border bg-secondary/50 p-3 text-sm">
            <p className="font-bold text-destructive">82% likely AI-written</p>
            <p className="mt-1.5 text-muted-foreground">
              Flagged: <span className="text-foreground">“it is important to note that”</span>,{" "}
              <span className="text-foreground">“the way in which”</span> — common AI filler phrasing.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button size="sm" variant="outline" className="flex-1" onClick={() => setChecked(false)}>
              Check again
            </Button>
            <Button size="sm" className="flex-1 gap-1.5" onClick={gate}>
              <Sparkles className="size-3.5" /> Humanize
            </Button>
          </div>
        </>
      )}
    </ToolCard>
  );
}

function AskMaterialsCard({ gate }: { gate: () => void }) {
  const [q, setQ] = useState("");
  return (
    <ToolCard
      icon={FileQuestion}
      title="Ask your course materials"
      description="Upload your class materials and ask questions about them."
    >
      <div className="space-y-2 rounded-xl border border-border bg-secondary/50 p-3 text-sm">
        <p className="font-semibold">“What are the three main concepts from this chapter?”</p>
        <p className="text-muted-foreground">
          Chapter 4 covers supply and demand equilibrium, price elasticity, and consumer surplus —
          pages 88, 94 and 101 of your reading.
        </p>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          gate();
        }}
      >
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ask your own question…"
          className="text-sm"
        />
        <Button type="submit" size="sm">
          Ask AI
        </Button>
      </form>
    </ToolCard>
  );
}

function GradeCard() {
  const [current, setCurrent] = useState("88");
  const [target, setTarget] = useState("90");
  const [weight, setWeight] = useState("25");

  const c = Number(current);
  const t = Number(target);
  const w = Number(weight);
  const valid = [c, t, w].every((n) => Number.isFinite(n)) && w > 0 && w <= 100;
  const needed = valid ? (t - c * (1 - w / 100)) / (w / 100) : null;

  return (
    <ToolCard
      icon={Calculator}
      title="Calculate your grade"
      description="See what you need on your next exam or assignment."
    >
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Current %", value: current, set: setCurrent },
          { label: "Goal %", value: target, set: setTarget },
          { label: "Weight %", value: weight, set: setWeight },
        ].map((f) => (
          <label key={f.label} className="text-xs font-semibold text-muted-foreground">
            {f.label}
            <Input
              inputMode="decimal"
              value={f.value}
              onChange={(e) => f.set(e.target.value)}
              className="mt-1 h-9 text-sm"
            />
          </label>
        ))}
      </div>
      <div className="rounded-xl border border-border bg-secondary/50 p-3 text-sm">
        {needed === null ? (
          <p className="text-muted-foreground">Enter your numbers to see the score you need.</p>
        ) : (
          <p>
            You need{" "}
            <span className="font-bold text-primary">{Math.max(0, needed).toFixed(1)}%</span> on it.
            {needed > 100 ? " That's above full marks — aim for extra credit." : ""}
          </p>
        )}
      </div>
      <Button asChild size="sm" variant="outline" className="w-full gap-1.5">
        <Link to="/auth" search={{ mode: "signup" }}>
          Track all your grades <ArrowRight className="size-3.5" />
        </Link>
      </Button>
    </ToolCard>
  );
}

/* --------------------------------- section -------------------------------- */

export function TryItTools() {
  const [open, setOpen] = useState(false);
  const gate = () => setOpen(true);

  return (
    <section id="try-it" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="max-w-2xl">
        <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
          Study smarter. Try it yourself.
        </h2>
        <p className="mt-2 text-sm text-muted-foreground sm:text-base">
          Explore what SyllabusStudy can do before you even sign up.
        </p>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <QuizCard gate={gate} />
        <LectureCard gate={gate} />
        <FlashcardCard gate={gate} />
        <AiCheckerCard gate={gate} />
        <AskMaterialsCard gate={gate} />
        <GradeCard />
      </div>

      <AuthGate open={open} onOpenChange={setOpen} />
    </section>
  );
}
