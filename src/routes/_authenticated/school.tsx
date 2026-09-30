import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, GraduationCap, Link2, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Hint } from "@/components/Hint";
import { DeleteButton } from "@/components/DeleteButton";
import { ClassChip } from "@/components/ClassBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { classLabel, useClasses } from "@/lib/data";

const CATEGORIES = [
  { value: "student_center", label: "Student center / portal" },
  { value: "lms", label: "Course site (Canvas, Blackboard…)" },
  { value: "email", label: "School email" },
  { value: "library", label: "Library & research" },
  { value: "grades", label: "Grades & transcripts" },
  { value: "other", label: "Other" },
] as const;

const PRESETS = [
  { label: "Student Center", category: "student_center" },
  { label: "Canvas", category: "lms" },
  { label: "Blackboard", category: "lms" },
  { label: "School email", category: "email" },
  { label: "Library", category: "library" },
  { label: "Degree audit", category: "grades" },
] as const;

function normalizeUrl(raw: string) {
  const value = raw.trim();
  if (!value) throw new Error("Paste the link to your school page first.");
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw new Error("That doesn't look like a valid link.");
  }
  if (!parsed.hostname.includes(".")) throw new Error("That doesn't look like a valid link.");
  return parsed.toString();
}

export const Route = createFileRoute("/_authenticated/school")({
  head: () => ({
    meta: [
      { title: "School links — SyllabusNova" },
      {
        name: "description",
        content:
          "Save your student center, course site, school email and library links so every school page is one click away.",
      },
      { property: "og:title", content: "School links — SyllabusNova" },
      {
        property: "og:description",
        content: "Keep your student center and school portals one click away inside SyllabusNova.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SchoolLinksPage,
});

function SchoolLinksPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: classes = [] } = useClasses(user?.id);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState<string>("student_center");
  const [classId, setClassId] = useState<string>("none");

  const classById = new Map(classes.map((c) => [c.id, c]));

  const { data: links = [], isLoading } = useQuery({
    queryKey: ["school-links", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_links")
        .select("*")
        .eq("user_id", user!.id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      const name = label.trim();
      if (name.length < 2) throw new Error("Give the link a short name.");
      const href = normalizeUrl(url);
      const { error } = await supabase.from("school_links").insert({
        user_id: user!.id,
        label: name,
        url: href,
        category,
        class_id: classId === "none" ? null : classId,
        sort_order: links.length,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setLabel("");
      setUrl("");
      setClassId("none");
      await qc.invalidateQueries({ queryKey: ["school-links"] });
      toast.success("Link saved");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save that link."),
  });

  async function remove(id: string) {
    const { error } = await supabase.from("school_links").delete().eq("id", id);
    if (error) throw new Error(error.message);
    await qc.invalidateQueries({ queryKey: ["school-links"] });
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="School links"
        description="Connect your student center, course sites and anything else you open every day."
      />

      <Hint id="school-links-start" point="down" className="mb-4">
        Paste the web address of your student center or course site and it lives here — one tap to open
        it from any device you're signed in on.
      </Hint>

      <div className="surface-card space-y-4 p-5">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <Button
              key={p.label}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setLabel(p.label);
                setCategory(p.category);
              }}
            >
              <Plus className="size-3.5" />
              {p.label}
            </Button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="link-label">Name</Label>
            <Input
              id="link-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Student Center"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="link-url">Web address (URL)</Label>
            <Input
              id="link-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="my.school.edu/studentcenter"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Attach to a class (optional)</Label>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No class</SelectItem>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {classLabel(c)} — {c.class_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button
          className="w-full sm:w-auto"
          disabled={add.isPending}
          onClick={() => add.mutate()}
        >
          {add.isPending ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
          Save link
        </Button>
      </div>

      <h2 className="mb-3 mt-8 text-sm font-bold uppercase tracking-wide text-muted-foreground">
        Your school links
      </h2>
      {isLoading ? (
        <Loader2 className="size-5 animate-spin text-primary" />
      ) : links.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="No school links yet"
          description="Add your student center, Canvas or school email above and they'll open in one tap."
        />
      ) : (
        <ul className="space-y-2">
          {links.map((l) => (
            <li key={l.id} className="surface-card flex items-center gap-3 p-4">
              <GraduationCap className="size-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{l.label}</p>
                <p className="truncate text-xs text-muted-foreground">{l.url}</p>
              </div>
              {l.class_id && classById.get(l.class_id) ? (
                <ClassChip
                  color={classById.get(l.class_id)?.color}
                  label={classLabel(classById.get(l.class_id))}
                />
              ) : (
                <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                  {CATEGORIES.find((c) => c.value === l.category)?.label ?? l.category}
                </span>
              )}
              <Button asChild variant="outline" size="sm" className="shrink-0">
                <a href={l.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-3.5" />
                  Open
                </a>
              </Button>
              <DeleteButton
                label={l.label}
                description="This only removes the shortcut from SyllabusNova."
                onDelete={() => remove(l.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
