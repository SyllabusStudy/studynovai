import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ClassActionBar } from "@/components/ClassActionBar";
import { PageHeader } from "@/components/PageHeader";
import { TutorChat } from "@/components/TutorChat";
import { TutorHistory } from "@/components/TutorHistory";
import { Hint } from "@/components/Hint";
import { AiKeySetupBanner } from "@/lib/ai-key-gate";
import { clearTabMemory } from "@/lib/tab-memory";
import type { ConversationRow } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/tutor")({
  head: () => ({
    meta: [
      { title: "AI Tutor — SyllabusStudy" },
      {
        name: "description",
        content: "Ask questions and get answers grounded in your own syllabi, notes and slides.",
      },
      { property: "og:title", content: "AI Tutor — SyllabusStudy" },
      { property: "og:description", content: "Answers grounded in your own course materials." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TutorPage,
});

function TutorPage() {
  return (
    <div>
      <PageHeader
        title="AI Tutor"
        description="Ask anything — answers come from your own class materials."
      />
      <ClassActionBar hide={["tutor"]} />
      <AiKeySetupBanner />
      <Hint id="tutor-ask" point="down" className="mb-4">
        Ask anything about a class — SyllabusStudy already knows your syllabus, assignments and uploaded notes, so just type like you're texting a friend.
      </Hint>
      <TutorChat />
    </div>
  );
}
