# Harder quizzes and modern magazine layout

## Goal
Make generated quizzes more challenging, varied, and useful for college-level learning, while refreshing the full authenticated app into a modern magazine-style workspace. Keep every existing tool and workflow.

## Quiz improvements
- Strengthen the quiz-writing instructions so difficulty changes the kind of thinking required, not just wording.
- For harder levels, prioritize application, comparison, multi-step reasoning, cause-and-effect, error analysis, and scenario questions grounded only in selected materials.
- Require plausible distractors, balanced answer positions, distinct concepts, and no giveaway phrasing.
- Continue checking recent quiz prompts to avoid repeats while keeping generation to one AI request and preserving the current faster context limits.
- Update the quiz setup so students understand what each difficulty level means.

## Modern magazine layout
- Replace the rigid full-height desktop sidebar with a slimmer editorial navigation rail and a wider reading/work area.
- Redesign the top area with clearer page context, search, reminders, profile, and stronger visual hierarchy.
- Restyle shared page headings as editorial mastheads rather than floating cards.
- Adjust global surfaces, spacing, borders, typography scale, and content widths so existing pages inherit the new layout consistently.
- Keep the established Neon Mint palette, Sora/Manrope typography, light/dark modes, mobile bottom navigation, and every current feature.

## Verification
- Check the quiz prompt and controls for all difficulty choices.
- Verify desktop and mobile layouts in the running app, including navigation and representative pages.
- Confirm the app builds cleanly and that no existing tools or routes were removed.

## Technical details
- Primary files: `src/lib/study.server.ts`, `src/routes/_authenticated/quizzes/index.tsx`, `src/components/AppShell.tsx`, `src/components/PageHeader.tsx`, and `src/styles.css`.
- Use existing semantic color tokens and shared UI controls only; no hardcoded component colors.
- Preserve the existing single-call BYO-key AI flow and current fast-generation limits.
