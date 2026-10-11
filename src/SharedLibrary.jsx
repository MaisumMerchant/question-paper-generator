import { useEffect, useRef, useState } from 'react';

async function requestJson(url, options = {}) {
  const response = await fetch(url, { ...options, signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(45000)]) : AbortSignal.timeout(45000) });
  let data; try { data = await response.json(); } catch { throw new Error('The cloud service returned an unexpected response.'); }
  if (!response.ok) throw new Error(data.error || 'Cloud request failed.');
  return data;
}
export function useCloudConfig() {
  const [config, setConfig] = useState({ loading: true, apiUrl: '', turnstileSiteKey: '', error: '' });
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${import.meta.env.BASE_URL}cloud-config.json`, { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) })
      .then(r => { if (!r.ok) throw new Error('Cloud settings could not load.'); return r.json(); })
      .then(data => {
        const apiUrl = String(data.apiUrl || '').replace(/\/$/, '');
        if (apiUrl) {
          const url = new URL(apiUrl);
          if (url.protocol !== 'https:' && !(import.meta.env.DEV && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error('Cloud service must use HTTPS.');
          if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Invalid cloud-service address.');
        }
        setConfig({ loading: false, apiUrl, turnstileSiteKey: String(data.turnstileSiteKey || ''), error: '' });
      }).catch(e => { if (e.name !== 'AbortError') setConfig({ loading: false, apiUrl: '', turnstileSiteKey: '', error: e.message }); });
    return () => controller.abort();
  }, []);
  return config;
}
function validRecord(record) { return record && /^\d{13}-[a-f0-9-]{36}$/.test(record.id) && typeof record.title === 'string'; }
export default function SharedLibrary({ onClose, config, onDraft }) {
  const [papers,setPapers]=useState([]),[cursor,setCursor]=useState(null),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const dialog=useRef(null),draftRequest=useRef(null);const configured=Boolean(config.apiUrl);
  useEffect(()=>{
    const previous=document.activeElement;dialog.current?.focus();
    const handle=event=>{
      if(event.key==='Escape'){onClose();return;}
      if(event.key!=='Tab')return;
      const nodes=Array.from(dialog.current.querySelectorAll('button:not(:disabled),a[href]')).filter(e=>e.getClientRects().length);const first=nodes[0],last=nodes.at(-1);
      if(!first){event.preventDefault();return;}
      if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===dialog.current)){event.preventDefault();first.focus();}
    };
    document.addEventListener('keydown',handle);return()=>{draftRequest.current?.abort();document.removeEventListener('keydown',handle);previous?.focus();};
  },[]);
  useEffect(()=>{
    if(!configured)return;const controller=new AbortController();setBusy(true);
    requestJson(`${config.apiUrl}/papers`,{signal:controller.signal}).then(data=>{
      if(!Array.isArray(data.papers)||!data.papers.every(validRecord))throw new Error('Invalid library response.');setPapers(data.papers);setCursor(data.cursor);setLoaded(true);
    }).catch(e=>{if(e.name!=='AbortError')setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setBusy(false);});return()=>controller.abort();
  },[configured,config.apiUrl]);
  async function more(reset=false){setBusy(true);setError('');try{const c=reset?null:cursor;const data=await requestJson(`${config.apiUrl}/papers${c?`?cursor=${encodeURIComponent(c)}`:''}`);if(!Array.isArray(data.papers)||!data.papers.every(validRecord))throw new Error('Invalid library response.');setPapers(v=>c?[...v,...data.papers.filter(p=>!v.some(x=>x.id===p.id))]:data.papers);setCursor(data.cursor);setLoaded(true);}catch(e){setError(e.message);}finally{setBusy(false);}}
  function fileUrl(record,kind='pdf'){return `${config.apiUrl}/papers/${encodeURIComponent(record.id)}/${kind}`;}
  function shareUrl(record){
    if(/^[A-Za-z0-9_-]{12}$/.test(record.shortCode || ''))return `${config.apiUrl}/p/${record.shortCode}`;
    const bytes=new Uint8Array(22);let n=Number(record.id.slice(0,13));for(let i=5;i>=0;i--){bytes[i]=n%256;n=Math.floor(n/256);}const hex=record.id.slice(14).replace(/-/g,'');for(let i=0;i<16;i++)bytes[6+i]=parseInt(hex.slice(i*2,i*2+2),16);return `${config.apiUrl}/p/${btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}`;
  }
  async function copy(record){try{await navigator.clipboard.writeText(shareUrl(record));setMessage('Paper link copied.');}catch{setMessage('Could not copy. Open the PDF link and copy its address.');}}
  async function openDraft(record){setBusy(true);setError('');draftRequest.current?.abort();draftRequest.current=new AbortController();try{await onDraft(record,draftRequest.current.signal);}catch(e){if(e.name!=='AbortError')setError(e.message || 'Could not open draft.');}finally{setBusy(false);}}
  return <div className="modal-backdrop cloud-backdrop" onClick={onClose}><section className="cloud-dialog" ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="cloud-title" onClick={e=>e.stopPropagation()}>
    <header className="cloud-dialog-header"><div><div className="panel-kicker">READ-ONLY CLOUD LIBRARY</div><h2 id="cloud-title">Shared papers</h2></div><button className="icon-button" aria-label="Close shared library" onClick={onClose}>×</button></header>
    <div className="cloud-dialog-body"><p className="cloud-public-note">Cloud publishing is paused. Open as draft creates a separate local copy. Editing, regeneration and PDF downloads do not replace any shared paper or permanent link.</p>
      {config.loading?<p role="status">Loading cloud settings…</p>:!configured?<div className="cloud-setup"><strong>Cloud library is not connected</strong><p>{config.error || 'The owner must configure the public cloud-service address.'}</p></div>:<><div className="cloud-list-header"><span>Latest published paper per class and subject</span><button className="small-button" disabled={busy} onClick={()=>more(true)}>Refresh</button></div><div className="cloud-paper-list">{papers.map(p=><article className="cloud-paper" key={p.id}><h3>{p.title}</h3><p>Class {p.class} · {p.subject} · {p.questionCount} questions</p><time dateTime={p.savedAt}>{new Date(p.savedAt).toLocaleString()}</time><div className="cloud-paper-actions"><button className="small-button dark" disabled={busy} onClick={()=>openDraft(p)}>Open as draft</button><a className="small-button" href={shareUrl(p)} target="_blank" rel="noreferrer">Published PDF</a><a className="small-button" href={fileUrl(p,'settings')} target="_blank" rel="noreferrer">Question JSON</a><button className="small-button" onClick={()=>copy(p)}>Copy link</button></div></article>)}</div>{loaded&&!papers.length&&<p className="cloud-empty">No published papers available. You can open a studio preview as a local draft.</p>}{cursor&&<button className="control-button" disabled={busy} onClick={()=>more()}>Load more papers</button>}{!loaded&&!busy&&<button className="control-button" onClick={()=>more(true)}>Load papers</button>}{busy&&<p role="status">Loading papers or opening a draft…</p>}</>}
      {error&&<p className="cloud-error" role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
    </div>
  </section></div>;
}
