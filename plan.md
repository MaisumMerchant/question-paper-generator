# Paperloom — implementation plan

## Product decisions

Paperloom is a single-page, client-side question-paper studio. The uploaded ZIP is bundled as a set of ready-to-open question banks, while JSON and PDF file pickers support new material without an account or server. The browser keeps all data local to the session.

The chapter classifier walks each bank in source order. The first Section B begins Chapter 01; any later Section B that follows a Section C block begins the next chapter. Section C stays in the current chapter. Other sections, malformed rows, and rows before the first B are assigned to Unknown chapter. Generated output never leaks internal chapter, year, class, subject, or count metadata.

Generation is section-aware: weighted random selection uses chapter percentages, starts with one question from each eligible selected chapter where the requested count permits, and fills remaining slots by weighted shuffled candidates. This gives every selected chapter a contribution whenever the pool makes that possible while still respecting short/long counts.

## Design direction

- **Design movement:** editorial instrument panel — quiet, paper-inspired surfaces with a precise data-workbench spine.
- **Core principles:** visible state, calm hierarchy, tactile controls, and output-first clarity.
- **Color philosophy:** deep forest ink anchors trust and concentration; warm parchment keeps the working surface human; saffron accents make action and progress feel deliberate rather than loud; mint signals valid selections.
- **Layout paradigm:** a persistent left rail for the workflow and a wide split workspace where configuration and paper preview stay in view together.
- **Signature elements:** vertical step rail, ruled paper preview with red margin line, and chapter “stamps” that make allocation feel physical.
- **Interaction philosophy:** every control explains its consequence; selection changes update counts immediately; generation is a single confident action with graceful fallbacks.
- **Animation:** fast 160–220ms ease-out transitions for panels, subtle slide-up for generated paper, no distracting loops.
- **Typography:** Plus Jakarta Sans for interface text; Newsreader for the wordmark and generated-paper feel.
- **Brand essence:** a paper-making desk for teachers who want control without the formatting chores — focused, capable, considerate.
- **Brand voice:** direct and useful. Example lines: “Shape the pool, then let the paper take form.” / “Every selected chapter gets a fair chance.”
- **Wordmark:** “Paperloom” with a stitched baseline motif and a small folded-corner mark.
- **Signature brand color:** forest ink `#163b35`.

## Project structure

- `src/main.jsx` — state, chapter inference, weighted generator, KaTeX rendering, file handling, export actions, and UI composition.
- `src/styles.css` — responsive workbench layout, paper preview, controls, and print-only output rules.
- `public/question-banks/` — bundled JSON banks from the supplied archive plus manifest.
- `public/manus-routes.json` — managed preview route declaration.
- `plan.md` / `TODO.md` — project decisions and acceptance clauses.
