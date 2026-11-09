import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDraft } from '../src/draftPaper.js';
const bank = JSON.parse(readFileSync(new URL('../Data/Class IX/Islamiat_Urdu_MCQs.json', import.meta.url), 'utf8'));
test('Urdu Islamiat preserves source labels, page references and three-option questions', () => {
  assert.equal(bank.class, 'IX'); assert.equal(bank.subject, 'Islamiat (Urdu)');
  assert.equal(bank.questions.length, 101);
  assert.equal(new Set(bank.questions.map(q => q.source_pdf_page)).size, 35);
  assert.equal(bank.questions.filter(q => Object.keys(q.options).length === 3).length, 5);
  for (const q of bank.questions) {
    assert.deepEqual(Object.keys(q.options), ['الف', 'ب', 'ج', 'د'].slice(0, Object.keys(q.options).length));
    assert.equal(q.source_printed_page, q.source_pdf_page - 5);
    assert.ok(q.chapter && q.text && Object.values(q.options).every(Boolean));
    assert.ok(!q.answer && !JSON.stringify(q).includes('\ufffd'));
  }
  assert.ok(bank.questions.some(q => q.text.includes('حکماء')));
  assert.ok(bank.questions.some(q => Object.values(q.options).includes('جمع الجوامع')));
});
test('Urdu labels survive draft creation', () => {
  const q = bank.questions[0];
  const draft = createDraft({class:'IX', subject:bank.subject, questions:[q]});
  assert.deepEqual(Object.keys(draft.questions[0].options), ['الف','ب','ج','د']);
});
