import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDraft } from '../src/draftPaper.js';
const bank = JSON.parse(readFileSync(new URL('../Data/Class IX/Islamiat_MCQs.json', import.meta.url), 'utf8'));
test('English Islamiat preserves all extract-page questions and source limitations', () => {
  assert.equal(bank.class, 'IX'); assert.equal(bank.subject, 'Islamiat (English)');
  assert.equal(bank.questions.length, 102);
  assert.equal(new Set(bank.questions.map(q => q.source_pdf_page)).size, 31);
  assert.equal(new Set(bank.questions.map(q => q.chapter)).size, 4);
  assert.equal(bank.questions.filter(q => Object.keys(q.options).length === 3).length, 5);
  for (const q of bank.questions) {
    assert.deepEqual(Object.keys(q.options), ['A', 'B', 'C', 'D'].slice(0, Object.keys(q.options).length));
    assert.ok(q.chapter && q.text && Object.values(q.options).every(Boolean));
    assert.ok(!q.answer && !JSON.stringify(q).includes('\ufffd'));
  }
  const truncated = bank.questions.find(q => q.source_pdf_page === 15 && q.source_question === 3);
  assert.match(truncated.text, /truncated in the source/);
  assert.equal(truncated.options.D, 'great Jihad (Jihad-e-A');
  assert.ok(bank.questions.some(q => /[\u0600-\u06ff]/u.test(q.text)));
  const draft = createDraft({class:'IX', subject:bank.subject, questions:[bank.questions[0]]});
  assert.deepEqual(Object.keys(draft.questions[0].options), ['A','B','C','D']);
});
