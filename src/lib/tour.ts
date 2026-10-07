export type TourStep = {
  id: string;
  /** "next": user reads and clicks Next. "click": user clicks the real link, which goes to `goto`. */
  kind: "next" | "click";
  /** Page this step lives on (for "next" steps). */
  route?: string;
  /** Destination the real link leads to (for "click" steps). */
  goto?: string;
  selectors: string[];
  title: string;
  body: string;
  action?: string;
};

export const TOUR_STEPS: TourStep[] = [
  {
    id: "dashboard", kind: "next", route: "/dashboard",
    selectors: ['[data-tour="dashboard"]'],
    title: "Welcome to SyllabusStudy 👋",
    body: "Your semester in one place. Home shows what's due today, your study streak, and quick buttons to start studying. Let's set you up in about a minute.",
  },
  {
    id: "nav-classes", kind: "click", goto: "/classes",
    selectors: ['a[href="/classes"]'],
    title: "Step 1 · Add your classes 📚",
    body: "Everything in the app is organized by class — notes, quizzes, the AI Tutor and due dates.",
    action: "Click My Classes →",
  },
  {
    id: "add-class", kind: "next", route: "/classes",
    selectors: ['[data-tour="add-class"]', '[data-tour="page-header"]'],
    title: "Upload a syllabus = instant planner ✨",
    body: "Add a class, then drop in its syllabus. We pull out every exam and due date for you. Use Canvas or Blackboard? Paste your calendar link and it syncs by itself.",
    action: "Try + Add class now, or press Next.",
  },
  {
    id: "nav-assignments", kind: "click", goto: "/assignments",
    selectors: ['a[href="/assignments"]'],
    title: "Step 2 · Never miss a due date ✅",
    body: "Your homework, sorted into Today, This week and Later — with reminders.",
    action: "Click Assignments →",
  },
  {
    id: "add-assignment", kind: "next", route: "/assignments",
    selectors: ['[data-tour="add-assignment"]', '[data-tour="page-header"]'],
    title: "Check it off, grow your streak 🔥",
    body: "Add anything that's due. Stuck on one? Tap Ask AI on the card for step-by-step help. Your calendar and grades live in the menu too.",
  },
  {
    id: "nav-notes", kind: "click", goto: "/notes",
    selectors: ['a[href="/notes"]'],
    title: "Step 3 · Take notes that work for you 📝",
    body: "Type, handwrite with a pen or Apple Pencil, or just talk with 🎤 voice typing.",
    action: "Click Notes →",
  },
  {
    id: "notes", kind: "next", route: "/notes",
    selectors: ['[data-tour="page-header"]'],
    title: "Your notes have an AI buddy ✨",
    body: "Spelling fixes and helpful feedback show up while you write. One tap turns a note into a quiz, flashcards or a study guide — and Share sends it to friends or Discord. Record a lecture right inside a note too.",
  },
  {
    id: "nav-quizzes", kind: "click", goto: "/quizzes",
    selectors: ['a[href="/quizzes"]'],
    title: "Step 4 · Practice before the test 🧠",
    body: "Quizzes and Flashcards turn your notes, files and lectures into practice.",
    action: "Click Quizzes →",
  },
  {
    id: "quizzes", kind: "next", route: "/quizzes",
    selectors: ['[data-tour="page-header"]'],
    title: "Pick exactly what to study",
    body: "Choose a class, tap Choose what to study to pick specific notes, choose how many questions, and you're done. Lecture Notes, SnapQuick (photo help) and QuickVideo (video → notes) are in the Study and Tools menus.",
  },
  {
    id: "nav-tutor", kind: "click", goto: "/tutor",
    selectors: ['a[href="/tutor"]'],
    title: "Step 5 · Your 24/7 AI Tutor 🤖",
    body: "It reads your own class files, so its answers match your course.",
    action: "Click AI Tutor →",
  },
  {
    id: "tutor", kind: "next", route: "/tutor",
    selectors: ['[data-tour="tutor-input"]', '[data-tour="page-header"]'],
    title: "Ask it anything — try it now",
    body: "Pick your class, then type or 🎤 speak a question like \"Explain chapter 3 like I'm new to it.\" You can attach files too. Lost later? Tap Stuck? anytime.",
  },
];

export const TOUR_EVENT = "studynova:tour";
export type TourEventDetail = { focus?: string | undefined };

export function startTour(focus?: string) {
  window.dispatchEvent(new CustomEvent<TourEventDetail>(TOUR_EVENT, { detail: { focus } }));
}
