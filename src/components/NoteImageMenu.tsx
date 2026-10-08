import type { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { AlignCenter, AlignLeft, AlignRight, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

const SIZES = [25, 50, 75, 100];

/** Floating controls shown when a picture in a note is clicked: size, alignment, delete. */
export function NoteImageMenu({ editor }: { editor: Editor }) {
  const attrs = editor.getAttributes("image") as { width?: number | null; align?: string };
  const set = (a: Record<string, unknown>) => editor.chain().focus(undefined, { scrollIntoView: false }).updateAttributes("image", a).run();
  const btn = "flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-xs font-semibold transition-colors hover:bg-muted";
  return (
    <BubbleMenu editor={editor} shouldShow={({ editor: e }) => e.isActive("image")} options={{ placement: "top" }}>
      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-card">
        {SIZES.map((s) => (
          <button key={s} type="button" className={cn(btn, (attrs.width ?? 100) === s && "bg-primary/15 text-primary")} onClick={() => set({ width: s === 100 ? null : s })} aria-label={`Make picture ${s}% wide`}>
            {s}%
          </button>
        ))}
        <input
          type="range" min={10} max={100} step={5} value={attrs.width ?? 100}
          onChange={(e) => set({ width: Number(e.target.value) >= 100 ? null : Number(e.target.value) })}
          className="mx-1 w-20 accent-primary" aria-label="Picture size"
        />
        <span className="mx-1 h-5 w-px bg-border" />
        {([["left", AlignLeft], ["center", AlignCenter], ["right", AlignRight]] as const).map(([a, Icon]) => (
          <button key={a} type="button" className={cn(btn, (attrs.align ?? "left") === a && "bg-primary/15 text-primary")} onClick={() => set({ align: a })} aria-label={`Align picture ${a}`}>
            <Icon className="size-4" />
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-border" />
        <button type="button" className={cn(btn, "text-destructive")} onClick={() => editor.chain().focus().deleteSelection().run()} aria-label="Delete picture">
          <Trash2 className="size-4" />
        </button>
      </div>
    </BubbleMenu>
  );
}
