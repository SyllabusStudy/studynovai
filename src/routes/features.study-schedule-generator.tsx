import { createFileRoute, redirect } from "@tanstack/react-router";

// Feature link — send visitors straight to the Calendar (study schedule) tool.
export const Route = createFileRoute("/features/study-schedule-generator")({
  beforeLoad: () => {
    throw redirect({ to: "/calendar", statusCode: 301 });
  },
});
