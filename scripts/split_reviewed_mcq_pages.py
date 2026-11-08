#!/usr/bin/env python3
"""Copy selected whole pages from verified textbook PDFs; never push files."""
import argparse
import hashlib
import json
from pathlib import Path
import fitz

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--manifest', type=Path, required=True)
p.add_argument('--books', type=Path, required=True)
p.add_argument('--output', type=Path, required=True)
p.add_argument('--subject', help='Only process this subject')
p.add_argument('--force', action='store_true', help='Allow overwriting an existing output')
p.add_argument('--allow-hash-mismatch', action='store_true', help='Unsafe unless edition/page mapping has been reverified')
a = p.parse_args()
manifest = json.loads(a.manifest.read_text(encoding='utf-8'))
books = [b for b in manifest['books'] if not a.subject or b['subject'].lower() == a.subject.lower()]
if not books:
    p.error('Unknown subject')
a.output.mkdir(parents=True, exist_ok=True)
for book in books:
    pages = book['selected_pdf_pages_1_based']
    if not pages:
        print(f"SKIP {book['subject']}: no reviewed selection (unresolved)")
        continue
    source = a.books / book['source_filename']
    destination = a.output / book['suggested_output_filename']
    if source.resolve() == destination.resolve():
        raise SystemExit(f'Refusing to overwrite source: {source}')
    if destination.exists() and not a.force:
        raise SystemExit(f'Output already exists: {destination} (use --force to overwrite)')
    with source.open('rb') as f:
        digest = hashlib.file_digest(f, 'sha256').hexdigest()
    if digest != book['sha256'] and not a.allow_hash_mismatch:
        raise SystemExit(f'Source hash mismatch for {source}; verify edition and page list')
    with fitz.open(source) as src, fitz.open() as dst:
        if any(not isinstance(page, int) or page < 1 or page > len(src) for page in pages):
            raise SystemExit(f'Invalid page in {book["subject"]}')
        for page in pages:
            dst.insert_pdf(src, from_page=page-1, to_page=page-1)
        # Save to temporary file, then move into place so existing output isn't damaged on failure.
        temp = destination.with_suffix('.tmp.pdf')
        if temp.exists():
            raise SystemExit(f'Temporary file already exists: {temp}')
        try:
            dst.save(temp)
            temp.replace(destination)
        finally:
            temp.unlink(missing_ok=True)
    print(f'Wrote {destination}: {len(pages)} pages')
