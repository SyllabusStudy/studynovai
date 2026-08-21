import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { TutorChat } from "@/components/TutorChat";
import { Hint } from "@/components/Hint";

export const Route = createFileRoute("/_authenticated/tutor")({
  head: () => ({
    meta: [
      { title: "AI Tutor — StudyMate AI" },
      {
        name: "description",
        content: "Ask questions and get answers grounded in your own syllabi, notes and slides.",
      },
      { property: "og:title", content: "AI Tutor — StudyMate AI" },
      { property: "og:description", content: "Answers grounded in your own course materials." },
    ],
  }),
  component: TutorPage,
});

function TutorPage() {
  return (
    <div>
      <PageHeader
        title="AI Tutor"
        description="Answers come from your own uploaded materials, with the source named."
      />
      <Hint id="tutor-ask" point="down" className="mb-4">
        Ask anything about a class — StudyMate already knows your syllabus, assignments and uploaded notes, so just type like you're texting a friend.
      </Hint>
      <TutorChat />
    </div>
  );
}
