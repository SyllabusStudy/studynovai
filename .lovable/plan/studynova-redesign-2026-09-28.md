# StudyNova redesign

## Goal
Rename StudyMate AI to StudyNova ("Your semester, made simple.") and simplify the app so a new student understands it in 10 seconds. Every existing feature, account and saved piece of data stays as it is.

## Work, in phases (each phase gets checked before the next one starts)

**1. Rebrand and navigation**
- Swap every visible "StudyMate" for "StudyNova": logo, page titles, AI replies, onboarding, emails and messages. Behind-the-scenes names stay the same.
- New sidebar groups: Primary (Home, My Classes, Calendar, Assignments, Grades), Study and Tools (both can be folded away), Resources (School Links), and a bottom row (Feedback, Settings, Upgrade). On phones this becomes a menu that slides open.
- Keep the dark navy, teal and light text, with more space, clearer headings and less clutter.

**2. Home dashboard**
- "Good morning, [Name]", then Today (due today, due tomorrow, up next) and a View All Assignments button.
- Today's study plan with Start Study Session. The quick buttons: Add Assignment, Add Class, Upload Syllabus, Ask AI Tutor and Scan Homework.
- The stats shrink into a small Semester Overview section.

**3. Classes, calendar and AI help**
- Simpler class cards (name, instructor, open tasks, documents, Open Class). Each class page gets tabs: Overview, Assignments, Materials, Grades, AI Tutor.
- A step-by-step message while a syllabus uploads ("Reading your syllabus…", then "Finding assignments…").
- Calendar filters (All, Assignments, Exams, Classes, Work, Personal) and a clean panel with details when you click an event.
- AI buttons right where you work: "Ask AI About This Assignment" on assignments; Generate Flashcards, Create Quiz and Explain Material on classes.
- SnapQuick opens on "Stuck on a problem?" with just Take a Picture and Upload Image. Answers show the questions it found, the steps, the final answer, and buttons for "Explain This Differently" and "Give Me a Similar Problem".
- Friendly messages on empty pages, each with a button to get started.

**4. New-user onboarding**
- A 5-step welcome flow for new accounts only: welcome, add classes, upload syllabi, what you want help with, then "You're all set". It replaces the current tour, and people who already have accounts never see it.

**5. Feedback and owner dashboard**
- A Feedback window in the sidebar and account menu: type, message, optional 1–5 stars. Each one is saved with the user, their email, the time, the page it came from and a status (New, In Review, Resolved).
- A protected owner-only Admin page with tabs for Overview, Feedback, Users, Analytics and Settings. Feedback comes first, with search, filters, status changes and deleting spam. It also shows totals, feedback this week, the most common issue, the most requested feature and the average rating.
- An email to you for each new piece of feedback, once an email sender is set up. If the email fails, the feedback is still saved.

## Technical details
- Add the missing columns to the existing feedback table (category, rating, page, status). Access uses the existing roles table and the has_role check, enforced on the server. Nothing gets deleted from the database.
- Store the onboarding answers on the profile, with a flag saying onboarding is done. Existing users get that flag set, so they skip it.
- Add an event category for Work and Personal, with a default that keeps existing events working.
- Owner email uses the built-in email system and needs a verified sender domain first. Until you have one, that part waits and feedback is saved only.
- Files touched most: the app layout, dashboard, classes, calendar, SnapQuick, feedback, admin, onboarding and the global styles.
