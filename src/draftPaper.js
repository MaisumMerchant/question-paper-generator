// Drafts are local copies. This module has no network or publication operations.
export const DRAFT_STORAGE_KEY = 'paperloom-local-drafts:v1';
export const SECTIONS = ['A', 'B', 'C'];
const copy = value => JSON.parse(JSON.stringify(value));
const uid = () => globalThis.crypto?.randomUUID?.() || `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const subjectKey = value => String(value || '').toLowerCase().replace(/[^a-z]/g, '').replace(/^maths?$/, 'mathematics').replace(/^computer$/, 'computerscience');
function optionsOf(value) {
  if (Array.isArray(value)) return Object.fromEntries(value.map((v,i) => [String.fromCharCode(65+i),String(v)]));
  if (!value || typeof value !== 'object') return null;
  return Object.fromEntries(Object.entries(value).map(([k,v]) => [k.toUpperCase(),String(v)]));
}
export function createDraft(snapshot, record = null) {
  if (!snapshot || typeof snapshot !== 'object' || !Array.isArray(snapshot.questions) || !snapshot.questions.length || snapshot.questions.length > 250) throw new Error('This paper has no supported question snapshot.');
  if (typeof snapshot.class !== 'string' || typeof snapshot.subject !== 'string') throw new Error('The paper snapshot is missing its class or subject.');
  if (snapshot.questions.some(q => !q || !SECTIONS.includes(q.section) || typeof q.text !== 'string')) throw new Error('The snapshot contains an unsupported question.');
  const p = snapshot.paper || {};
  const questions = snapshot.questions.map((q,i) => {
    const { raw, ...safe } = copy(q);
    return { ...safe, id: q.id || `imported-${i}`, type: q.section === 'A' ? 'mcq' : q.type || (q.section === 'C' ? 'long' : 'short'), chapter: String(q.chapter || 'Unknown chapter'),
      parts: (Array.isArray(q.parts) ? q.parts : []).map((part,j) => typeof part === 'string' ? {label:`(${j+1})`,text:part} : {label:String(part?.label || `(${j+1})`),text:String(part?.text || '')}),
      options: optionsOf(q.options), answer: String(q.answer || '').toUpperCase(), _slotId: uid(), locked: false };
  });
  const meta = {institution:'',exam:'',time:'2 hours',attemptA:'',attemptB:'',attemptC:'',instructionsA:'Attempt all questions.',instructionsB:'Attempt all questions.',instructionsC:'Attempt all questions.',showHeader:true,showMarks:true,showChapter:false,showSource:false,showAnswerKey:false,...p.meta};
  const draft = {version:1,id:uid(),name:record?.title ? `${record.title} — draft` : `Class ${snapshot.class} — ${snapshot.subject} — draft`,class:snapshot.class,subject:snapshot.subject,
    source:record ? {id:record.id,title:record.title,savedAt:record.savedAt,shortCode:record.shortCode} : null,
    bankSource:snapshot.bankSource || '',questions,meta,marks:{A:Number(p.mcqMarks ?? 1),B:Number(p.shortMarks ?? 4),C:Number(p.longMarks ?? 10)},createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  draft.original = copy({questions,meta,marks:draft.marks});
  return draft;
}
export function findDraftBank(draft, banks) {
  const sources = new Set([draft.bankSource, ...draft.questions.map(q => String(q.id || '').split('::')[0].replace(/^embedded-/, '').replace(/^Data\//, ''))].filter(Boolean));
  const exact = banks.find(b => sources.has(b.sourceName));
  if (exact) return exact; // Includes intentional IX/X Computer bank swaps in published snapshots.
  return banks.find(b => b.className === draft.class && subjectKey(b.subject) === subjectKey(draft.subject)) || null;
}
export function questionFingerprint(q) {
  return JSON.stringify([String(q.text || '').replace(/^\s*(?:\(or\)|or\))\s*/i,'').normalize('NFKC').toLowerCase().replace(/\s+/g,''),
    (q.parts || []).map(p => String(typeof p === 'string' ? p : p.text || '').normalize('NFKC').toLowerCase().replace(/\s+/g,'')),
    Object.entries(optionsOf(q.options) || {}).sort().map(([k,v]) => [k,v.normalize('NFKC').toLowerCase().replace(/\s+/g,'')])]);
}
export function eligibleReplacements(draft, slotId, pool) {
  const slot = draft.questions.find(q => q._slotId === slotId);
  if (!slot || slot.locked) return [];
  const used = new Set(draft.questions.map(questionFingerprint));
  const seen = new Set();
  return pool.filter(q => {
    const key = questionFingerprint(q);
    if (q.section !== slot.section || q.chapter !== slot.chapter || used.has(key) || seen.has(key)) return false;
    seen.add(key); return true;
  });
}
export function replaceDraftQuestion(draft, slotId, replacement) {
  const slot = draft.questions.find(q => q._slotId === slotId);
  if (!slot || slot.locked) throw new Error('Unlock this question before replacing it.');
  if (!replacement || replacement.section !== slot.section || replacement.chapter !== slot.chapter) throw new Error('Replacement must have the same chapter and section.');
  if (draft.questions.some(q => questionFingerprint(q) === questionFingerprint(replacement))) throw new Error('This question is already in the draft.');
  const {raw,...safe} = copy(replacement);
  return {...draft,updatedAt:new Date().toISOString(),questions:draft.questions.map(q => q._slotId === slotId ? {...safe,options:optionsOf(safe.options),parts:safe.parts || [],_slotId:slotId,locked:false} : q)};
}
export function regenerateDraft(draft, pool, random = Math.random, slotIds = null) {
  let next = draft; const changed = [], unchanged = [];
  // Exclude every old question as well as every new choice: no swapping/repeating old items.
  const old = new Set(draft.questions.map(questionFingerprint));
  for (const slot of draft.questions) {
    if (slot.locked || (slotIds && !slotIds.includes(slot._slotId))) continue;
    const candidates = eligibleReplacements(next,slot._slotId,pool).filter(q => !old.has(questionFingerprint(q)));
    if (!candidates.length) {unchanged.push(slot._slotId);continue;}
    const q = candidates[Math.min(candidates.length-1,Math.max(0,Math.floor(random()*candidates.length)))];
    next = replaceDraftQuestion(next,slot._slotId,q); changed.push(slot._slotId);
  }
  return {draft:next,changed,unchanged};
}
export function draftSections(draft) {
  return Object.fromEntries(SECTIONS.map(s => [s,draft.questions.filter(q => q.section === s)]));
}
export function draftSnapshot(draft) {
  return {version:1,class:draft.class,subject:draft.subject,bankSource:draft.bankSource,
    questions:draft.questions.map(({_slotId,locked,...q}) => copy(q)),paper:{meta:copy(draft.meta),mcqMarks:draft.marks.A,shortMarks:draft.marks.B,longMarks:draft.marks.C}};
}
export function restoreLocalDrafts(value) {
  const drafts = JSON.parse(value || '[]');
  if (!Array.isArray(drafts) || drafts.length > 50) throw new Error('Invalid draft storage.');
  for (const draft of drafts) {
    if (!draft || typeof draft.id !== 'string' || !Array.isArray(draft.questions) || !draft.meta || !draft.marks || !draft.original) throw new Error('Invalid draft storage.');
    if (draft.questions.some(q => !q._slotId || typeof q.text !== 'string' || !SECTIONS.includes(q.section))) throw new Error('Invalid draft question.');
  }
  return drafts;
}
