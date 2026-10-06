<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Route all student-key AI HTTP requests through `fetchAiWithRetry` in `ai-request.server.ts` so transient failures retry sequentially without switching providers or exposing prompts in logs.
- School calendar sync (Canvas/Blackboard .ics) stores links in `calendar_feeds` and dedupes events via `calendar_events.sync_key = ics:<feedId>:<uid>` (source_document is a uuid FK to documents) and keeps re-syncs idempotent.
- Shared links snapshot content into `shared_items` and are read publicly only via the security-definer `get_shared_item(token)` RPC — no anon table access.
- The visible product brand is SyllabusStudy, while existing `studynova.link` URLs, sender addresses, and persisted storage keys stay unchanged so old links and user state continue working.
- Personal Notes use authenticated server functions and owner-only RLS with revision-checked autosaves; this prevents cross-account access and silent concurrent overwrites.
- Personal Notes persist extensible Tiptap JSON documents separately from lecture notes; this preserves existing tools and supports future editor extensions without implementing them now.
- Shared typed notes use the same notes-document styling as the private editor, including whitespace and list markers, so read-only snapshots preserve the author's formatting.
- Note line spacing is stored as paragraph/heading attributes through a shared Tiptap extension in private and shared editors, so autosave and sharing retain the chosen spacing without separate storage.
- Personal Notes class ownership is validated on save and by a database trigger; content-based titles are generated without AI costs and explicit titles disable automatic naming.
- Personal Notes drawings live in `personal_notes.drawing` (versioned JSON pages of strokes/shapes with an optional `source` field) rendered as SVG in NoteDrawingCanvas; shape cleanup runs only on explicit user action so future AI diagram tools can append elements without schema changes.
- The Notes AI Assistant (NotesAiPanel + notes-ai.functions.ts) uses the student's own AI key via withUserAiKey/callAI and never writes into a note on its own; output is inserted only on explicit user action, labeled as AI. In-note lecture recording reuses the storage-first Lecture Notes pipeline with the note passed as extra context.
