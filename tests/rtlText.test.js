import test from 'node:test';
import assert from 'node:assert/strict';
import { hasArabicScript, textDirection } from '../src/rtlText.js';
test('recognizes Urdu and Arabic script without changing Latin or mathematics', () => {
  assert.equal(hasArabicScript('لفظ قرآن کے لغوی معنی ہیں'), true);
  assert.equal(hasArabicScript('بِسْمِ اللَّهِ'), true);
  assert.equal(hasArabicScript('Question $x^2+1$'), false);
  assert.equal(hasArabicScript(''), false);
});

test("mixed-script paragraphs follow their first strong letter", () => {
  assert.equal(textDirection("The Holy Prophet صَلَّى اللّٰهُ"), "ltr");
  assert.equal(textDirection("(الف) قرآن"), "rtl");
  assert.equal(textDirection("123 English"), "ltr");
  assert.equal(textDirection("وَالْمُوفُونَ is related to:", true), "ltr");
  assert.equal(textDirection("سُبْحَانَ اللّٰهِ", true), "rtl");
});
