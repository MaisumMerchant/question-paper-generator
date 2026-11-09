import test from 'node:test';
import assert from 'node:assert/strict';
import { hasArabicScript } from '../src/rtlText.js';
test('recognizes Urdu and Arabic script without changing Latin or mathematics', () => {
  assert.equal(hasArabicScript('لفظ قرآن کے لغوی معنی ہیں'), true);
  assert.equal(hasArabicScript('بِسْمِ اللَّهِ'), true);
  assert.equal(hasArabicScript('Question $x^2+1$'), false);
  assert.equal(hasArabicScript(''), false);
});
