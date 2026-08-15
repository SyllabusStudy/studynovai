import { useNavigate } from "@tanstack/react-router";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useAuth } from "@/lib/auth";
import {
  classLabel,
  formatDate,
  useAssignments,
  useClasses,
  useDocuments,
  useEvents,
  useFlashcards,
} from "@/lib/data";

export function GlobalSearch({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: classes = [] } = useClasses(user?.id);
  const { data: assignments = [] } = useAssignments(user?.id);
  const { data: documents = [] } = useDocuments(user?.id);
  const { data: events = [] } = useEvents(user?.id);
  const { data: cards = [] } = useFlashcards(user?.id);

  const go = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search classes, assignments, documents, flashcards…" />
      <CommandList>
        <CommandEmpty>Nothing found yet — try adding a class or uploading a document.</CommandEmpty>

        {classes.length ? (
          <CommandGroup heading="Classes">
            {classes.map((c) => (
              <CommandItem
                key={c.id}
                value={`${c.class_name} ${c.course_code ?? ""} ${c.professor ?? ""}`}
                onSelect={() => go(() => navigate({ to: "/classes/$classId", params: { classId: c.id } }))}
              >
                {classLabel(c)} — {c.class_name}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {assignments.length ? (
          <CommandGroup heading="Assignments">
            {assignments.slice(0, 20).map((a) => (
              <CommandItem
                key={a.id}
                value={`assignment ${a.title}`}
                onSelect={() => go(() => navigate({ to: "/assignments" }))}
              >
                {a.title}
                <span className="ml-auto text-xs text-muted-foreground">{formatDate(a.due_date)}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {events.length ? (
          <CommandGroup heading="Calendar">
            {events.slice(0, 20).map((e) => (
              <CommandItem
                key={e.id}
                value={`event ${e.title}`}
                onSelect={() => go(() => navigate({ to: "/calendar" }))}
              >
                {e.title}
                <span className="ml-auto text-xs text-muted-foreground">{formatDate(e.event_date)}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {documents.length ? (
          <CommandGroup heading="Documents">
            {documents.slice(0, 20).map((d) => (
              <CommandItem
                key={d.id}
                value={`document ${d.file_name}`}
                onSelect={() =>
                  go(() =>
                    d.class_id
                      ? navigate({ to: "/classes/$classId", params: { classId: d.class_id } })
                      : navigate({ to: "/classes" }),
                  )
                }
              >
                {d.file_name}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {cards.length ? (
          <CommandGroup heading="Flashcards">
            {cards.slice(0, 15).map((c) => (
              <CommandItem
                key={c.id}
                value={`flashcard ${c.front}`}
                onSelect={() => go(() => navigate({ to: "/flashcards" }))}
              >
                {c.front}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
      </CommandList>
    </CommandDialog>
  );
}
