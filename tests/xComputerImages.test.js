import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const bank=JSON.parse(readFileSync(new URL('../Data/Class X/Computer_MCQs.json',import.meta.url),'utf8'));
test('Scratch diagrams retain source imagery without giving away the answer',()=>{
 for(const [i,name] of [[54,'move-block'],[56,'repeat-block'],[57,'coordinate-grid']]){
  assert.equal(bank.questions[i].image,`question-images/class-x-computer-${name}.svg`);
  assert.ok(existsSync(new URL(`../public/${bank.questions[i].image}`,import.meta.url)));
 }
 assert.equal(bank.questions[57].text,'In the given picture identify the x and y coordinates (positions) of Point – A.');
 assert.ok(!bank.questions[57].text.includes('100 units'));
});
