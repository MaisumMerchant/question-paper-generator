# Paperloom

Paperloom turns structured JSON question banks into printable, chapter-balanced question papers.

## Included data

- Classes IX, X, XI and XII
- Biology, Chemistry, Computer Science, Mathematics and Physics
- 20 validated question banks containing 3,475 questions
- Native chapter, section, question type, source, year and multipart-question support
- KaTeX rendering for mathematical, scientific and chemical notation

## Paper customization

- Filter by section, type, source and year
- Search and manually include or exclude individual questions
- Select chapters and set percentage contributions
- Auto-balance selected chapters
- Set Section B/C question counts and marks
- Add institution, exam title, time and section instructions
- Toggle marks, chapter labels and source/year metadata
- Use a seed to reproduce the same random paper
- Export to Word, PDF, or the browser print dialog
- Upload custom JSON banks and reference PDFs locally

## JSON schema

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
      "parts": [{ "label": "(i)", "text": "Optional subpart" }]
    }
  ]
}
```

Math is written as KaTeX-compatible text inside `$...$`.

## Development

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
```

The GitHub Pages workflow deploys the site after pushes to `main` or the active feature branch.
