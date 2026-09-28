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
    title: "Welcome to StudyNova 👋",
    body: "This is your main dashboard. From here you can access all of your classes, assignments, calendar, grades, and study tools.",
  },
  {
    id: "nav-classes", kind: "click", goto: "/classes",
    selectors: ['a[href="/classes"]'],
    title: "My Classes 📚",
    body: "This is where you manage all of your classes.",
    action: "Click My Classes to continue →",
  },
  {
    id: "add-class", kind: "next", route: "/classes",
    selectors: ['[data-tour="add-class"]', '[data-tour="page-header"]'],
    title: "Add a class ➕",
    body: "This is where you add a class to StudyNova. Adding your classes lets StudyNova organize your semester around your actual courses. Open a class later to upload its syllabus.",
    action: "Try clicking + Add class, or press Next.",
  },
  {
    id: "nav-calendar", kind: "click", goto: "/calendar",
    selectors: ['a[href="/calendar"]'],
    title: "Your calendar 📅",
    body: "Your calendar keeps track of your assignments, exams, deadlines, and other important dates.",
    action: "Click Calendar to continue →",
  },
  {
    id: "calendar", kind: "next", route: "/calendar",
    selectors: ['[data-tour="page-header"]'],
    title: "Everything with a date",
    body: "Syllabus dates, assignments and your own events all show up here. Use the filters to see only exams, assignments and more. Click a day to add something.",
  },
  {
    id: "nav-assignments", kind: "click", goto: "/assignments",
    selectors: ['a[href="/assignments"]'],
    title: "Assignments ✅",
    body: "Keep track of all your homework and due dates.",
    action: "Click Assignments to continue →",
  },
  {
    id: "add-assignment", kind: "next", route: "/assignments",
    selectors: ['[data-tour="add-assignment"]', '[data-tour="page-header"]'],
    title: "Add your homework",
    body: "Add an assignment with a due date and a reminder. Check it off when you're done — that also counts toward your study streak.",
    action: "Try clicking + Add assignment, or press Next.",
  },
  {
    id: "nav-grades", kind: "click", goto: "/grades",
    selectors: ['a[href="/grades"]'],
    title: "Grades 📈",
    body: "Track your grades and see how you're doing in each class.",
    action: "Click Grades to continue →",
  },
  {
    id: "grades", kind: "next", route: "/grades",
    selectors: ['[data-tour="page-header"]'],
    title: "Know where you stand",
    body: "Add grade categories and scores to see your current grade and what you need on the final.",
  },
  {
    id: "nav-tutor", kind: "click", goto: "/tutor",
    selectors: ['a[href="/tutor"]'],
    title: "AI Tutor 🤖",
    body: "Ask questions, study concepts and get help with your homework.",
    action: "Click AI Tutor to continue →",
  },
  {
    id: "tutor", kind: "next", route: "/tutor",
    selectors: ['[data-tour="tutor-input"]', '[data-tour="page-header"]'],
    title: "Ask anything",
    body: "Type a question here. The tutor answers using your own class files, so pick your class first for the best answers.",
  },
  {
    id: "nav-flashcards", kind: "click", goto: "/flashcards",
    selectors: ['a[href="/flashcards"]'],
    title: "Study tools 🧠",
    body: "Flashcards, Quizzes, SnapQuick and QuickVideo turn your notes into practice.",
    action: "Click Flashcards to continue →",
  },
  {
    id: "flashcards", kind: "next", route: "/flashcards",
    selectors: ['[data-tour="page-header"]'],
    title: "Make flashcards in one click",
    body: "Pick a class and click Make flashcards. Quizzes work the same way. SnapQuick helps with a photo of your homework, and QuickVideo turns lecture videos into notes.",
  },
];

export const TOUR_EVENT = "studynova:tour";
export type TourEventDetail = { focus?: string | undefined };

export function startTour(focus?: string) {
  window.dispatchEvent(new CustomEvent<TourEventDetail>(TOUR_EVENT, { detail: { focus } }));
}
