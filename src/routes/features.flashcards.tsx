import { createFileRoute, redirect } from "@tanstack/react-router";

// Old feature link — send visitors straight to the Flashcards tool.
export const Route = createFileRoute("/features/flashcards")({
  beforeLoad: () => {
    throw redirect({ to: "/flashcards", statusCode: 301 });
  },
});
