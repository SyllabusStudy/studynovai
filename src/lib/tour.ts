export type TourStep = {
  id: string;
  selectors: string[];
  title: string;
  body: string;
};

export const TOUR_STEPS: TourStep[] = [
  {
    id: "dashboard",
    selectors: ['[data-tour="dashboard"]'],
    title: "Welcome to StudyNova 👋",
    body: "This is your StudyNova dashboard. From here, you can see your classes, assignments, upcoming exams, study progress, and everything you need for your semester.",
  },
  {
    id: "add-class",
    selectors: ['[data-tour="quick-add-class"]'],
    title: "Add your classes 📚",
    body: "Start by adding your classes. You can add your course information and keep everything organized in one place. Click + Add Class.",
  },
  {
    id: "syllabus",
    selectors: ['[data-tour="quick-upload-syllabus"]'],
    title: "Upload your syllabus 📄",
    body: "Upload your syllabus and StudyNova can find important assignments, exams, due dates, and other course information for you. Click Upload Syllabus.",
  },
  {
    id: "calendar",
    selectors: ['a[href="/calendar"]'],
    title: "Your academic calendar 📅",
    body: "See your assignments, exams, deadlines, and important class events all in one place. Click Calendar in the menu.",
  },
  {
    id: "assignments",
    selectors: ['[data-tour="quick-add-assignment"]', 'a[href="/assignments"]'],
    title: "Track assignments ✅",
    body: "Add homework with a due date and get reminders. Mark it done when you finish. Click + Add Assignment.",
  },
  {
    id: "tutor",
    selectors: ['[data-tour="quick-ask-ai-tutor"]', 'a[href="/tutor"]'],
    title: "Ask the AI Tutor 🤖",
    body: "Stuck on something? Ask the AI Tutor. It answers using your own class materials. Click Ask AI Tutor.",
  },
  {
    id: "study-tools",
    selectors: ['a[href="/flashcards"]', '[data-tour="quick-scan-homework"]'],
    title: "Study tools 🧠",
    body: "Make flashcards and quizzes from your notes, or snap a photo of homework with SnapQuick. Find them under Study and Tools in the menu.",
  },
  {
    id: "grades",
    selectors: ['a[href="/grades"]'],
    title: "Know your grade 📈",
    body: "Enter your scores to see your current grade and what you need on the final. Click Grades in the menu.",
  },
  {
    id: "help",
    selectors: ['[data-tour="help"]'],
    title: "💡 Stuck? Get help anytime",
    body: "Click this Help button whenever you forget how something works. You can also take this tour again from here.",
  },
];

export const TOUR_EVENT = "studynova:tour";
export type TourEventDetail = { focus?: string | undefined };

export function startTour(focus?: string) {
  window.dispatchEvent(new CustomEvent<TourEventDetail>(TOUR_EVENT, { detail: { focus } }));
}
