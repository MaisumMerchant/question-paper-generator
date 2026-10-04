# Paperloom outcomes

- Load and validate JSON question-bank files containing `subject`, `class`, `questions[]`, `section`, `number`, `year`, `text`, and optional `parts[]`; keep bundled archive banks available as examples.
- Derive chapters so Section B starts a chapter, a later Section B after a Section C block starts the next chapter, and unclear or unmatched rows go to Unknown chapter.
- Provide class, subject, and multi-chapter selection from loaded data, plus a related source-PDF upload and preview surface.
- Show the question pool with individual selection controls and preserve optional parts.
- Let users set Section B and Section C generation counts and chapter percentage contributions; normalize allocation and ensure every eligible selected chapter contributes whenever the pool permits.
- Randomly generate a paper from the selected pool and render LaTeX/KaTeX mathematical, chemical, and scientific expressions accurately.
- Preview and download the paper as Word or PDF. The paper output must contain only Section B, Section C, clearly numbered selected questions, and preserved parts; it must omit title, class, subject, date, counts, chapter labels, years, generation notes, and all other extra text.
