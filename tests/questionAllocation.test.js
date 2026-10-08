import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateQuestions } from '../src/questionAllocation.js';
function rng(seed) { return () => { seed += 0x6D2B79F5; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function pool(counts) { return Object.entries(counts).flatMap(([chapter, n]) => Array.from({length:n}, (_, i) => ({id:`${chapter}-${i}`,chapter}))); }
function counts(items) { return items.reduce((out, q) => ({...out, [q.chapter]:(out[q.chapter]||0)+1}), {}); }
test('two chapters: 4/4 short, 2/1 long; random extras and samples', () => {
  const candidates = pool({A:30,B:12}); const extras=new Set(); const samples=new Set();
  for(let seed=1;seed<=300;seed++) {
    const short=allocateQuestions(candidates,8,{A:50,B:50},rng(seed));
    assert.deepEqual(counts(short),{A:4,B:4}); samples.add(short.map(q=>q.id).join(','));
    const long=counts(allocateQuestions(candidates,3,{},rng(seed))); assert.deepEqual(Object.values(long).sort(),[1,2]);
    extras.add(long.A===2?'A':'B');
  }
  assert.equal(extras.size,2); assert.ok(samples.size>250);
});
test('three chapters: true equal balance despite rounded percentages', () => {
  const candidates=pool({A:20,B:20,C:20}); const extraChapters=new Set();
  for(let seed=1;seed<=100;seed++) {
    const result=counts(allocateQuestions(candidates,8,{A:34,B:33,C:33},rng(seed)));
    assert.deepEqual(Object.values(result).sort(),[2,3,3]);
    const long=counts(allocateQuestions(candidates,4,{A:34,B:33,C:33},rng(seed)));
    extraChapters.add(Object.keys(long).find(k=>long[k]===2));
  }
  assert.equal(extraChapters.size,3);
});
test('custom percentages use integer quotas',()=>assert.deepEqual(counts(allocateQuestions(pool({A:20,B:20}),8,{A:75,B:25},rng(1),false)),{A:6,B:2}));
test('shortages are redistributed, total capped, no duplicate IDs',()=>{
  const candidates=pool({A:1,B:20,C:20});
  const out=allocateQuestions(candidates,8,{},rng(1)); assert.equal(out.length,8);assert.equal(counts(out).A,1);assert.deepEqual(Object.values(counts(out)).sort(),[1,3,4]);
  const all=allocateQuestions([...candidates,candidates[0]],99,{},rng(1)); assert.equal(all.length,41);assert.equal(new Set(all.map(q=>q.id)).size,41);
});
test('no eligible long questions, fewer slots than chapters, seed repeatability',()=>{
  assert.deepEqual(allocateQuestions([],3),[]);
  const candidates=pool({A:10,B:10,C:10,D:10});
  const out=allocateQuestions(candidates,3,{},rng(42));assert.equal(Object.keys(counts(out)).length,3);
  assert.deepEqual(out,allocateQuestions(candidates,3,{},rng(42)));
});
test('capacity and count invariants over many chapter pools',()=>{
  for(let seed=1;seed<=300;seed++) {
    const candidates=pool({A:seed%6,B:seed%9,C:seed%13,D:seed%4});
    for(const evenly of [true,false]) {
      const out=allocateQuestions(candidates,seed%25,{A:10,B:40,C:0,D:50},rng(seed),evenly);
      assert.equal(out.length,Math.min(seed%25,candidates.length));assert.equal(new Set(out.map(q=>q.id)).size,out.length);
    }
  }
});
