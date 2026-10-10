# SyllabusStudy

Build me a modern AI-powered college student study platform called “StudyMate AI”.

The goal is to create an all-in-one website where college students can manage their classes, upload course materials, study with AI, track assignments and exams, and get personalized help based on their own syllabi and documents.

IMPORTANT:

This should be a real functional web application, not just a static mockup. Build the frontend, backend, authentication, database structure, file storage, and AI-ready architecture.

DESIGN:

- Modern, clean, premium student-focused UI

- Make it feel like a combination of Notion, Google Calendar, Quizlet, and a modern AI chatbot

- Simple and easy to navigate

- Responsive on desktop, tablet, and mobile

- Use a clean white/light interface with subtle colors and cards

- Include dark mode

- Smooth animations, but don't overdo them

- Sidebar navigation on desktop

- Bottom/mobile navigation on smaller screens

BRAND:

Name: StudyMate AI

Tagline: “Your AI-powered college companion.”

AUTHENTICATION:

Create a complete authentication system.

Users should be able to:

- Sign up with email and password

- Log in

- Log out

- Reset their password

- Stay signed in

- Have their own private account

- Have all their classes, files, flashcards, quizzes, assignments, grades, calendar events, and AI conversations saved to their account

Use Supabase for authentication, database, and file storage if available.

DATABASE:

Create a proper relational database structure.

Users:

- id

- name

- email

- created_at

Classes:

- id

- user_id

- class_name

- course_code

- professor

- semester

- color

- created_at

Documents:

- id

- user_id

- class_id

- file_name

- file_type

- file_url

- extracted_text

- created_at

Assignments:

- id

- user_id

- class_id

- title

- description

- due_date

- status

- points_possible

- points_earned

- created_at

Calendar Events:

- id

- user_id

- class_id

- title

- event_type

- date

- time

- description

- source_document

Flashcards:

- id

- user_id

- class_id

- front

- back

- difficulty

- times_reviewed

- times_correct

- next_review

Quizzes:

- id

- user_id

- class_id

- title

- questions

- score

- created_at

AI Conversations:

- id

- user_id

- class_id

- title

- messages

- created_at

User Study Progress:

- id

- user_id

- class_id

- topic

- mastery_score

- last_studied

DASHBOARD:

After logging in, show a personalized dashboard.

Header:

“Good afternoon, [Name] 👋”

Show:

- Upcoming deadlines

- Upcoming exams

- Today's tasks

- Current classes

- Recent study activity

- AI recommendations

- Study streak

- Overall progress

Example:

UPCOMING:

🔴 CHEM 124 Exam — 4 days

🟡 Psychology Assignment — Tomorrow

🟢 Biology Quiz — Friday

AI STUDY RECOMMENDATION:

“You have a Chemistry exam in 4 days. Based on your recent quiz results, I recommend reviewing stereochemistry today.”

Add buttons:

“Start Studying”

“Ask AI”

“View Calendar”

CLASSES PAGE:

Create a “My Classes” page.

Users can:

- Add a class

- Edit a class

- Delete a class

- Choose a color

- Add professor

- Add semester

Each class should have its own dedicated page.

Example:

CHEM 124

Organic Chemistry

Professor: Smith

Tabs:

- Overview

- AI Tutor

- Documents

- Flashcards

- Quizzes

- Assignments

- Grades

- Syllabus

DOCUMENT UPLOAD:

Users should be able to upload:

- PDF files

- Images

- Word documents if possible

- PowerPoint files if possible

Allow drag-and-drop uploads.

After uploading a document:

1. Store it securely.

2. Extract its text when possible.

3. Associate it with the selected class.

4. Make the content available to the AI.

5. Show the document in the class's Documents section.

Allow users to upload a syllabus PDF or take/upload a picture of a syllabus.

SYLLABUS AI:

This is a major feature.

When a user uploads a syllabus, analyze it and extract:

- Professor name

- Course name

- Course code

- Office hours

- Email if present

- Attendance policy

- Late work policy

- Make-up exam policy

- Grading breakdown

- Assignment dates

- Quiz dates

- Exam dates

- Final exam date

- Important deadlines

- Required materials

- Course policies

Automatically create calendar events from dates found in the syllabus.

IMPORTANT:

The AI must distinguish between information explicitly found in the user's syllabus and information it doesn't know.

If the user asks:

“How many classes can I miss?”

The AI should search their syllabus and answer based on the syllabus.

If the syllabus does not contain the answer, say:

“I couldn't find an attendance limit in your uploaded syllabus.”

Never invent course policies.

AI TUTOR:

Create a ChatGPT-style AI tutor interface.

The AI should be able to answer questions using the user's uploaded course materials.

Users can ask:

- “Explain this”

- “Help me solve this”

- “Why is this answer wrong?”

- “Teach me this topic”

- “Summarize Chapter 5”

- “What should I study?”

- “Find this in my notes”

- “What does my professor say about late work?”

- “How many classes can I miss?”

- “What's worth the most points?”

- “What do I need on my final to get an A?”

The AI should prioritize information from the user's uploaded documents and syllabus.

When answering from a document, show a small source reference such as:

“Source: CHEM 124 Syllabus — Attendance Policy”

STUDY MODES:

Give the AI different modes:

1. Explain

Explain the concept in simple language.

2. Step-by-Step

Walk through a problem without skipping steps.

3. Teach Me

