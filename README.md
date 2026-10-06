# Paperloom

Paperloom is a responsive question-paper generator for Classes IX–XII. It turns the repository’s validated JSON question banks into printable, chapter-balanced papers and keeps the corresponding source PDF available for reference.

## Included data

- Classes IX, X, XI and XII
- Biology, Chemistry, Computer, Mathematics and Physics
- 20 validated JSON banks containing 3,592 questions
- 20 matching source PDFs
- Chapter, section, question type, source, year and multipart-question support
- KaTeX rendering for mathematical, scientific and chemical notation

## Using the app

1. Choose a **Class**.
2. Choose a **Subject**.
3. Use **View source PDF** to inspect the matching bundled source.
4. Choose chapters and adjust their percentage contributions.
5. Select or exclude questions from those chapters.
6. Set Section B/C counts, marks, paper details and display options.
7. Generate the paper, review it, then print or export it.

The four workflow items jump directly to Chapters, Questions, Structure and Preview. Every step panel can be collapsed to its heading. On mobile, the workflow navigation stays visible as a compact sticky bar so a long question list never blocks access to later steps.

### Question-pool controls

- Search question and subpart text
- Filter the visible list by chapter, section, type, source, year, selection status or multipart status
- Select or deselect visible questions
- Select or deselect the complete active question pool
- Keep filtered-out selections in the generation pool until they are explicitly deselected

### Paper customization

- Search chapters and view all, selected or unselected chapters
- Select or deselect all chapters
- Balance selected chapters evenly by default
- Switch to custom percentages automatically by editing any chapter percentage
- Set Section B/C question counts and marks
- Add institution, examination title, time and section instructions
- Toggle marks, chapter labels and source/year metadata
- Use a seed to reproduce the same random paper
- Export to Word, PDF or the browser print dialog

## Custom JSON banks

Use **Import JSON** to load one or more banks for the current browser session. Imported files stay in the browser and are not uploaded to a server. When an imported bank has the same class and subject as a bundled bank, the imported version is selected.

```json
{
  "subject": "Physics",
  "class": "IX",
  "questions": [
    {
      "chapter": "Physical Quantities and Measurement",
      "section": "B",
      "type": "short",
      "source": "past_paper",
      "year": 2025,
      "text": "Define density. Also write its formula and SI unit.",
      "parts": [
        {
          "label": "(i)",
          "text": "Optional subpart"
        }
      ]
    }
  ]
}
```

`parts` is optional. Mathematical notation should use KaTeX-compatible text inside `$...$`.

## Responsive design

The interface supports desktop, tablet and mobile layouts. Desktop uses a two-column editing workspace; narrower screens switch to a single-column flow, full-width controls, collapsible panels and a sticky workflow navigator. The question list avoids nested scrolling on mobile.

## Development

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
```

The GitHub Pages workflow deploys pushes to `main`.
