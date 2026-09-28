# StudyNova — Smarter, connected redesign

Keeps every existing feature, account and saved item. Changes how pages look and adds class memory, a calendar-aware study plan, a real streak, and QuickVideo title fixes.

Note: the brief mentions an attached logo and screenshots, but only the text brief came through. Until the logo is uploaded, I'll use a clean StudyNova icon placeholder in the same spots, and swap in the real logo once you send it.

## Phase 1 — Active class that follows you
- The app remembers the class you're working on (saved to your account, so it works across devices and refreshes).
- A reusable card: "📚 Organic Chemistry — What do you want to study?" with **Make Quiz**, **Make Flashcards**, **Ask AI** and a small **Change class** link.
- Shown on Home, class pages, Flashcards, Quizzes, AI Tutor, SnapQuick, QuickVideo, Assignments and Grades (class view). Not on Settings.
- Buttons open the tool with the class already picked. No class yet? The card asks you to choose one and remembers it.

## Phase 2 — Calendar is the source of truth
- Every list (Today, Tomorrow, Up Next, Due Soon) compares against the current date/time; passed events never show as upcoming.
- Unfinished past assignments show as **Overdue**; finished ones leave active lists.
- Calendar page: filters All / Classes / Assignments / Exams / Study / Work / Other, sections Today / Tomorrow / This Week / Upcoming, and a separate **Past** view.
- Updates itself when the day changes.

## Phase 3 — Smart Today's Study Plan
- Built from your real calendar, due dates, exams, overdue items and recent study.
- Friendly wording ("Here's your plan for today… 2:00 PM — Criminal Justice: finish the reading due tonight").
- Each item has **Study Now**, which opens the best tool (Flashcards, Quiz or AI Tutor) with that class preselected.
- One short AI request on the free model; falls back to a plan built without AI if no key is set.

## Phase 4 — Accurate day streak
- New activity log: a day counts only when you actually study (finish an assignment, study flashcards, finish a quiz, use AI Tutor, SnapQuick, QuickVideo, or a study session).
- Many actions in one day = +1 day. Missing a day resets the streak.
- Stored in your account; shows "🔥 5 day streak — Keep it going, you've studied 5 days in a row."

## Phase 5 — Page redesigns
- Flashcards, Quizzes, SnapQuick, QuickVideo and AI Checker: short headings, one clear main button, fewer technical labels, tighter spacing, helpful empty states.
- QuickVideo: paste link → class auto-filled → **Create Study Notes**. Always saves the real video title and thumbnail ("Untitled lecture video" only if none is found); fixes existing "Video notes" titles where possible.
- AI replies across tools use a more human, less robotic tone.
- Logo placed in the sidebar, sign-in page, loading screen and empty states; icon-only on small screens.
- Mobile check for every changed page.

## Technical details
- `profiles.active_class_id` (nullable, FK classes ON DELETE SET NULL) + `useActiveClass` hook; tool routes accept `?classId=` search params.
- `study_activity(user_id, day date, activity_type, created_at)` with unique `(user_id, day, activity_type)`, RLS own-rows, GRANTs; streak computed from distinct days.
- `src/lib/dates.ts` classifier (past/today/upcoming/overdue) with a minute ticker + midnight refresh.
- `video_notes` title/thumbnail from YouTube oEmbed; migration only adds columns if missing.
- Existing data and backend names untouched; free-model/one-request AI rules preserved.