Teach the topic as if the student is learning it for the first time.

4. Quiz Me

Ask questions one at a time and wait for the student's answer.

5. Check My Answer

Let the student submit an answer and explain whether it is correct.

6. Summarize

Summarize the uploaded material.

7. Exam Prep

Create a study plan based on upcoming exams.

FLASHCARDS:

Add a Flashcards page.

Allow users to:

- Create flashcards manually

- Generate flashcards from a PDF

- Generate flashcards from a chapter

- Choose number of cards

- Choose difficulty

Options:

10 cards

20 cards

30 cards

50 cards

Create an interactive flashcard study interface.

Track:

- Correct answers

- Incorrect answers

- Cards reviewed

- Difficulty

- Topics the student struggles with

Eventually implement spaced repetition.

QUIZ GENERATOR:

Allow users to generate quizzes from their uploaded materials.

Options:

- 5 questions

- 10 questions

- 20 questions

- 30 questions

Question types:

- Multiple choice

- True/false

- Short answer

- Problem solving

Allow difficulty:

- Easy

- Medium

- Hard

- Exam-level

After the quiz:

Show score.

Show which questions were missed.

Explain the correct answer.

Identify weak topics.

CALENDAR:

Create a beautiful calendar.

Show:

- Exams

- Quizzes

- Assignments

- Projects

- Presentations

- Finals

- Personal study sessions

Use different colors for different classes.

Allow:

- Month view

- Week view

- Day view

Users should be able to manually add events.

Also allow the AI to create study sessions.

Example:

“Chemistry Exam in 5 days”

AI can automatically recommend:

Day 1: Review Chapter 5

Day 2: Flashcards

Day 3: Practice problems

Day 4: Practice exam

Day 5: Light review

ASSIGNMENTS:

Create an assignment tracker.

Each assignment should show:

- Class

- Assignment name

- Due date

- Status

- Points

- Priority

Statuses:

- Not started

- In progress

- Completed

- Late

Allow sorting by:

- Due date

- Class

- Priority

- Status

GRADE TRACKER:

Create a grade calculator.

Users can enter:

- Assignment grades

- Quiz grades

- Exam grades

- Lab grades

- Projects

Allow category weights.

Calculate:

- Current grade

- Projected grade

- Required grade on remaining assignments

- Required final exam score to reach a target grade

Example:

“What do I need on my final to get an A?”

The AI should calculate this based on the class's grading structure.

AI MEMORY:

Create persistent memory for each user.

The AI should remember:

- Classes

- Uploaded documents

- Study history

- Quiz performance

- Weak topics

- Upcoming exams

- Assignments

- User preferences

- Previous conversations

However, keep each user's information completely private.

A student must never be able to access another student's files or information.

AI STUDY COACH:

Create a personalized AI study coach.

Every day, the dashboard should be able to recommend what the student should work on based on:

- Upcoming exams

- Upcoming assignments

- Difficulty of topics

- Previous quiz performance

- Available study time

- Overdue work

Example:

“Today I recommend:

1. CHEM 124 — Review stereochemistry for 30 minutes

2. Complete Psychology discussion

3. Review 15 Biology flashcards”

Allow the user to tell the AI:

“I only have 30 minutes today.”

Then automatically adjust the plan.

REMINDERS:

Create reminder functionality for:

- Assignments

- Exams

- Quizzes

- Study sessions

Allow users to choose reminder timing.

Example:

- 1 day before

- 3 days before

- 1 week before

PROFILE:

Create a profile/settings page.

Include:

- Name

- Email

- School

- Major

- Graduation year

- Dark mode

- Notification settings

SECURITY:

This is extremely important.

Every user's:

- Files

- Classes

- Documents

- Conversations

- Grades

- Flashcards

- Assignments

- Calendar events

must be isolated to that user's account.

Use Supabase Row Level Security where appropriate.

Do not expose private file URLs publicly.

UI STRUCTURE:

Sidebar:

🏠 Dashboard

📚 My Classes

📅 Calendar

✅ Assignments

🧠 Flashcards

📝 Quizzes

📊 Grades

🤖 AI Tutor

⚙️ Settings

TOP BAR:

Search

Notifications

Profile

AI BUTTON:

Add a floating “Ask AI” button throughout the app.

IMPORTANT UX DETAIL:

The website should feel extremely easy to use.

A student should be able to:

1. Create a class

2. Upload their syllabus

3. Upload PDFs

4. Automatically generate their calendar

5. Ask the AI questions

6. Generate flashcards

7. Generate quizzes

8. Track assignments

9. Study based on AI recommendations

without needing complicated setup.

Build the application with reusable components and a clean architecture so additional features can be added later.

For the initial version, prioritize making these features actually functional:

1. Authentication

2. User accounts

3. Class creation

4. PDF/image upload

5. Syllabus processing

6. AI chat

7. Document-based AI answers

8. Flashcard generation

9. Quiz generation

10. Calendar generation

11. Assignment tracking

12. Persistent user data

Do not fill the app with fake demo data unless clearly labeled as demo data.

Make the application production-ready in structure, with proper loading states, empty states, error handling, responsive design, and secure database access.

Start by building the complete application shell, authentication, database schema, class system, document upload system, and dashboard. Then implement the AI/document functionality and the remaining study features.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://studynovai.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/0acf608e-a60c-4922-bcfb-62df2d8660a4).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
