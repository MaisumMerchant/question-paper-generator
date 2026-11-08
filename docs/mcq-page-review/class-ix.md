# Class IX MCQ page review — handoff (work in progress)

## Status and scope

This is a **page-location review**, not a finished OCR transcription or an exhaustive inventory. An earlier Tesseract run generated candidate pages; a model then visually inspected the candidate-page images and, for heading-marked candidates, nearby continuation pages. It also checked additional chapter-review pages in Physics and Maths. The selections below record pages with apparent multiple-choice exercises, not answers or structured question text. Some non-candidate pages were not examined and additional MCQs may have been missed. Do not treat this as a complete Class IX question bank. No split PDFs or question JSON files were produced or changed in this review.

Page numbers are **1-based PDF viewer pages**, not the printed page numbers. Whole-page extracts often include short-answer questions, true/false, summaries, or other material. Some questions require a passage or preceding page that is not included. Check the SHA-256 against the exact reviewed edition before splitting; the page lists are not transferable to a different PDF edition. Machine-readable page arrays, original download links, page counts and hashes are in `class-ix-reviewed.json`.

## Visually identified page ranges

| Subject | PDF pages | Source book / ID | Suggested output filename |
| --- | --- | --- | --- |
| Biology | 20-21, 31-32, 53-54, 95-96, 111-112, 122-123, 142-143, 177-178, 209-210 | [STBB 117](https://portal.stbb.edu.pk/ebooks/book.php?id=117) | `Biology_MCQs.pdf` |
| Chemistry | 34-35, 57, 73-74, 94-96, 122, 144-145, 163-164, 186 | [STBB 195](https://portal.stbb.edu.pk/ebooks/book.php?id=195) | `Chemistry_MCQs.pdf` |
| Computer | 32-33, 49-50, 65-66, 98-99, 119-120, 144-145, 163-164 | [STBB 121](https://portal.stbb.edu.pk/ebooks/book.php?id=121) | `Computer_Science_MCQs.pdf` |
| Maths | 28, 55, 83-84, 106, 124-125, 138-139, 163, 183-184, 195, 205, 216, 226, 237, 245-246, 270 | [STBB 180](https://portal.stbb.edu.pk/ebooks/book.php?id=180) | `Math_MCQs.pdf` |
| Physics | 30-31, 60, 86-87, 114-115, 134-135, 156-158, 176-177, 195-196, 220-221 | [STBB 174](https://portal.stbb.edu.pk/ebooks/book.php?id=174) | `Physics_MCQs.pdf` |
| English | 11-12, 35-36, 103, 109, 118-120, 144-145, 150-151, 169-170, 210-212 | [STBB 147](https://portal.stbb.edu.pk/ebooks/book.php?id=147) | `English_MCQs.pdf` |
| Islamiat | 11, 18, 24, 31, 39, 45, 50, 54, 58, 63, 68, 74, 82, 85, 93, 104, 113, 118, 136, 144, 147, 151, 156, 163, 168, 171, 176 | [STBB 267](https://portal.stbb.edu.pk/ebooks/book.php?id=267) | `Islamiat_MCQs.pdf` |
| Urdu | Unresolved — see below | [STBB 13](https://portal.stbb.edu.pk/ebooks/book.php?id=13) | Not specified |


## Important exceptions

- **Physics:** This list targets chapter-end Section A MCQs. Some other Section B problems use multiple-choice formats and are not represented. The source has upside-down scans, including PDF pages 60, 86–87, 134–135, 156 and 220. The original OCR missed several of them; rotate for viewing or OCR and visually recheck the whole book before calling the list complete. The splitter preserves the original orientation.
- **Maths:** The list targets MCQ review blocks, not every practice question. Unit 15 review pages 253–254 were inspected and no MCQ block was identified there; other pages still need review.
- **English:** MCQs are distributed through lessons rather than consistently grouped in review blocks. Page 103 is a listening/study-skills activity marked not to be formally assessed. Pages 151 and 212 include inline alternatives rather than only standard lettered MCQs. Decide whether these belong before extraction. Some items refer to reading/listening passages outside the selected pages; retain context as needed. Additional unflagged pages may contain questions.
- **Islamiat:** Candidate pages were visually inspected, but neighboring pages were not systematically checked for all exercises. Several pages combine multiple-choice items with other questions and Arabic text.
- **Urdu:** All 52 PDF-page thumbnails were scanned visually, each containing two printed pages. No reliable MCQ page list was established: the small Urdu text requires higher-resolution review by an Urdu reader. An empty page array means **unresolved**, not “no MCQs.” This source covers IX–X.
- The repository already contains several Class IX `*_MCQs.pdf` and JSON files; do not overwrite them without comparing their content and intended conventions. English and Islamiat suggested names are proposals, not existing filenames. The user intended to split and push PDFs themselves.

## Next steps for the next agent

1. Verify these source editions against the hashes and page counts in the manifest. Compare the existing repository PDFs/JSON before changing anything.
2. Review every unexamined page and continuation around exercises, especially English, Islamiat, rotated Physics and Urdu at readable resolution. Mark discoveries and scope decisions in the manifest; don't equate OCR misses with absence.
3. Decide whether to include mixed-format pages and reading passages. User can run the optional splitter below locally; it copies whole source pages and does not crop or transcribe MCQs.
4. Later, perform a separate model-assisted transcription into the repository's question JSON schema, checking mathematical notation, Arabic/Urdu text, answer keys and source context. No such transcription has been completed here.
5. Repeat for Classes X–XII. The prior candidate kit covers 29 books but is heuristic and requires visual verification; it is not an authoritative page list.

## Optional extraction (local; does not push anything)

Install PyMuPDF (`pip install pymupdf`). Put the reviewed source PDFs in a directory using the `source_filename` names from the manifest. From the repository root:

```sh
python scripts/split_reviewed_mcq_pages.py --manifest docs/mcq-page-review/class-ix-reviewed.json --books /path/to/books --output /path/to/output --subject Biology
```

The script refuses hash mismatches and existing outputs unless separately overridden, and skips the unresolved Urdu book. Review/edit page selections first. Omit `--subject` to process all resolved subjects. Verify results visually before committing or replacing files.
