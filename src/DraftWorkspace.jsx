import { useEffect, useMemo, useRef, useState } from 'react';
import { createExamPdf, calculateExamMarks } from './examPdf.js';
import { DRAFT_STORAGE_KEY, SECTIONS, draftSections, draftSnapshot, eligibleReplacements, findDraftBank, regenerateDraft, replaceDraftQuestion, restoreLocalDrafts } from './draftPaper.js';
const clone = value => JSON.parse(JSON.stringify(value));
function downloadJson(value, name) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
  const a = document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function QuestionEditor({ question, onApply, onCancel }) {
  const [text,setText]=useState(question.text),[parts,setParts]=useState(clone(question.parts || [])),[options,setOptions]=useState(clone(question.options || {})),[answer,setAnswer]=useState(question.answer || '');
  const [error,setError]=useState('');
  function apply() {
    if(!text.trim()){setError('Question text cannot be empty.');return;}
    if(question.section==='A' && Object.values(options).some(v=>!String(v).trim())){setError('Every MCQ option needs text.');return;}
    onApply({...question,text,parts,options:question.section==='A'?options:question.options,answer,locked:true,edited:true});
  }
  return <div className="draft-question-editor">
    <label>Question text<textarea autoFocus rows={4} maxLength={12000} value={text} onChange={e=>setText(e.target.value)} /></label>
    <p className="draft-help">Math uses $LaTeX$; code uses backticks. Applying edits automatically locks this question.</p>
    {parts.map((p,i)=><div className="draft-part-editor" key={i}><label>Part label<input aria-label={`Part ${i+1} label`} maxLength={40} value={p.label} onChange={e=>setParts(v=>v.map((x,j)=>i===j?{...x,label:e.target.value}:x))}/></label><label>Part {i+1}<textarea aria-label={`Part ${i+1} text`} rows={2} maxLength={12000} value={p.text} onChange={e=>setParts(v=>v.map((x,j)=>i===j?{...x,text:e.target.value}:x))}/></label><button className="small-button" onClick={()=>setParts(v=>v.filter((_,j)=>j!==i))}>Remove part {i+1}</button></div>)}
    {question.section!=='A' && <button className="small-button" onClick={()=>setParts(v=>[...v,{label:`(${v.length+1})`,text:''}])}>Add part</button>}
    {question.section==='A' && <><div className="draft-option-editors">{Object.entries(options).map(([key,value])=><label key={key}>Option {key}<textarea rows={2} maxLength={3000} value={value} onChange={e=>setOptions(v=>({...v,[key]:e.target.value}))}/></label>)}</div><label>Correct option (for an optional answer key)<select value={answer} onChange={e=>setAnswer(e.target.value)}><option value="">No answer key</option>{Object.keys(options).map(k=><option key={k}>{k}</option>)}</select></label><p className="draft-help">If you edit the options, review the correct option too.</p></>}
    {error&&<p role="alert" className="cloud-error">{error}</p>}
    <div className="draft-card-actions"><button className="small-button dark" onClick={apply}>Apply edits and lock</button><button className="small-button" onClick={onCancel}>Cancel edits</button></div>
  </div>;
}
export default function DraftWorkspace({ banks, incomingDraft, onConsumed, onBrowse, PaperQuestion }) {
  const [boot]=useState(()=>{try{return {drafts:restoreLocalDrafts(localStorage.getItem(DRAFT_STORAGE_KEY)),error:''};}catch{return {drafts:[],error:'Local drafts could not be restored. You can import a draft JSON backup or start a new copy.'};}});
  const [drafts,setDrafts]=useState(boot.drafts),[selectedId,setSelectedId]=useState(boot.drafts[0]?.id || ''),[message,setMessage]=useState(''),[error,setError]=useState(boot.error),[storageError,setStorageError]=useState('');
  const [editing,setEditing]=useState(''),[lastAction,setLastAction]=useState(null),[busy,setBusy]=useState(false),[pdfUrl,setPdfUrl]=useState('');
  const importRef=useRef(null),seenIncoming=useRef(new Set()),renderEpoch=useRef(0);
  const draft=drafts.find(d=>d.id===selectedId) || null;
  const sections=useMemo(()=>draft?draftSections(draft):{A:[],B:[],C:[]},[draft]);
  const bank=useMemo(()=>draft?findDraftBank(draft,banks):null,[draft,banks]);
  const locked=draft?.questions.filter(q=>q.locked).length || 0;
  const total=draft?calculateExamMarks(sections,draft.meta,draft.marks.B,draft.marks.C,draft.marks.A):0;
  useEffect(()=>{
    if(!incomingDraft || seenIncoming.current.has(incomingDraft.id))return;
    seenIncoming.current.add(incomingDraft.id);if(drafts.length>=50){setError('You have 50 local drafts. Export a backup and delete an old draft before creating another.');onConsumed();return;}setDrafts(v=>[incomingDraft,...v]);setSelectedId(incomingDraft.id);setEditing('');setLastAction(null);setError('');setMessage('A separate draft copy is ready. The shared paper was not changed.');onConsumed();
  },[incomingDraft?.id]);
  useEffect(()=>{if(boot.error&&!drafts.length)return;try{localStorage.setItem(DRAFT_STORAGE_KEY,JSON.stringify(drafts));setStorageError('');}catch{setStorageError('Drafts could not be saved on this device. Download a draft JSON backup before leaving.');}},[drafts]);
  useEffect(()=>{renderEpoch.current++;setPdfUrl('');return()=>{renderEpoch.current++;};},[draft]);
  useEffect(()=>()=>{if(pdfUrl)URL.revokeObjectURL(pdfUrl);},[pdfUrl]);
  function commit(next,undoable=true) {
    if(!draft)return;if(undoable)setLastAction(clone(draft));else setLastAction(null);
    setDrafts(v=>v.map(d=>d.id===draft.id?{...next,updatedAt:new Date().toISOString()}:d));setError('');
  }
  function select(id){setSelectedId(id);setEditing('');setLastAction(null);setMessage('');setError('');}
  function toggleLock(slotId){commit({...draft,questions:draft.questions.map(q=>q._slotId===slotId?{...q,locked:!q.locked}:q)});setMessage('Question lock updated locally.');}
  function lockAll(value){commit({...draft,questions:draft.questions.map(q=>({...q,locked:value}))});setMessage(value?'All questions locked.':'All questions unlocked.');}
  function regenerate(slotId=null){
    if(!bank){setError('No matching replacement bank is loaded. You can still edit questions manually.');return;}
    const r=regenerateDraft(draft,bank.questions,Math.random,slotId?[slotId]:null);
    if(r.changed.length)commit(r.draft);
    const labels=r.unchanged.map(id=>{const q=draft.questions.find(x=>x._slotId===id);return `${q.section}${sections[q.section].findIndex(x=>x._slotId===id)+1}`;});
    setMessage(`${r.changed.length} unlocked question${r.changed.length===1?'':'s'} replaced. ${locked} locked question${locked===1?'':'s'} kept.${labels.length?` No unused alternative in the same chapter for ${labels.join(', ')}; these questions were kept.`:''}`);
  }
  function chooseReplacement(slotId,id){try{const q=eligibleReplacements(draft,slotId,bank?.questions || []).find(x=>x.id===id);const next=replaceDraftQuestion(draft,slotId,q);commit({...next,questions:next.questions.map(x=>x._slotId===slotId?{...x,locked:true}:x)});setMessage('Chosen replacement applied and locked.');}catch(e){setError(e.message);}}
  function remove(){if(!window.confirm('Delete this local draft? The shared Cloudflare paper will not be affected.'))return;const remaining=drafts.filter(d=>d.id!==draft.id);setDrafts(remaining);select(remaining[0]?.id || '');}
  function undo(){if(!lastAction||lastAction.id!==draft.id)return;const previous=lastAction;setDrafts(v=>v.map(d=>d.id===draft.id?previous:d));setLastAction(null);setEditing('');setMessage('Last draft change undone.');}
  function reset(){if(!window.confirm('Reset this draft to the copy you originally opened? This does not change the shared paper.'))return;commit({...draft,...clone(draft.original)});setEditing('');setMessage('Draft reset to its original local copy.');}
  async function exportPdf(preview=false){
    if(editing){setError('Apply or cancel the open question edit before exporting.');return;}
    const epoch=renderEpoch.current;setBusy(true);setError('');
    try{const pdf=await createExamPdf({paper:sections,meta:draft.meta,className:draft.class,subject:draft.subject,mcqMarks:draft.marks.A,shortMarks:draft.marks.B,longMarks:draft.marks.C});if(!pdf)throw new Error('No questions to export.');
      if(epoch!==renderEpoch.current)throw new Error('The draft changed while the PDF was being prepared. Please export again.');
      if(preview)setPdfUrl(URL.createObjectURL(pdf.output('blob')));else pdf.save(`draft-${draft.class}-${draft.subject.replace(/[^a-z0-9]/gi,'-')}.pdf`);
      setMessage(preview?'PDF preview ready. No cloud update was made.':'Draft PDF downloaded. No cloud update was made.');
    }catch(e){setError(e.message || 'PDF export failed.');}finally{setBusy(false);}
  }
  async function importDraft(file){
    if(!file)return;try{if(drafts.length>=50)throw new Error('Delete an old draft before importing another; the limit is 50.');if(file.size>4*1024*1024)throw new Error('Draft backup must be smaller than 4 MB.');const raw=JSON.parse(await file.text());const imported=restoreLocalDrafts(JSON.stringify([raw]))[0];imported.id=crypto.randomUUID();imported.name+=' — imported';setDrafts(v=>[imported,...v]);select(imported.id);setMessage('Draft backup imported locally.');}catch(e){setError(e.message || 'Invalid draft backup.');}
  }
  return <section className="draft-workspace" aria-label="Draft papers">
    <div className="draft-safety" role="note"><strong>Draft-only mode · Cloud publishing is paused</strong><span>Open a copy, keep what you like, change the rest. Edits, regeneration and downloads never update the shared paper or its permanent link.</span></div>
    {(error||storageError)&&<p className="cloud-error" role="alert">{error || storageError}</p>}
    {message&&<p className="draft-status" role="status">{message}</p>}
    <div className="draft-layout"><aside className="draft-sidebar"><div className="panel-kicker">ON THIS DEVICE</div><h2>Your drafts <small>({drafts.length})</small></h2><p className="draft-help">Autosaved in this browser only. Export a JSON backup to move between devices.</p><button className="control-button primary" onClick={onBrowse}>Open shared paper as draft</button><button className="small-button" onClick={()=>importRef.current?.click()}>Import draft JSON</button><input type="file" hidden ref={importRef} accept=".json,application/json" onChange={e=>{importDraft(e.target.files?.[0]);e.target.value='';}}/>
      <div className="draft-list">{drafts.map(d=><button className={`draft-list-item ${d.id===selectedId?'active':''}`} key={d.id} onClick={()=>select(d.id)}><strong>{d.name}</strong><span>Class {d.class} · {d.subject}</span><small>{d.questions.length} questions · {d.questions.filter(q=>q.locked).length} locked</small></button>)}</div></aside>
      {!draft?<div className="draft-empty"><h2>Keep the shared version. Make your own changes.</h2><p>Open a paper from the shared library, or send a studio preview to drafts. Lock questions you want to retain, then regenerate the others.</p><button className="control-button primary" onClick={onBrowse}>Browse shared papers</button></div>:<div className="draft-main">
        <div className="draft-title-row"><div><label>Draft name<input className="draft-name" aria-label="Draft name" maxLength={180} value={draft.name} onChange={e=>commit({...draft,name:e.target.value},false)}/></label><p>Class {draft.class} · {draft.subject} · {draft.questions.length} questions · {total} marks</p></div><span className="draft-local-badge">LOCAL COPY</span></div>
        <div className="draft-actions"><button className="control-button primary" disabled={busy||!!editing||!bank||locked===draft.questions.length} onClick={()=>regenerate()}>Regenerate unlocked ({draft.questions.length-locked})</button><button className="small-button" disabled={!!editing} onClick={()=>lockAll(true)}>Lock all</button><button className="small-button" disabled={!!editing} onClick={()=>lockAll(false)}>Unlock all</button><button className="small-button" disabled={!lastAction||lastAction.id!==draft.id||!!editing} onClick={undo}>Undo last change</button></div>
        <p className="draft-help">Replacement bank: {bank?.sourceName || 'not found'}. Replacements stay in the same chapter and section, preserving the paper’s chapter distribution and question order. If no unused alternative exists, the original is kept.</p>
        <details className="draft-settings"><summary>Paper header and instructions</summary><div className="draft-header-fields">{[['institution','Institution'],['exam','Exam title'],['time','Time allowed']].map(([k,label])=><label key={k}>{label}<input value={draft.meta[k]} onChange={e=>commit({...draft,meta:{...draft.meta,[k]:e.target.value}},false)}/></label>)}{SECTIONS.filter(s=>sections[s].length).map(s=><label key={s} className="wide-setting">Section {s} instructions<input value={draft.meta[`instructions${s}`] || ''} onChange={e=>commit({...draft,meta:{...draft.meta,[`instructions${s}`]:e.target.value}},false)}/></label>)}</div><div className="draft-setting-toggles">{[['showHeader','Show header'],['showChapter','Show chapter labels'],['showSource','Show source/year'],['showAnswerKey','Include MCQ answer key']].map(([k,label])=><label key={k}><input type="checkbox" checked={!!draft.meta[k]} onChange={e=>commit({...draft,meta:{...draft.meta,[k]:e.target.checked}},false)}/>{label}</label>)}</div></details>
        <div className="draft-card-list">{SECTIONS.filter(s=>sections[s].length).map(s=><section key={s}><h3>Section {s} <small>{sections[s].length} questions · {draft.marks[s]} mark{draft.marks[s]===1?'':'s'} each</small></h3>{sections[s].map((q,i)=>{const replacements=eligibleReplacements(draft,q._slotId,bank?.questions || []);return <article key={q._slotId} className={`draft-card ${q.locked?'locked':''}`} data-slot-id={q._slotId}><div className="draft-card-heading"><strong>{s}{i+1} · {q.chapter}</strong><button className={`small-button draft-lock ${q.locked?'is-locked':''}`} aria-label={`${q.locked?'Unlock':'Lock'} ${s}${i+1}`} aria-pressed={q.locked} disabled={!!editing} onClick={()=>toggleLock(q._slotId)}>{q.locked?'Locked — unlock':'Lock question'}</button></div>
          {editing===q._slotId?<QuestionEditor question={q} onCancel={()=>setEditing('')} onApply={changed=>{commit({...draft,questions:draft.questions.map(x=>x._slotId===q._slotId?changed:x)});setEditing('');setMessage('Edits applied locally; this question is now locked.');}}/>:<><PaperQuestion question={q} index={i} marks={draft.marks[s]} showMarks={false} showChapter={false} showSource={false}/><div className="draft-card-actions"><button className="small-button" disabled={q.locked||busy||!!editing} onClick={()=>{setEditing(q._slotId);setError('');}}>Edit {s}{i+1}</button><button className="small-button" disabled={q.locked||busy||!!editing||!replacements.length} onClick={()=>regenerate(q._slotId)}>Regenerate {s}{i+1}</button><label className="draft-replacement-label">Choose replacement<select aria-label={`Choose replacement for ${s}${i+1}`} value="" disabled={q.locked||busy||!!editing||!replacements.length} onChange={e=>chooseReplacement(q._slotId,e.target.value)}><option value="">{q.locked?'Unlock to choose a replacement':replacements.length?`${replacements.length} same-chapter alternatives`:'No unused same-chapter alternative'}</option>{replacements.map(candidate=><option key={candidate.id} value={candidate.id}>{candidate.text.slice(0,180)}</option>)}</select></label></div></>}
        </article>;})}</section>)}</div>
        <div className="draft-export-bar"><button className="control-button primary" disabled={busy||!!editing} onClick={()=>exportPdf(false)}>{busy?'Preparing PDF…':'Download draft PDF'}</button><button className="small-button" disabled={busy||!!editing} onClick={()=>exportPdf(true)}>Preview PDF</button><button className="small-button" disabled={!!editing} onClick={()=>downloadJson(draft,`draft-${draft.class}-${draft.subject.replace(/[^a-z0-9]/gi,'-')}.json`)}>Download draft JSON</button><button className="small-button" disabled={busy||!!editing} onClick={reset}>Reset draft</button><button className="small-button" disabled={busy} onClick={remove}>Delete local draft</button></div>
        {pdfUrl&&<div className="draft-pdf-preview"><div><strong>Draft PDF preview</strong><button className="small-button" onClick={()=>setPdfUrl('')}>Close PDF preview</button></div><iframe src={pdfUrl} title="Draft PDF preview"/></div>}
        <details className="draft-print-preview" open><summary>Live printable preview — no editor controls in the PDF</summary><div className="paper-frame"><div className="paper-sheet">
          {draft.meta.showHeader&&<header className="exam-header"><h2>{draft.meta.institution || 'Question Paper'}</h2>{draft.meta.exam&&<h4>{draft.meta.exam}</h4>}<div><span>Class: {draft.class}</span><span>Subject: {draft.subject}</span><span>Time: {draft.meta.time}</span><span>Total marks: {total}</span></div></header>}
          {SECTIONS.filter(s=>sections[s].length).map(s=><section key={s} className="paper-section"><h3>Section {s}<small>{draft.meta[`instructions${s}`]}</small></h3>{sections[s].map((q,i)=><PaperQuestion key={q._slotId} question={q} index={i} marks={draft.marks[s]} {...draft.meta}/>)}</section>)}
          {draft.meta.showAnswerKey&&sections.A.some(q=>q.answer)&&<section className="paper-section answer-key-section"><h3>Answer Key — Section A</h3><div className="answer-key-grid">{sections.A.map((q,i)=>q.answer&&<span key={q._slotId}><b>{i+1}.</b> {q.answer}</span>)}</div></section>}
        </div></div></details>
      </div>}
    </div>
  </section>;
}
