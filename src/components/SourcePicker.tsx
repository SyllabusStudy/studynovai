import { useState } from "react";
import { FileText } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Doc = { id: string; file_name: string };

export function SourcePicker({
  documents,
  selected,
  onChange,
  multiple = true,
  classPicked,
}: {
  documents: Doc[];
  selected: string[];
  onChange: (ids: string[]) => void;
  multiple?: boolean;
  classPicked: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? documents : documents.slice(0, 4);
  const hidden = documents.length - visible.length;

  function toggle(id: string) {
    if (!multiple) {
      onChange(selected[0] === id ? [] : [id]);
      return;
    }
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  }

  return (
    <div className="space-y-1.5">
      <Label>Source material</Label>
      {documents.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {classPicked ? "No uploads for this class yet." : "Pick a class to choose materials."}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Chip active={selected.length === 0} onClick={() => onChange([])}>
            All notes
          </Chip>
          {visible.map((d) => (
            <Chip key={d.id} active={selected.includes(d.id)} onClick={() => toggle(d.id)}>
              <FileText className="size-3.5 shrink-0" />
              <span className="max-w-[12rem] truncate">{d.file_name}</span>
            </Chip>
          ))}
          {hidden > 0 ? (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="rounded-full border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-primary/60 hover:text-foreground"
            >
              + {hidden} more
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        active ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary/60",
      )}
    >
      {children}
    </button>
  );
}
