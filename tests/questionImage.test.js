import test from 'node:test';
import assert from 'node:assert/strict';
import { questionImageUrl } from '../src/questionImage.js';
import { createDraft, draftSnapshot } from '../src/draftPaper.js';
test('question image paths are scoped and work under a deployment base', () => {
  assert.equal(questionImageUrl('question-images/example.svg', '/question-paper-generator/'), '/question-paper-generator/question-images/example.svg');
  for (const bad of ['../private.png', 'https://example.org/a.png', 'question-images/../a.png', 'question-images/x.png']) assert.throws(() => questionImageUrl(bad));
});
test('draft snapshots retain question diagrams', () => {
  const image = 'question-images/example.svg';
  const draft = createDraft({class:'X',subject:'Maths',questions:[{section:'A',text:'Diagram?',image}]});
  assert.equal(draftSnapshot(draft).questions[0].image, image);
});
