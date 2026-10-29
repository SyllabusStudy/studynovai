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
- Dashboard accent tokens have light and dark definitions at the document root; fixed dark decorative surfaces must be scoped to dark mode so reused components remain readable everywhere.
- Personal Notes use authenticated server functions and owner-only RLS with revision-checked autosaves; this prevents cross-account access and silent concurrent overwrites.
- Personal Notes persist extensible Tiptap JSON documents separately from lecture notes; this preserves existing tools and supports future editor extensions without implementing them now.
- Shared typed notes use the same notes-document styling as the private editor, including whitespace and list markers, so read-only snapshots preserve the author's formatting.
- Private and shared Notes register Tiptap FontFamily so font selections persist in document JSON and shared snapshots without external font requests.
- Note line spacing is stored as paragraph/heading attributes through a shared Tiptap extension in private and shared editors, so autosave and sharing retain the chosen spacing without separate storage.
- Personal Notes class ownership is validated on save and by a database trigger; content-based titles are generated without AI costs and explicit titles disable automatic naming.
- Personal Notes drawings live in `personal_notes.drawing` (versioned JSON pages of strokes/shapes with an optional `source` field) rendered as SVG in NoteDrawingCanvas; shape cleanup runs only on explicit user action so future AI diagram tools can append elements without schema changes.
- The Notes AI Assistant (NotesAiPanel + notes-ai.functions.ts) uses the student's own AI key via withUserAiKey/callAI and never writes into a note on its own; output is inserted only on explicit user action, labeled as AI. In-note lecture recording reuses the storage-first Lecture Notes pipeline with the note passed as extra context.
- New students without their own AI key get server-tracked free trial uses (ai_trial_uses + consume_ai_trial RPC) on a shared TRIAL_GEMINI_API_KEY via withTrialOrUserAiKey; the app gate locks only after the tools trial is spent, so the trial can't be reset client-side.

- Notes correction underlines use transient ProseMirror decorations with a range-anchored inline popover, never saved marks; review preserves authored formatting and the active AI tab.
- Add-class tour guidance derives its target from dialog state and keeps that dialog non-modal only during guidance, so the tutorial card and real form controls remain interactive without altering other dialogs.
- Glo voice feedback uses local recognition states and a browser-safe speech submission gate; keep duplicate protection across recognizer restarts without adding AI calls for visual feedback.

- The iOS app is a Capacitor shell that loads the live site (capacitor.config.ts); the native ios/ folder is generated in CI, so web publishes update the app without resubmission.
- iPhone Pro purchases use Apple StoreKit 2 (@capgo/native-purchases); the server verifies the signed transaction against Apple Root CA G3 and stores subscriptions.status='apple' with expiry, so Stripe and promo codes are hidden inside the iOS app per App Store rule 3.1.1.
- Where browser speech recognition is missing or fails (desktop Electron app), Glo falls back to tap-to-talk MediaRecorder clips transcribed by transcribeGloVoice without spending trial uses; a typed box is always available, so Glo never depends on a cloud speech service.
- The local syllabus test (/lab/local-syllabus, src/lib/local-syllabus) reads PDFs in the browser with rule-based date detection and IndexedDB storage, isolated from the production upload flow so it can be evaluated without touching cloud data or AI costs.
