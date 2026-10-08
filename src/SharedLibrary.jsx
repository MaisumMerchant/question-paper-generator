import { useEffect, useRef, useState } from 'react';

let challengeScript;
function loadChallenge() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!challengeScript) challengeScript = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => window.turnstile ? resolve(window.turnstile) : reject(new Error('Spam protection could not load.'));
    script.onerror = () => { challengeScript = null; script.remove(); reject(new Error('Spam protection could not load. Check your connection and retry.')); };
    document.head.appendChild(script);
  });
  return challengeScript;
}
function Challenge({ siteKey, onToken, retry }) {
  const container = useRef(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false; let widget;
    onToken(''); setError('');
    loadChallenge().then(api => {
      if (cancelled) return;
      widget = api.render(container.current, { sitekey: siteKey, action: 'save-paper', size: 'flexible',
        callback: token => onToken(token), 'expired-callback': () => onToken(''),
        'error-callback': () => { onToken(''); setError('Verification failed. Please retry the check.'); return true; }
      });
    }).catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; if (widget !== undefined) window.turnstile?.remove(widget); };
  }, [siteKey, retry]);
  return <div className="cloud-challenge"><div ref={container} />{error && <p role="alert">{error}</p>}</div>;
}
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
export default function SharedLibrary({ mode, onClose, config, defaultTitle, onSave }) {
  const [title, setTitle] = useState(defaultTitle);
  const [consent, setConsent] = useState(false);
  const [token, setToken] = useState('');
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saved, setSaved] = useState(null);
  const [papers, setPapers] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const dialog = useRef(null);
  const busyRef = useRef(false);
  const configured = Boolean(config.apiUrl && config.turnstileSiteKey);
  useEffect(() => { busyRef.current = busy && mode === 'save'; }, [busy, mode]);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.focus();
    const handleKey = event => {
      if (event.key === 'Escape' && !busyRef.current) onClose();
      if (event.key !== 'Tab') return;
      const controls = Array.from(dialog.current.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),iframe')).filter(el => el.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handleKey);
    return () => { document.removeEventListener('keydown', handleKey); previous?.focus(); };
  }, []);
  useEffect(() => {
    if (mode !== 'browse' || !configured) return;
    const controller = new AbortController();
    setBusy(true);
    requestJson(`${config.apiUrl}/papers`, { signal: controller.signal })
      .then(data => { if (!Array.isArray(data.papers) || !data.papers.every(validRecord)) throw new Error('Invalid library response.'); setPapers(data.papers); setCursor(data.cursor); setLoaded(true); })
      .catch(e => { if (e.name !== 'AbortError') setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [mode, configured, config.apiUrl]);
  async function save() {
    setBusy(true); setError('');
    try {
      const record = await onSave({ title: title.trim(), token });
      if (!validRecord(record)) throw new Error('The server did not confirm a saved paper.');
      setSaved(record);
    } catch (e) { setError(e.message || 'Saving failed. The paper was not confirmed saved.'); }
    finally { setBusy(false); setToken(''); setRetry(v => v + 1); }
  }
  async function more(reset = false) {
    const pageCursor = reset ? null : cursor;
    setBusy(true); setError('');
    try {
      const data = await requestJson(`${config.apiUrl}/papers${pageCursor ? `?cursor=${encodeURIComponent(pageCursor)}` : ''}`);
      if (!Array.isArray(data.papers) || !data.papers.every(validRecord)) throw new Error('Invalid library response.');
      setPapers(current => pageCursor ? [...current, ...data.papers.filter(p => !current.some(q => q.id === p.id))] : data.papers); setCursor(data.cursor); setLoaded(true);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  const fileUrl = (id, kind = 'pdf') => `${config.apiUrl}/papers/${encodeURIComponent(id)}/${kind}`;
  function shareUrl(record) {
    if (/^[A-Za-z0-9_-]{12}$/.test(record.shortCode || '')) return `${config.apiUrl}/p/${record.shortCode}`;
    // Older records use a lossless compact ID; no migration or extra KV writes.
    const timestamp = Number(record.id.slice(0,13));
    const bytes = new Uint8Array(22); let n = timestamp;
    for (let i = 5; i >= 0; i--) { bytes[i] = n % 256; n = Math.floor(n / 256); }
    const hex = record.id.slice(14).replace(/-/g, '');
    for (let i = 0; i < 16; i++) bytes[6+i] = parseInt(hex.slice(i*2,i*2+2),16);
    const code = btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    return `${config.apiUrl}/p/${code}`;
  }
  async function copy(record) {
    try { await navigator.clipboard.writeText(shareUrl(record)); setMessage('Paper link copied.'); }
    catch { setMessage('Could not copy automatically. Use the download link to copy the address.'); }
  }
  function links(record) { return <div className="cloud-paper-actions"><a className="small-button dark" href={fileUrl(record.id)} target="_blank" rel="noreferrer">Download PDF</a><a className="small-button" href={fileUrl(record.id, 'settings')} target="_blank" rel="noreferrer">Question JSON</a><button className="small-button" onClick={() => copy(record)}>Copy link</button></div>; }
  return <div className="modal-backdrop cloud-backdrop" onClick={() => { if (!busy || mode === 'browse') onClose(); }}>
    <section className="cloud-dialog" ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="cloud-title" onClick={e => e.stopPropagation()}>
      <header className="cloud-dialog-header"><div><div className="panel-kicker">SHARED CLOUD LIBRARY</div><h2 id="cloud-title">{mode === 'save' ? 'Save this paper' : 'Shared papers'}</h2></div><button className="icon-button" aria-label="Close shared library" onClick={onClose} disabled={busy && mode === 'save'}>×</button></header>
      <div className="cloud-dialog-body">
        {config.loading ? <p role="status">Loading cloud settings…</p> : !configured ? <div className="cloud-setup"><strong>Cloud library is not connected yet</strong><p>The app is ready, but the owner must deploy the Cloudflare service and add its public address and spam-protection site key. Teachers will not need accounts.</p>{config.error && <p role="alert">{config.error}</p>}<a href="https://github.com/MaisumMerchant/question-paper-generator/blob/main/cloudflare/README.md" target="_blank" rel="noreferrer">Owner setup instructions ↗</a></div> : <>
          <p className="cloud-public-note">No sign-in required. Saved papers and their questions are public to anyone who can access this library. Do not upload confidential exam papers or personal information.</p>
          {mode === 'save' && !saved && <div className="cloud-save-form"><label>Paper name<input maxLength={120} value={title} onChange={e => setTitle(e.target.value)} disabled={busy} /></label><label className="cloud-consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} disabled={busy} /><span>I confirm this paper may be publicly shared.</span></label><Challenge siteKey={config.turnstileSiteKey} onToken={setToken} retry={retry} /><button className="text-button" onClick={() => { setToken(''); setRetry(v => v + 1); }} disabled={busy}>Retry verification</button><button className="control-button cloud-save-button" onClick={save} disabled={busy || !consent || !token || !title.trim()}>{busy ? 'Generating PDF and saving…' : 'Save to shared library'}</button></div>}
          {saved && <div className="cloud-saved" role="status"><strong>Paper saved successfully</strong><p>{saved.title}</p>{links(saved)}</div>}
          {mode === 'browse' && <><div className="cloud-list-header"><span>Newest first · changes may take about a minute to appear</span><button className="small-button" onClick={() => more(true)} disabled={busy}>Refresh</button></div><div className="cloud-paper-list">{papers.map(p => <article className="cloud-paper" key={p.id}><h3>{p.title}</h3><p>Class {p.class} · {p.subject} · {p.questionCount} questions</p><time dateTime={p.savedAt}>{new Date(p.savedAt).toLocaleString()}</time>{links(p)}</article>)}</div>{loaded && !papers.length && <p className="cloud-empty">No papers saved yet. Generate one and choose Save to shared library.</p>}{cursor && <button className="control-button" onClick={() => more()} disabled={busy}>Load more papers</button>}{!loaded && !busy && <button className="control-button" onClick={() => more(true)}>Load papers</button>}{busy && <p role="status">Loading papers…</p>}</>}
        </>}
        {error && <p className="cloud-error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}
      </div>
    </section>
  </div>;
}
