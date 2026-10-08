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
  /** Short "this is that" chips shown instead of a paragraph. */
  points?: string[];
  action?: string;
};

export const TOUR_STEPS: TourStep[] = [
  { id: "dashboard", kind: "next", route: "/dashboard", selectors: ['[data-tour="dashboard"]'],
    title: "Hey! I'm your study buddy 👋", body: "This is Home — your semester at a glance.",
    points: ["📅 What's due today", "🔥 Your study streak", "⚡ Quick start buttons"] },
  { id: "nav-classes", kind: "click", goto: "/classes", selectors: ['a[href="/classes"]'],
    title: "Add your classes", body: "Everything lives inside a class.", action: "Tap My Classes" },
  { id: "add-class", kind: "next", route: "/classes", selectors: ['[data-tour="add-class"]', '[data-tour="page-header"]'],
    title: "This makes a class", body: "Then drop in your syllabus.",
    points: ["📄 Syllabus → all due dates", "🔗 Canvas link → auto sync"] },
  { id: "nav-assignments", kind: "click", goto: "/assignments", selectors: ['a[href="/assignments"]'],
    title: "Never miss homework", body: "Your to-do list lives here.", action: "Tap Assignments" },
  { id: "add-assignment", kind: "next", route: "/assignments", selectors: ['[data-tour="add-assignment"]', '[data-tour="page-header"]'],
    title: "Add what's due", body: "Check it off when you're done.",
    points: ["⏰ Reminders", "✨ Ask AI on any card", "✅ Grow your streak"] },
  { id: "nav-notes", kind: "click", goto: "/notes", selectors: ['a[href="/notes"]'],
    title: "Take notes", body: "Type, draw, or talk.", action: "Tap Notes" },
  { id: "notes", kind: "next", route: "/notes", selectors: ['[data-tour="page-header"]'],
    title: "Notes with superpowers", body: "Your AI buddy helps while you write.",
    points: ["✍️ Handwrite / draw", "🎤 Voice typing", "✨ Auto spell + tips", "🔗 Share to friends"] },
  { id: "nav-quizzes", kind: "click", goto: "/quizzes", selectors: ['a[href="/quizzes"]'],
    title: "Practice for tests", body: "Turn notes into quizzes.", action: "Tap Quizzes" },
  { id: "quizzes", kind: "next", route: "/quizzes", selectors: ['[data-tour="page-header"]'],
    title: "Make a quiz in 3 taps", body: "Class → what to study → go.",
    points: ["📚 Pick your notes", "🃏 Flashcards too", "🎙️ Lecture → notes"] },
  { id: "nav-tutor", kind: "click", goto: "/tutor", selectors: ['a[href="/tutor"]'],
    title: "Meet your AI Tutor", body: "It knows your class files.", action: "Tap AI Tutor" },
  { id: "tutor", kind: "next", route: "/tutor", selectors: ['[data-tour="tutor-input"]', '[data-tour="page-header"]'],
    title: "Ask it anything!", body: "Type or 🎤 talk right here.",
    points: ["💬 \"Explain chapter 3\"", "📎 Attach files", "💡 Stuck? = help anytime"] },
  { id: "glo", kind: "next", route: "/dashboard", selectors: ['[data-tour="glo"]'],
    title: "Last thing — say “Hey Glo” 🎙️", body: "I'm always listening on the side of your screen. Ask me what's due, to make a quiz, or to take a note — hands free!",
    points: ["🗣️ “Hey Glo, what's due?”", "🃏 “Make flashcards for bio”", "🔕 Turn me off anytime in my panel"] },
];

export const TOUR_EVENT = "studynova:tour";
export type TourEventDetail = { focus?: string | undefined };

export function startTour(focus?: string) {
  window.dispatchEvent(new CustomEvent<TourEventDetail>(TOUR_EVENT, { detail: { focus } }));
}
