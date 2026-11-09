import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
const bank=JSON.parse(readFileSync(new URL('../Data/Class IX/Computer_MCQs.json',import.meta.url),'utf8'));
test('Class IX Computer preserves chart options and both original table figures',()=>{
 assert.equal(bank.questions.length,70);
 for (const [i,suffix] of [[20,'chart-options'],[26,'total-table'],[27,'percentage-table']]) {
   const q=bank.questions[i]; assert.equal(q.image,`question-images/class-ix-computer-office-${suffix}.svg`);
   assert.ok(existsSync(new URL(`../public/${q.image}`,import.meta.url)));
   assert.equal(Object.keys(q.options).length,4);
 }
 assert.ok(!bank.questions[26].text.includes('[Table transcription'));
 assert.ok(!bank.questions[27].text.includes('[Table transcription'));
});
