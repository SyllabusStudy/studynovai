import { FileText } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DeleteButton } from "@/components/DeleteButton";
import type { DocumentRow } from "@/lib/data";

export function documentStatusLabel(d: DocumentRow): string {
  if (d.extracted_text) return "Ready for AI";
  if (d.processing_status === "failed") return d.processing_error || "Could not be read";
  if (d.processing_status === "unsupported") return "Stored, but not AI-readable";
  return "Reading…";
}

export function DocumentList({
  documents,
  onSelect,
}: {
  documents: DocumentRow[];
  onSelect?: (d: DocumentRow) => void;
}) {
  const qc = useQueryClient();

  async function remove(d: DocumentRow) {
    await supabase.storage.from("course-materials").remove([d.storage_path]);
    const { error } = await supabase.from("documents").delete().eq("id", d.id);
    if (error) throw new Error(error.message);
    await qc.invalidateQueries({ queryKey: ["documents"] });
  }

  if (documents.length === 0) {
    return <p className="text-sm text-muted-foreground">No files uploaded yet.</p>;
  }

  return (
    <ul className="space-y-2">
      {documents.map((d) => (
        <li key={d.id} className="surface-card flex items-center gap-3 p-4">
          <FileText className="size-4 shrink-0 text-primary" />
          {onSelect ? (
            <button
              type="button"
              onClick={() => onSelect(d)}
              className="min-w-0 flex-1 text-left"
            >
              <p className="truncate text-sm font-semibold underline-offset-2 hover:underline">
                {d.file_name}
              </p>
              <p className="text-xs text-muted-foreground">
                {d.is_syllabus ? "Syllabus · " : ""}
                {documentStatusLabel(d)}
                {d.ai_help ? " · AI work saved" : ""}
              </p>
            </button>
          ) : (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{d.file_name}</p>
              <p className="text-xs text-muted-foreground">
                {d.is_syllabus ? "Syllabus · " : ""}
                {documentStatusLabel(d)}
              </p>
            </div>
          )}
          <DeleteButton
            label={d.is_syllabus ? "syllabus" : "file"}
            description={`"${d.file_name}" and its extracted text will be removed.`}
            onDelete={() => remove(d)}
          />
        </li>
      ))}
    </ul>
  );
}
