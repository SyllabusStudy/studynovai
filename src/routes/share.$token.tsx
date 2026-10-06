import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getSharedItem } from "@/lib/share.functions";
import { useNavigate } from "@tanstack/react-router";
import { BookOpen, FileText, HelpCircle, Save } from "lucide-react";
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle, FontSize } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { useAuth } from "@/lib/auth";
import { setPendingShare, type ShareAction } from "@/lib/pending-share";

const SITE = "https://syllabusstudy.com";
const SHARE_IMAGE = `${SITE}/share-card.jpg`;

export const Route = createFileRoute("/share/$token")({
  loader: ({ params }) => getSharedItem({ data: { token: params.token } }),
  head: ({ params, loaderData }) => {
    const item = loaderData ?? null;
    const label = item
      ? item.kind === "note"
        ? "Shared notes"
        : item.kind === "deck"
        ? `${item.count} Flashcard${item.count === 1 ? "" : "s"}`
        : `${item.count} Question${item.count === 1 ? "" : "s"}`
      : null;
    const title = item ? `${item.title} — ${label} | SyllabusStudy` : "Shared study set — SyllabusStudy";
    const description = item
      ? `Interactive study set on SyllabusStudy • Free to practice — no account needed.`
      : "A classmate shared flashcards or a quiz made with SyllabusStudy.";
    const url = `${SITE}/share/${params.token}`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
        { property: "og:type", content: "article" },
        { property: "og:image", content: SHARE_IMAGE },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: SHARE_IMAGE },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: SharePage,
});

type Card = { front: string; back: string };
type Q = { id?: string; prompt: string; options?: string[]; answer: string; explanation?: string };

function SharePage() {
  const data = Route.useLoaderData();
  const count = data?.count ?? 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-3xl items-center justify-between p-4">
        <Link to="/"><BrandLogo /></Link>
        <Button asChild size="sm"><Link to="/auth">Sign up free</Link></Button>
      </header>
      <main className="mx-auto max-w-3xl space-y-5 px-4 pb-16">
        {!data ? (
          <p className="surface-card p-6 text-center">This link doesn't exist anymore.</p>
        ) : (
          <>
            <div className="space-y-2">
              <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                {data.kind === "note" ? "Shared notes" : data.kind === "deck" ? "Flashcard deck" : "Practice quiz"} · {count}{" "}
                {data.kind === "note" ? (count === 1 ? "word" : "words") : data.kind === "deck" ? (count === 1 ? "card" : "cards") : count === 1 ? "question" : "questions"}
              </span>
              <h1 className="font-display text-2xl font-bold">{data.title}</h1>
              <p className="text-sm text-muted-foreground">Start studying right away — no account needed.</p>
            </div>
            {data.kind === "note" ? (
              <NoteView token={Route.useParams().token} text={data.payload.plainText ?? ""} />
            ) : data.kind === "deck" ? (
              <Cards cards={(data.payload.cards ?? []) as Card[]} />
            ) : (
              <Quiz questions={(data.payload.questions ?? []) as Q[]} />
            )}

            <div className="surface-card space-y-3 p-5 text-center">
              <p className="font-display text-lg font-bold">Want to make your own from your lecture notes?</p>
              <p className="text-sm text-muted-foreground">
                SyllabusStudy turns your class notes and recordings into flashcards and quizzes in seconds.
              </p>
              <Button asChild><Link to="/auth">Try free</Link></Button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}


function NoteView({ token, text, content }: { token: string; text: string; content?: JSONContent }) {
  const { user } = useAuth();
  // Read-only editor so shared notes look exactly like the owner's note:
  // bullets, checklists, underline, highlights, tables, images — but no editing.
  const editor = useEditor({
    extensions: [StarterKit.configure({ link: { openOnClick: true, protocols: ["http", "https", "mailto"] } }), TextStyle, FontSize, Color, Highlight.configure({ multicolor: true }), TextAlign.configure({ types: ["heading", "paragraph"] }), Image.configure({ allowBase64: true }), TableKit, TaskList, TaskItem.configure({ nested: true, readOnly: true })],
    content: content ?? undefined,
    editable: false,
    immediatelyRender: false,
  });
  const navigate = useNavigate();
  function go(action: ShareAction) {
    setPendingShare(token, action);
    // Signed-in students are picked up by the app right away; visitors sign up first.
    if (user) void navigate({ to: "/dashboard" });
    else void navigate({ to: "/auth", search: { mode: "signup" } as never });
  }
  const actions: Array<[ShareAction, string, typeof Save]> = [["quiz", "Make a quiz", HelpCircle], ["flashcards", "Make flashcards", BookOpen], ["save", "Save to my notes", Save]];
  return (
    <div className="space-y-4">
      <div className="surface-card space-y-3 p-4">
        <p className="text-sm font-semibold">Study these notes with AI</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {actions.map(([a, label, Icon]) => <Button key={a} variant={a === "save" ? "outline" : "default"} onClick={() => go(a)}><Icon className="size-4" />{label}</Button>)}
        </div>
        {!user && <p className="text-xs text-muted-foreground">Make a free account and these notes are copied into your own Notes.</p>}
      </div>
      <article className="surface-card p-5">
        <FileText className="mb-3 size-5 text-primary" />
        <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">{text || "This note is empty."}</div>
      </article>
    </div>
  );
}

function Cards({ cards }: { cards: Card[] }) {
  const [i, setI] = useState(0);
  const [flip, setFlip] = useState(false);
  const c = cards[i];
  if (!c) return <p className="text-sm text-muted-foreground">No cards in this deck.</p>;
  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setFlip((f) => !f)}
        className="surface-card flex min-h-52 w-full items-center justify-center p-6 text-center text-lg font-semibold"
      >
        {flip ? c.back : c.front}
      </button>
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" disabled={i === 0} onClick={() => { setI(i - 1); setFlip(false); }}>Back</Button>
        <span className="text-sm text-muted-foreground">{i + 1} / {cards.length} · tap to flip</span>
        <Button variant="outline" size="sm" disabled={i >= cards.length - 1} onClick={() => { setI(i + 1); setFlip(false); }}>Next</Button>
      </div>
    </div>
  );
}

function Quiz({ questions }: { questions: Q[] }) {
  const [picked, setPicked] = useState<Record<number, string>>({});
  const [shown, setShown] = useState<Record<number, boolean>>({});
  return (
    <ol className="space-y-3">
      {questions.map((q, n) => (
        <li key={n} className="surface-card space-y-2 p-4">
          <p className="font-semibold">{n + 1}. {q.prompt}</p>
          {q.options?.length ? (
            <div className="grid gap-2">
              {q.options.map((o) => {
                const chosen = picked[n] === o;
                const done = picked[n] != null;
                return (
                  <button
                    key={o}
                    type="button"
                    disabled={done}
                    onClick={() => setPicked({ ...picked, [n]: o })}
                    className={cn(
                      "rounded-lg border border-border p-2 text-left text-sm",
                      done && o === q.answer && "border-success bg-success/10",
                      chosen && o !== q.answer && "border-destructive bg-destructive/10",
                    )}
                  >
                    {o}
                  </button>
                );
              })}
            </div>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => setShown({ ...shown, [n]: true })}>Show answer</Button>
          )}
          {(picked[n] != null || shown[n]) && (
            <p className="text-sm text-muted-foreground"><strong>Answer:</strong> {q.answer}{q.explanation ? ` — ${q.explanation}` : ""}</p>
          )}
        </li>
      ))}
    </ol>
  );
}
