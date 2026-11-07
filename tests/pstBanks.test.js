import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

for (const className of ['X', 'XII']) {
  test(`Class ${className} PST bank has compatible question records`, () => {
    const bank = JSON.parse(readFileSync(new URL(`../Data/Class ${className}/PST.json`, import.meta.url), 'utf8'));
    assert.equal(bank.class, className);
    assert.equal(bank.subject, 'PST');
    assert.ok(bank.questions.length);
    for (const q of bank.questions) {
      assert.ok(q.chapter?.trim());
      assert.ok(q.text?.trim());
      assert.ok(['A', 'B', 'C'].includes(q.section));
      assert.ok(['mcq', 'short', 'long', 'numerical'].includes(q.type));
      assert.ok(['past_paper', 'important_book'].includes(q.source));
      assert.ok(q.year === null || Number.isInteger(q.year));
    }
  });
}
