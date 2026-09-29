# Improve Humanize Rewrite Quality

## Goal
Make Humanize produce a meaningfully restructured, natural student-style rewrite while preserving the original meaning, facts, citations, terminology, and tone.

## Changes
- Rewrite flagged text in coherent passages rather than treating every sentence as an isolated synonym swap.
- Strengthen the AI instructions to vary sentence and paragraph structure, rhythm, transitions, and phrasing without inventing personal details or new claims.
- Compare each generated passage with the original using lexical and structural similarity checks.
- Automatically retry overly similar output with stronger reconstruction guidance, then reject any result that remains superficial.
- Ensure the page displays the accepted rewritten passage and never substitutes the original after completion.
- Keep the existing Pro access check, detector behavior, buttons, layout, and detector disclaimer unchanged.

## Verification
- Add focused tests for identical, lightly paraphrased, and genuinely restructured text.
- Run the Humanize-related tests and confirm the app builds successfully.
- Test a 100+ word AI-style paragraph when a usable Pro account and AI key are available; otherwise report that live limitation explicitly.

## Technical details
- Preserve the shared student-key AI request path and its retry/error rules.
- Keep retries bounded and only regenerate when the returned rewrite is missing or too similar.
- Do not claim or imply detector bypass guarantees.
