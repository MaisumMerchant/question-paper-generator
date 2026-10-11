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

## Shared papers and draft-only editing

Cloud publishing is currently **paused in the frontend**. The app exposes no save/replace/delete operation for Cloudflare papers. The owner-protected Worker upload endpoint remains deployed for future explicit re-enablement, but this release does not change the Worker, stored papers or permanent links.

1. Open **Shared papers** and choose **Open as draft** beside a published paper. Its saved question/settings JSON is read with GET and copied locally; this does not edit the PDF file itself.
2. In the **Drafts** section, lock any question you want to keep. **Lock all** and **Unlock all** are available.
3. **Regenerate unlocked** changes only unlocked slots. Each replacement stays in its original chapter and section, keeps its position and preserves the existing chapter counts. Existing questions are excluded, including exact-content duplicates across years. If no unused alternative exists in a slot's chapter/section, the original is retained and a status message identifies it.
4. Use **Regenerate B2** (or A/C) for a single question, or **Choose replacement** to pick a specific same-chapter alternative. A chosen replacement is automatically locked.
5. **Edit B2** opens the stem/subparts editor; Section A also supports option and answer-key editing. **Apply edits and lock** keeps the change protected from future regeneration. Locked questions must be unlocked before editing or replacing them.
6. Review the live printable preview or **Preview PDF**, then **Download draft PDF**. Locks and editor controls never appear in the exported PDF. The original paper's marks, attempt counts and instructions are retained; header and instruction text can be changed separately.
7. **Undo last change** restores the preceding question/lock action. **Reset draft** restores the original local copy after confirmation. **Delete local draft** removes only that browser's copy.

Studio previews can also be sent to drafts with **Open preview as draft**. Up to 50 drafts are autosaved using browser localStorage, not Cloudflare. They do not sync across devices and can be lost when browser storage is cleared or unavailable. **Download draft JSON** creates a lock-preserving backup; **Import draft JSON** restores it as a new local draft. If browser storage fails, the app warns you to export a backup. Drafts contain no owner publishing key.

The replacement bank is matched using the saved questions' source provenance before the displayed class/subject. This preserves intentional Class IX/X Computer bank swaps in existing published papers. If a bank is unavailable, manual editing and PDF download still work; regeneration is unavailable. Drafts cannot create missing questions to fill bank shortages.

All cloud-library interactions in the frontend are read-only GET requests. This release does not republish any existing paper.

## Professional exam PDF layout

Studio and draft PDF exports use the same A4 exam renderer: white pages, black text, 14-point body text, clear section headings, aligned marks, monospace code/output, automatic pagination and page-number footers. Questions and subparts remain together when possible. Prose and code are searchable PDF text; mathematical formulae are rendered as high-resolution artwork. The on-screen paper preview uses the same plain exam styling.

### Optional exam questions

Default structure: eight Section B questions at four marks (attempt five), and three Section C questions at ten marks (attempt two). Set questions-to-attempt independently of questions printed; the header and PDF totals count attempted questions, not all offered choices. Leave an attempt field blank for all questions. Sections without questions contribute zero marks.

### Balanced random generation

With **Balance evenly** enabled, each section gets equal chapter quotas, independent of question-bank size and rounded display percentages. Eight short questions from two chapters means four per chapter. Three long questions means two from one chapter and one from the other; tied extra slots are assigned randomly. Questions are randomly sampled within each quota and shuffled in the paper. A seed preserves repeatability. Custom percentage mode uses proportional integer quotas instead. Chapters with too few questions contribute what is available, and unfilled slots are redistributed among the other selected chapters with eligible questions. No questions are invented or duplicated to fill a shortage. Existing shared PDFs are unchanged.

Run allocator regression tests with `node --test tests/questionAllocation.test.js`.

### Permanent latest-paper sharing links

Each class and subject has one stable public PDF link. The owner-protected backend can update that link when publication is explicitly re-enabled in a future release. Publishing is currently paused in the frontend: studio generation, draft edits and downloads do not publish or update it. All saves require a private owner publishing key configured as the Worker’s `PUBLISH_KEY` secret. Readers remain public and need no sign-in. The draft-only frontend does not request or use the publishing key. See the Cloudflare setup guide for configuration and consistency limits.

## Tests

Run `npm test` for chapter allocation and draft-copy, lock, same-chapter replacement, duplicate, provenance and snapshot tests. Run `npm run build` for the production bundle.
