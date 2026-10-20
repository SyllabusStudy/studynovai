export interface GuideSection {
  heading: string;
  paragraphs: string[];
  list?: string[];
}

export interface Guide {
  slug: string;
  title: string;
  description: string;
  category: string;
  readMinutes: number;
  intro: string;
  sections: GuideSection[];
  takeaways: string[];
}

export const GUIDES: Guide[] = [
  {
    slug: "turn-syllabus-into-exam-schedule",
    title: "How to Turn Any College Syllabus into a Semester Exam Schedule",
    description:
      "A step-by-step method for reading a syllabus, mapping every deadline, weighting assignments and building a study schedule that avoids finals-week panic.",
    category: "Planning",
    readMinutes: 9,
    intro:
      "Your syllabus is the single most useful document you get all semester, yet most students skim it once in week one and never open it again. Treated properly, a syllabus is a complete map of what your professor will test, when, and how much each piece matters. This guide walks through a repeatable process for turning every syllabus you receive into one clear, realistic exam and study schedule.",
    sections: [
      {
        heading: "Step 1: Collect every syllabus in one place",
        paragraphs: [
          "Before you plan anything, gather the syllabus for each class into one folder, whether that is a physical binder, a notes app, or a study platform. Many professors post an updated version a week or two into the term, so check your learning management system (Canvas, Blackboard, Moodle) for the newest copy and note the date on it.",
          "Having all of them side by side is what makes the next steps work. Conflicts, such as two midterms in the same week, are invisible when you look at one course at a time. They become obvious the moment the dates sit on one calendar.",
        ],
      },
      {
        heading: "Step 2: Extract every dated item",
        paragraphs: [
          "Go through each syllabus line by line and pull out anything with a date attached. Do not just look for the word \"exam.\" Professors hide important deadlines in course schedules, reading lists and policy sections.",
        ],
        list: [
          "Exams, midterms, finals and in-class tests",
          "Quizzes, including weekly or online quizzes",
          "Papers, essays, lab reports and project milestones",
          "Presentations and group deliverables",
          "Add/drop and withdrawal deadlines",
          "Readings expected before specific lectures",
          "Holidays and days with no class",
        ],
      },
      {
        heading: "Step 3: Record the weight of each assessment",
        paragraphs: [
          "Next to each item, write the percentage of your final grade it represents. Most syllabi include a grading breakdown such as \"Midterm 25%, Final 35%, Homework 20%, Participation 10%, Quizzes 10%.\" This number decides how much study time an item deserves.",
          "A simple rule works well: plan study hours roughly in proportion to grade weight. A final worth 35% should get far more preparation than a 2% reading quiz, even if the quiz feels more urgent because it is sooner. Students who skip this step often pour effort into whatever is due next and arrive at high-stakes exams underprepared.",
        ],
      },
      {
        heading: "Step 4: Put everything on one master calendar",
        paragraphs: [
          "Enter every item into a single calendar that you actually check: Google Calendar, Apple Calendar, a paper planner or a study app. Use one color per class so you can scan a week and see which course dominates it.",
          "If your school uses Canvas or Blackboard, most of these systems publish a calendar feed (an .ics link) that you can subscribe to, so new assignments appear automatically. That is helpful, but still cross-check against the syllabus, since professors do not always enter everything into the system.",
        ],
      },
      {
        heading: "Step 5: Find your crunch weeks",
        paragraphs: [
          "Now zoom out and look at the whole semester. Count how many heavy items (exams and major papers) land in each week. Most students discover two or three crunch weeks, usually around midterms and the last two weeks of the term.",
          "Once you can see them, you can act early. Start papers that are due in a crunch week a week sooner. Ask about early exam options if your school offers them. Plan lighter social commitments those weeks. Knowing a crunch is coming is half the battle.",
        ],
      },
      {
        heading: "Step 6: Work backward from each exam",
        paragraphs: [
          "For each exam, count back to create a preparation window. A reasonable default is 7 to 10 days for a midterm and 14 days for a cumulative final. Inside that window, schedule specific sessions rather than a vague intention to \"study more.\"",
          "Break the exam's material into topics using the syllabus's weekly schedule, then assign topics to days. Leave the last two days before the exam for mixed review and practice tests, not new material. Building in a buffer day protects you when something unexpected comes up, which it always does.",
        ],
      },
      {
        heading: "Step 7: Add weekly review blocks",
        paragraphs: [
          "Exams reward steady review far more than last-minute cramming. Reserve a short block each week, 30 to 60 minutes per class, to review that week's lectures. These small sessions dramatically reduce how much you need to relearn before each exam, because you are refreshing memories before they fade.",
        ],
      },
      {
        heading: "Step 8: Revisit the plan every Sunday",
        paragraphs: [
          "No plan survives a semester unchanged. Professors move dates, you get sick, a lab runs long. Spend ten minutes each Sunday comparing your calendar with any announcements, then adjust the coming week. This habit keeps the schedule trustworthy, and a schedule you trust is one you will actually follow.",
          "Tools like SyllabusStudy can read a syllabus and pull the dates out automatically, which saves time, but the thinking behind this process, weighting, spotting crunch weeks and working backward, is what makes any schedule effective.",
        ],
      },
    ],
    takeaways: [
      "Extract every dated item, not only exams.",
      "Plan study time in proportion to grade weight.",
      "Use one master calendar and identify crunch weeks early.",
      "Work backward 7–14 days from each exam and keep a buffer day.",
      "Review the plan for ten minutes every week.",
    ],
  },
  {
    slug: "active-recall-spaced-repetition",
    title: "Active Recall and Spaced Repetition: The Science-Backed Way to Study for College Exams",
    description:
      "Why rereading notes fails, how active recall and spaced repetition strengthen memory, and a practical daily flashcard routine you can start today.",
    category: "Study techniques",
    readMinutes: 10,
    intro:
      "If you have ever reread your notes three times, felt confident, and then blanked on the exam, you have experienced the gap between recognizing information and recalling it. Two techniques from decades of learning research close that gap: active recall and spaced repetition. Together they are among the most reliable study methods known, and both are simple to use.",
    sections: [
      {
        heading: "Why rereading feels productive but isn't",
        paragraphs: [
          "Rereading creates a feeling of fluency. The material looks familiar, so your brain concludes that you know it. But familiarity is not the same as being able to produce an answer from memory, which is exactly what an exam asks you to do.",
          "Research on learning, including widely cited reviews of study techniques by cognitive psychologists, consistently rates rereading and highlighting as low-utility methods. They are not useless, but they produce far less long-term retention per hour than practice testing and distributed practice.",
        ],
      },
      {
        heading: "What active recall is",
        paragraphs: [
          "Active recall means pulling information out of your memory instead of putting it in. Closing the book and asking yourself \"What are the three stages of mitosis and what happens in each?\" is active recall. So is answering a flashcard, doing practice problems without looking at the solution, or explaining a concept aloud to a friend.",
          "This is sometimes called the testing effect: the act of retrieving a memory strengthens it, making it easier to retrieve the next time. Struggling a little is part of the process. Effortful retrieval tends to produce stronger memories than easy review.",
        ],
      },
      {
        heading: "What spaced repetition is",
        paragraphs: [
          "Memories fade along a predictable curve, often called the forgetting curve. Spaced repetition takes advantage of it by reviewing material just as you are about to forget it. Each successful review pushes the next forgetting point further away.",
          "In practice, this means reviewing new material after about a day, then after a few days, then after a week, then after a few weeks. Material you get wrong comes back sooner; material you know well comes back less often. You spend your time where it is needed.",
        ],
      },
      {
        heading: "The Leitner box system",
        paragraphs: [
          "One easy way to run spaced repetition with paper flashcards is the Leitner system. You use several boxes, each reviewed less often than the last.",
        ],
        list: [
          "Box 1: review every day",
          "Box 2: review every 2–3 days",
          "Box 3: review once a week",
          "Box 4: review every two weeks",
          "Box 5: review before the exam",
          "A correct answer moves a card up one box; a wrong answer sends it back to Box 1.",
        ],
      },
      {
        heading: "How to write good flashcards",
        paragraphs: [
          "Bad flashcards are the main reason students give up on this method. A good card asks one clear question with one clear answer. Instead of \"Explain the French Revolution,\" write separate cards for causes, key dates and outcomes.",
          "Phrase cards as questions that make you think, not just definitions to recognize. \"Why does increasing temperature speed up most reactions?\" teaches more than \"Activation energy = ?\" Add a short example where you can, and keep each answer brief enough to say in one breath.",
        ],
      },
      {
        heading: "A realistic daily routine",
        paragraphs: [
          "Consistency beats intensity. Twenty to thirty minutes of daily review is more effective than a four-hour session once a week.",
        ],
        list: [
          "After each lecture, turn the key ideas into 5–15 flashcards the same day.",
          "Each morning or evening, review the cards your schedule says are due.",
          "Say answers aloud or write them before flipping the card; be honest about mistakes.",
          "Once a week, do a short practice quiz mixing topics from all your classes.",
          "In the week before an exam, add full practice tests under timed conditions.",
        ],
      },
      {
        heading: "Combining both with practice tests",
        paragraphs: [
          "Flashcards are excellent for facts, terms and formulas, but exams also test applying ideas. Practice questions, past exams and end-of-chapter problems are active recall at a higher level. Space them out too: revisit a problem type a few days after you first solve it instead of doing twenty identical problems in one sitting.",
          "Mixing different types of problems within a session, called interleaving, also helps. It forces you to decide which method a problem needs, which is exactly the skill an exam measures.",
        ],
      },
      {
        heading: "Common mistakes to avoid",
        paragraphs: [
          "Avoid making hundreds of cards the night before an exam; spaced repetition needs days or weeks to work. Avoid peeking at answers before genuinely trying. And avoid only reviewing cards you already know because it feels good. The cards you get wrong are the ones doing the most for your grade.",
          "Apps, including SyllabusStudy's flashcard and quiz tools, can generate cards from your notes and schedule reviews for you, but the principle is the same on paper: retrieve, space, repeat.",
        ],
      },
    ],
    takeaways: [
      "Recognition is not recall; test yourself instead of rereading.",
      "Review material at increasing intervals to beat the forgetting curve.",
      "Write one-question, one-answer flashcards phrased to make you think.",
      "Short daily sessions outperform long weekly ones.",
      "Use practice problems and mix topics for application skills.",
    ],
  },
  {
    slug: "ace-stem-classes",
    title: "How to Ace Problem-Heavy STEM Classes: Calculus, Chemistry, Physics and Coding",
    description:
      "Practical strategies for math and science courses: worked examples, error logs, office hours and practice-exam simulation that build real problem-solving skill.",
    category: "Subject strategies",
    readMinutes: 9,
    intro:
      "STEM courses are different from reading-heavy classes. You can understand every lecture and still freeze on a test, because these exams measure whether you can solve unfamiliar problems under time pressure. The good news is that problem-solving is a trainable skill. This guide covers the habits that consistently separate students who struggle from those who do well.",
    sections: [
      {
        heading: "Understand that watching is not doing",
        paragraphs: [
          "Following a professor's solution on the board feels like learning, but it mostly trains recognition. The skill you need is starting from a blank page. Every hour of watching or reading solutions should be matched by at least as much time solving problems yourself.",
          "A useful test: after studying a worked example, cover the solution and redo it from scratch. If you cannot, you did not yet learn it; you only followed it.",
        ],
      },
      {
        heading: "Use worked examples deliberately",
        paragraphs: [
          "Worked examples are valuable when you are new to a topic. Study one carefully, asking why each step happens. Then immediately try a similar problem without help. Gradually reduce how much of the example you look at, until you can solve problems with none.",
          "Pay attention to the first step of each solution. Many students can carry out the algebra but do not know how to begin. Write down, in plain words, what clue in the problem told the author which method to use.",
        ],
      },
      {
        heading: "Keep an error log",
        paragraphs: [
          "An error log is a simple list of every mistake you make on homework, quizzes and practice tests, with a note about why it happened. Over a few weeks, patterns appear: sign errors, unit mistakes, misreading the question, forgetting a formula, or not knowing where to start.",
        ],
        list: [
          "The problem (or a short description)",
          "What you did wrong",
          "The type of error: concept, procedure, careless or reading",
          "What you will do differently next time",
        ],
      },
      {
        heading: "Subject-specific tips",
        paragraphs: [
          "Calculus: master algebra and trigonometry fundamentals, because most calculus errors are actually algebra errors. Draw graphs whenever possible to check whether answers make sense.",
          "Chemistry: always track units and use dimensional analysis. Memorize a small core of facts (common ions, solubility rules, key constants) so working memory is free for problem-solving.",
          "Physics: start every problem with a diagram and a list of known and unknown quantities. Check the final answer's units and whether its size is physically reasonable.",
          "Programming: write code by hand or in an editor without autocomplete at least sometimes, trace small programs line by line, and read error messages carefully instead of guessing.",
        ],
      },
      {
        heading: "Go to office hours early",
        paragraphs: [
          "Office hours are one of the most underused resources in college. Go in the first few weeks, before you are behind, and bring specific questions: \"I got stuck at this step and don't understand why we substitute here.\" Professors and teaching assistants can diagnose a misunderstanding in minutes that might cost you hours alone.",
          "Tutoring centers and study groups help too, as long as everyone attempts problems first. A study group that only copies one person's answers helps nobody on exam day.",
        ],
      },
      {
        heading: "Simulate the exam",
        paragraphs: [
          "In the week before a test, take at least one full practice exam under real conditions: timed, closed-book (unless the exam is open-book), no phone. Use past exams if your professor provides them, or assemble one from textbook problems across all covered sections.",
          "Grade it honestly, add mistakes to your error log, and then focus your final study days on the weakest topics. This approach also reduces test anxiety, because the real exam feels familiar.",
        ],
      },
      {
        heading: "Stay on top of the material weekly",
        paragraphs: [
          "STEM topics build on each other. If you do not understand week three, week five will be confusing. Do homework soon after the lecture it covers, and review previous topics briefly each week. A steady pace prevents the snowballing confusion that makes many students drop STEM classes.",
          "AI explanation tools can help when you are stuck, but use them to understand a step, then solve the next problem yourself. The exam will not let you ask for help.",
        ],
      },
    ],
    takeaways: [
      "Solve problems from a blank page; watching solutions is not enough.",
      "Fade worked examples and note how each solution begins.",
      "Keep an error log to find your mistake patterns.",
      "Use office hours early with specific questions.",
      "Take at least one timed practice exam before every test.",
    ],
  },
  {
    slug: "lecture-note-taking-systems",
    title: "Lecture Note-Taking Systems Compared: Cornell, Outline, Boxing and Mapping",
    description:
      "An honest comparison of the most popular college note-taking methods, when each works best, and how to turn lecture notes into exam-ready review sheets.",
    category: "Note-taking",
    readMinutes: 9,
    intro:
      "Good notes do two jobs: they help you process ideas during the lecture, and they give you something useful to study from later. No single method is best for every class. This guide compares four popular systems, explains when each shines, and shows how to turn any set of notes into a strong review tool.",
    sections: [
      {
        heading: "Why the method matters",
        paragraphs: [
          "Trying to write down everything a professor says is the most common note-taking mistake. Verbatim notes take all your attention and leave none for understanding. Effective note-taking is selective: capturing main ideas, relationships and examples in your own words.",
          "Studies comparing typed and handwritten notes suggest that the key factor is processing, not the tool. Laptop users who transcribe word-for-word tend to remember less, while anyone who summarizes in their own words does better. Choose a method that pushes you to think.",
        ],
      },
      {
        heading: "The Cornell method",
        paragraphs: [
          "Divide your page into three areas: a narrow left column for cues, a wide right column for notes, and a strip at the bottom for a summary. During class, write notes on the right. After class, write questions or keywords in the left column, then a two- or three-sentence summary at the bottom.",
          "Cornell notes are excellent for studying, because you can cover the right side and quiz yourself using the cues, which is built-in active recall. They work well in lecture-based classes such as history, psychology, biology and business.",
        ],
      },
      {
        heading: "The outline method",
        paragraphs: [
          "Outlines use headings and indented bullet points to show how ideas relate: main topic, subtopic, supporting detail. They are fast, tidy and easy to type.",
          "Outlines work best when the lecture is well organized and follows a clear structure, such as in many law, political science and textbook-driven courses. They struggle when a professor jumps between ideas, because the hierarchy becomes messy.",
        ],
      },
      {
        heading: "The boxing method",
        paragraphs: [
          "In boxing, you group related notes and draw a box around each topic as the lecture moves on. Each box becomes a self-contained chunk you can review on its own. On a tablet, you can use colors or shapes to the same effect.",
          "Boxing is visually clear and suits students who like seeing information in separate blocks. It works well for courses with distinct topics per lecture and makes it easy to pick out one section to review.",
        ],
      },
      {
        heading: "Mind mapping",
        paragraphs: [
          "Mind maps start with a central concept and branch outward to related ideas, with lines showing connections. They capture relationships better than any linear method.",
          "They are great for brainstorming, literature, and classes about systems with many connected parts, such as ecology or economics. They are harder to use in fast lectures with lots of detail, so many students draw a mind map after class to summarize linear notes.",
        ],
      },
      {
        heading: "Choosing a method for each class",
        paragraphs: [
          "You do not have to use one system everywhere. Many successful students mix them:",
        ],
        list: [
          "Lecture-heavy humanities and social sciences: Cornell",
          "Highly structured, textbook-based courses: outline",
          "Courses with distinct topics each day: boxing",
          "Concept-heavy or connected subjects: mind map after class",
          "Math and science: worked examples with a short note on each step's reasoning",
        ],
      },
      {
        heading: "Turning notes into review sheets",
        paragraphs: [
          "Notes are only half the job. Within 24 hours of class, spend ten minutes reviewing them: fill gaps, fix unclear parts, and write questions in the margin. This quick pass dramatically improves retention.",
          "Before an exam, condense each week's notes into a one-page review sheet. The act of choosing what matters most is itself a powerful study activity. Then convert the key facts into flashcards and practice questions so you can test yourself instead of rereading.",
        ],
      },
      {
        heading: "Recording and transcripts",
        paragraphs: [
          "Recording lectures (with your professor's permission and according to school policy) can help you fill gaps, but it is not a replacement for engaged note-taking. Students who rely only on recordings often never go back to listen. If you record, use the recording to check and complete your own notes, not instead of them.",
          "Tools that turn lecture recordings into organized notes, including SyllabusStudy's lecture notes feature, save time, but reviewing and quizzing yourself on those notes is still where the learning happens.",
        ],
      },
    ],
    takeaways: [
      "Summarize in your own words; avoid verbatim transcription.",
      "Cornell notes have built-in self-testing.",
      "Match the method to the class and lecture style.",
      "Review notes within 24 hours.",
      "Condense notes into one-page sheets and flashcards before exams.",
    ],
  },
  {
    slug: "prepare-for-midterms-in-7-days",
    title: "How to Prepare for College Midterms in 7 Days: A Day-by-Day Plan",
    description:
      "A realistic seven-day roadmap for midterm preparation when time is short: triage topics, practice-test strategically, protect sleep and walk in confident.",
    category: "Exam prep",
    readMinutes: 8,
    intro:
      "Ideally you would review steadily all semester. Realistically, many students find a midterm one week away and a pile of material they barely remember. Seven focused days is enough time to prepare well if you use them strategically. This plan prioritizes what matters most and builds in the practice that actually raises scores.",
    sections: [
      {
        heading: "Day 7: Triage the material",
        paragraphs: [
          "Start by finding out exactly what the exam covers. Check the syllabus, announcements and any study guide your professor posted. List every topic and rate your confidence in each from 1 (lost) to 3 (solid).",
          "Then rank topics by two factors: how much the professor emphasized them (time in lecture, homework, review sessions) and how weak you are. High-emphasis, low-confidence topics come first. Gather materials, past quizzes and practice exams today so you do not waste time later.",
        ],
      },
      {
        heading: "Day 6: Attack the weakest major topic",
        paragraphs: [
          "Spend your main study block on your top-priority topic. Review the core idea quickly, then move straight to problems or self-quizzing. Make flashcards for definitions, formulas and key facts as you go.",
          "Study in focused blocks of 45 to 50 minutes with short breaks. Put your phone in another room. One hour of real focus beats three distracted hours.",
        ],
      },
      {
        heading: "Day 5: Second and third priorities",
        paragraphs: [
          "Begin with a 15-minute flashcard review of yesterday's cards, then cover your next two priority topics using the same approach: brief review, then active practice. Note any questions you cannot answer so you can ask your professor or teaching assistant.",
        ],
      },
      {
        heading: "Day 4: Fill gaps and get help",
        paragraphs: [
          "Go to office hours, a tutoring session or a review session with your list of questions. Getting a confusing concept explained in five minutes can save hours of struggling alone. Spend the rest of the day on remaining medium-priority topics and continue daily flashcard review.",
        ],
      },
      {
        heading: "Day 3: Full practice exam",
        paragraphs: [
          "Take a complete practice exam under real conditions: timed, no notes, no phone. Use a past exam, a practice test from your professor, or a self-made test drawing questions from every topic.",
          "Grade it carefully. Every wrong answer tells you where to focus next. Sort mistakes into \"didn't know it\", \"knew it but made an error\" and \"misread the question\", because each needs a different fix.",
        ],
      },
      {
        heading: "Day 2: Target mistakes and mix topics",
        paragraphs: [
          "Spend today fixing what the practice exam revealed. Redo missed problems without looking at the answers, then try similar ones. Finish with a mixed set of questions from all topics, so you practice recognizing which approach each question needs.",
          "Make a one-page summary sheet of key formulas, concepts and common traps. Even if you cannot bring it into the exam, creating it is excellent review.",
        ],
      },
      {
        heading: "Day 1: Light review and rest",
        paragraphs: [
          "The day before the exam is not for learning new material. Review your summary sheet and flashcards, do a few practice questions to stay warm, and stop at a reasonable hour.",
          "Prepare everything you need: student ID, calculator, pencils, the exam room and time. Then sleep. Sleep is when the brain consolidates memories, and research consistently links all-nighters to worse exam performance, not better.",
        ],
      },
      {
        heading: "Exam day",
        paragraphs: [
          "Eat a normal breakfast, arrive early, and do a quick five-minute flashcard warm-up if it calms you. When the exam starts, skim the whole test, answer questions you are sure about first, and keep an eye on the clock. If you get stuck, mark the question and move on, coming back later with fresh eyes.",
        ],
      },
      {
        heading: "Making the next exam easier",
        paragraphs: [
          "After the midterm, take ten minutes to note what worked and what did not. Then start a weekly review habit so the final is less stressful. Even 30 minutes per class per week, using flashcards and short quizzes, will make your next seven-day sprint far easier. Study tools like SyllabusStudy can generate practice quizzes and flashcards from your class notes to make that weekly habit quicker.",
        ],
      },
    ],
    takeaways: [
      "Triage topics by professor emphasis and your confidence.",
      "Spend most time on active practice, not rereading.",
      "Take a full timed practice exam three days out.",
      "Fix mistakes and mix topics in the final days.",
      "Protect sleep the night before; skip the all-nighter.",
    ],
  },
];

export function getGuide(slug: string): Guide | undefined {
  return GUIDES.find((g) => g.slug === slug);
}
