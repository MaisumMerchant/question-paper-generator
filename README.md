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
6. Set Section A (MCQ), Section B and Section C counts, marks, paper details and display options.
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
- Set Section A/B/C question counts and marks, including MCQ marks
- Add institution, examination title, time and section instructions
- Toggle marks, chapter labels, source/year metadata and the MCQ answer key
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

### MCQ banks (Section A)

Each class and subject also has a matching `*_MCQs.json` bank with `section: "A"`, `type: "mcq"` questions. Each MCQ carries an `options` object keyed by `A`–`D` (and `answer` when the source PDF includes an answer key):

```json
{
  "chapter": "Organic Chemistry",
  "section": "A",
  "type": "mcq",
  "source": "important_book",
  "year": null,
  "text": "Which one of the following is an alkane?",
  "options": { "A": "$C_2H_4$", "B": "$C_2H_6$", "C": "$C_3H_4$", "D": "$C_3H_6$" },
  "answer": "B"
}
```

MCQ banks merge into the matching class/subject bank in the studio, so one bank covers Sections A, B and C. Chapter names match the non-MCQ bank, so chapter selection applies across all three sections at once. Generated papers print MCQs with their options; enable **Answer key (Section A)** to append the key when the bank contains answers.

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

## No-login shared paper library

**Save to shared library** exports a PDF and its question/settings JSON to Cloudflare Workers KV (Free plan, no card required) through a protected Worker. **Shared papers** browses the public library, downloads PDFs/questions and copies direct paper links. Viewing does not need an account; saving or replacing papers requires a private owner publishing key. Public-sharing consent, server-side Turnstile verification, upload/read limits, file-size checks and owner-protected replacement and no anonymous delete routes protect the upload flow.

The GitHub Pages site remains static. Cloud storage uses a separately deployed **Workers Free + KV Free** service. Its public API origin and Turnstile site key are configured in `public/cloud-config.json`; owner maintenance instructions are in [Cloudflare setup](cloudflare/README.md). An empty configuration shows an honest setup-pending state. Cloudflare secrets never belong in frontend code. Public uploads must not contain confidential exams or personal information.

## Professional exam PDF layout

PDF export and Save to shared library use the same A4 exam renderer: white pages, black text, 14-point body text, clear section headings, aligned marks, monospace code/output, automatic pagination and page-number footers. Questions and subparts remain together when possible. Prose and code are searchable PDF text; mathematical formulae are rendered as high-resolution artwork. The on-screen paper preview uses the same plain exam styling.

### Optional exam questions

Default structure: eight Section B questions at four marks (attempt five), and three Section C questions at ten marks (attempt two). Set questions-to-attempt independently of questions printed; the header and PDF totals count attempted questions, not all offered choices. Leave an attempt field blank for all questions. Sections without questions contribute zero marks.

### Balanced random generation

With **Balance evenly** enabled, each section gets equal chapter quotas, independent of question-bank size and rounded display percentages. Eight short questions from two chapters means four per chapter. Three long questions means two from one chapter and one from the other; tied extra slots are assigned randomly. Questions are randomly sampled within each quota and shuffled in the paper. A seed preserves repeatability. Custom percentage mode uses proportional integer quotas instead. Chapters with too few questions contribute what is available, and unfilled slots are redistributed among the other selected chapters with eligible questions. No questions are invented or duplicated to fill a shortage. Existing shared PDFs are unchanged.

Run allocator regression tests with `node --test tests/questionAllocation.test.js`.

### Permanent latest-paper sharing links

Each class and subject has one stable public PDF link. Save to shared library updates that link to the latest saved paper without adding duplicate library entries; generating a preview does not publish it. All saves require a private owner publishing key configured as the Worker’s `PUBLISH_KEY` secret. Readers remain public and need no sign-in. The key can optionally be remembered on a trusted device. See the Cloudflare setup guide for configuration and consistency limits.
