import { useState } from "react";
import { Download, Eye, FileText, Pencil, Sparkles } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { DeleteButton } from "@/components/DeleteButton";
import { Button } from "@/components/ui/button";
import { MATERIAL_CATEGORIES } from "@/lib/constants";
import type { DocumentRow } from "@/lib/data";

export function documentStatusLabel(d: DocumentRow): string {
  if (d.extracted_text) return "Ready for AI";
  if (d.processing_status === "failed") return d.processing_error || "Could not be read";
  if (d.processing_status === "unsupported") return "Stored, but not AI-readable";
  return "Reading…";
}

function fileKind(name: string): string {
  const ext = name.split(".").pop()?.toUpperCase();
  return ext && ext.length <= 5 ? ext : "File";
}

function categoryLabel(d: DocumentRow): string {
  const key = d.category ?? (d.is_syllabus ? "syllabus" : "notes");
  return MATERIAL_CATEGORIES.find((c) => c.key === key)?.label ?? "Other";
}

export function DocumentList({
  documents,
  onSelect,
  showActions = false,
}: {
  documents: DocumentRow[];
  onSelect?: (d: DocumentRow) => void;
  showActions?: boolean;
}) {
  const qc = useQueryClient();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState("");

  async function remove(d: DocumentRow) {
    await supabase.storage.from("course-materials").remove([d.storage_path]);
    const { error } = await supabase.from("documents").delete().eq("id", d.id);
    if (error) throw new Error(error.message);
    await qc.invalidateQueries({ queryKey: ["documents"] });
  }

  async function open(d: DocumentRow, download: boolean) {
    const { data, error } = await supabase.storage
      .from("course-materials")
      .createSignedUrl(d.storage_path, 300, download ? { download: d.file_name } : undefined);
    if (error || !data) {
      toast.error("Could not open this file");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  async function saveName(d: DocumentRow) {
    const next = name.trim();
    setRenaming(null);
    if (!next || next === d.file_name) return;
    const { error } = await supabase.from("documents").update({ file_name: next }).eq("id", d.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await qc.invalidateQueries({ queryKey: ["documents"] });
  }

  if (documents.length === 0) {
    return <p className="text-sm text-muted-foreground">No files uploaded yet.</p>;
  }

  return (
    <ul className="space-y-2">
      {documents.map((d) => {
        const meta = (
          <p className="text-xs text-muted-foreground">
            {fileKind(d.file_name)} · {categoryLabel(d)} · {new Date(d.created_at).toLocaleDateString()} ·{" "}
            {documentStatusLabel(d)}
            {d.ai_help ? " · AI work saved" : ""}
          </p>
        );
        return (
          <li key={d.id} className="surface-card flex flex-wrap items-center gap-3 p-4">
            <FileText className="size-4 shrink-0 text-primary" />
            {renaming === d.id ? (
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => void saveName(d)}
                onKeyDown={(e) => e.key === "Enter" && void saveName(d)}
                className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm"
              />
            ) : onSelect ? (
              <button type="button" onClick={() => onSelect(d)} className="min-w-0 flex-1 text-left">
                <p className="truncate text-sm font-semibold underline-offset-2 hover:underline">{d.file_name}</p>
                {meta}
              </button>
            ) : (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{d.file_name}</p>
                {meta}
              </div>
            )}
            <div className="flex items-center gap-1">
              {showActions ? (
                <>
                  <Button size="icon" variant="ghost" aria-label="View" onClick={() => void open(d, false)}>
                    <Eye className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Rename"
                    onClick={() => {
                      setName(d.file_name);
                      setRenaming(d.id);
                    }}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button size="icon" variant="ghost" aria-label="Download" onClick={() => void open(d, true)}>
                    <Download className="size-4" />
                  </Button>
                  {d.extracted_text ? (
                    <Button asChild size="sm" variant="outline">
                      <Link to="/tutor">
                        <Sparkles className="size-4" /> Use with AI
                      </Link>
                    </Button>
                  ) : null}
                </>
              ) : null}
              <DeleteButton
                label={d.is_syllabus ? "syllabus" : "file"}
                description={`"${d.file_name}" and its extracted text will be removed.`}
                onDelete={() => remove(d)}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
