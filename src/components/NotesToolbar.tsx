import { useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, CheckSquare, Highlighter, ImagePlus, IndentDecrease, IndentIncrease, Italic, Link2, List, ListOrdered, Minus, Plus, Redo2, Strikethrough, Table2, Trash2, Underline, Undo2, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";

function Tool({ label, icon: Icon, active, disabled, onClick }: { label: string; icon: LucideIcon; active?: boolean; disabled?: boolean; onClick: () => void }) {
  return <Tooltip><TooltipTrigger asChild><Button type="button" size="icon" variant={active ? "secondary" : "ghost"} className="size-9 shrink-0" aria-label={label} aria-pressed={active} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={onClick}><Icon className="size-4" /></Button></TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>;
}

const SWATCHES = [
  { name: "Default", token: "foreground", className: "bg-foreground" },
  { name: "Blue", token: "info", className: "bg-info" },
  { name: "Teal", token: "success", className: "bg-success" },
  { name: "Amber", token: "warning", className: "bg-warning" },
  { name: "Rose", token: "destructive", className: "bg-destructive" },
  { name: "Violet", token: "primary", className: "bg-primary" },
];

export function NotesToolbar({ editor }: { editor: Editor }) {
  const imageInput = useRef<HTMLInputElement>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [linkError, setLinkError] = useState("");

  async function insertImage(file?: File) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type) || file.size > 2 * 1024 * 1024) {
      toast.error("Choose a PNG, JPG, WebP, or GIF under 2 MB."); return;
    }
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === "string") editor.chain().focus().setImage({ src: reader.result, alt: file.name }).run(); };
    reader.onerror = () => toast.error("This image couldn't be opened.");
    reader.readAsDataURL(file);
  }

  function applyLink() {
    try {
      const parsed = new URL(url);
      if (!["https:", "http:", "mailto:"].includes(parsed.protocol)) throw new Error();
      if (editor.state.selection.empty && !editor.isActive("link")) {
        editor.chain().focus().insertContent({ type: "text", text: url, marks: [{ type: "link", attrs: { href: parsed.href } }] }).run();
      } else editor.chain().focus().extendMarkRange("link").setLink({ href: parsed.href }).run();
      setLinkOpen(false);
    } catch { setLinkError("Enter a full https:// link or a mailto: address."); }
  }

  return <TooltipProvider delayDuration={250}>
    <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-card/80 p-2" role="toolbar" aria-label="Document formatting">
      <Tool label="Undo" icon={Undo2} disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()} />
      <Tool label="Redo" icon={Redo2} disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()} />
      <span className="mx-1 h-5 border-l border-border" />
      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="sm" className="min-w-24">{editor.isActive("heading", { level: 1 }) ? "Heading 1" : editor.isActive("heading", { level: 2 }) ? "Heading 2" : editor.isActive("heading", { level: 3 }) ? "Heading 3" : "Paragraph"}</Button></DropdownMenuTrigger><DropdownMenuContent>
        <DropdownMenuItem onSelect={() => editor.chain().focus().setParagraph().run()}>Paragraph</DropdownMenuItem>
        {([1, 2, 3] as const).map(level => <DropdownMenuItem key={level} onSelect={() => editor.chain().focus().toggleHeading({ level }).run()}>Heading {level}</DropdownMenuItem>)}
      </DropdownMenuContent></DropdownMenu>
      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="sm" aria-label="Text size">{editor.getAttributes("textStyle")['fontSize']?.replace("px", "") || "16"}</Button></DropdownMenuTrigger><DropdownMenuContent>{[12, 14, 16, 18, 20, 24, 32].map(size => <DropdownMenuItem key={size} onSelect={() => editor.chain().focus().setFontSize(`${size}px`).run()}>{size}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>
      <Tool label="Bold" icon={Bold} active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} />
      <Tool label="Italic" icon={Italic} active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} />
      <Tool label="Underline" icon={Underline} active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()} />
      <Tool label="Strikethrough" icon={Strikethrough} active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()} />
      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-9" aria-label="Text color"><span className="font-bold underline decoration-primary decoration-4">A</span></Button></DropdownMenuTrigger><DropdownMenuContent className="flex gap-1 p-2">{SWATCHES.map(s => <Tooltip key={s.token}><TooltipTrigger asChild><Button size="icon" variant="ghost" aria-label={`${s.name} text`} onClick={() => editor.chain().focus().setColor(`var(--${s.token})`).run()}><span className={`size-5 rounded-full border border-border ${s.className}`} /></Button></TooltipTrigger><TooltipContent>{s.name}</TooltipContent></Tooltip>)}</DropdownMenuContent></DropdownMenu>
      <Tool label="Highlight" icon={Highlighter} active={editor.isActive("highlight")} onClick={() => editor.chain().focus().toggleHighlight({ color: "var(--warning)" }).run()} />
      <span className="mx-1 h-5 border-l border-border" />
      <Tool label="Bullet list" icon={List} active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} />
      <Tool label="Numbered list" icon={ListOrdered} active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
      <Tool label="Checklist" icon={CheckSquare} active={editor.isActive("taskList")} onClick={() => editor.chain().focus().toggleTaskList().run()} />
      <Tool label="Increase indent" icon={IndentIncrease} disabled={!editor.can().sinkListItem(editor.isActive("taskList") ? "taskItem" : "listItem")} onClick={() => editor.chain().focus().sinkListItem(editor.isActive("taskList") ? "taskItem" : "listItem").run()} />
      <Tool label="Decrease indent" icon={IndentDecrease} disabled={!editor.can().liftListItem(editor.isActive("taskList") ? "taskItem" : "listItem")} onClick={() => editor.chain().focus().liftListItem(editor.isActive("taskList") ? "taskItem" : "listItem").run()} />
      <DropdownMenu><DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="size-9" aria-label="Text alignment"><AlignLeft className="size-4" /></Button></DropdownMenuTrigger><DropdownMenuContent>{[{ name: "Left", value: "left", icon: AlignLeft }, { name: "Center", value: "center", icon: AlignCenter }, { name: "Right", value: "right", icon: AlignRight }, { name: "Justify", value: "justify", icon: AlignJustify }].map(a => <DropdownMenuItem key={a.value} onSelect={() => editor.chain().focus().setTextAlign(a.value).run()}><a.icon className="size-4" />{a.name}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>
      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="sm"><Plus className="size-4" />Insert</Button></DropdownMenuTrigger><DropdownMenuContent>
        <DropdownMenuItem onSelect={() => imageInput.current?.click()}><ImagePlus className="size-4" />Image</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => { setUrl(editor.getAttributes("link")['href'] || ""); setLinkError(""); setLinkOpen(true); }}><Link2 className="size-4" />Link</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => editor.chain().focus().setHorizontalRule().run()}><Minus className="size-4" />Divider</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><Table2 className="size-4" />Table</DropdownMenuItem>
      </DropdownMenuContent></DropdownMenu>
      {editor.isActive("table") && <DropdownMenu><DropdownMenuTrigger asChild><Button variant="secondary" size="sm"><Table2 className="size-4" />Table</Button></DropdownMenuTrigger><DropdownMenuContent>
        <DropdownMenuItem onSelect={() => editor.chain().focus().addRowAfter().run()}>Add row</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => editor.chain().focus().addColumnAfter().run()}>Add column</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => editor.chain().focus().deleteRow().run()}>Delete row</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => editor.chain().focus().deleteColumn().run()}>Delete column</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => editor.chain().focus().deleteTable().run()}><Trash2 className="size-4" />Delete table</DropdownMenuItem>
      </DropdownMenuContent></DropdownMenu>}
    </div>
    <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" aria-label="Insert image" onChange={e => { void insertImage(e.target.files?.[0]); e.target.value = ""; }} />
    <Dialog open={linkOpen} onOpenChange={setLinkOpen}><DialogContent><DialogHeader><DialogTitle>Insert link</DialogTitle></DialogHeader><Input aria-label="Link address" placeholder="https://" value={url} onChange={e => setUrl(e.target.value)} />{linkError && <p className="text-sm text-destructive">{linkError}</p>}<DialogFooter>{editor.isActive("link") && <Button variant="outline" onClick={() => { editor.chain().focus().unsetLink().run(); setLinkOpen(false); }}>Remove link</Button>}<Button onClick={applyLink}>Apply</Button></DialogFooter></DialogContent></Dialog>
  </TooltipProvider>;
}