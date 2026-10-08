function pdfViewer(id) {
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const cdn = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38';
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Paperloom · Shared paper</title><style nonce="${nonce}">
  *{box-sizing:border-box}body{margin:0;background:#edf1ed;color:#163b35;font:14px Arial,sans-serif}header{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;background:#fffdf7;border-bottom:1px solid #d3deda;padding:14px 22px}h1{font:600 23px Georgia,serif;margin:0}small{display:block;color:#526b64;margin-top:4px}nav,.controls{display:flex;align-items:center;gap:8px;flex-wrap:wrap}button,a{min-height:44px;display:inline-flex;align-items:center;justify-content:center;padding:10px 13px;border:1px solid #bdccc7;border-radius:8px;background:#fff;color:#163b35;font:600 14px Arial,sans-serif;text-decoration:none;cursor:pointer}button:disabled{opacity:.45;cursor:default}button:focus-visible,a:focus-visible{outline:3px solid #c6a958;outline-offset:2px}.download{background:#163b35;color:#fff;border-color:#163b35}main{padding:22px 12px 40px;text-align:center}#status{margin:4px auto 18px;max-width:650px;line-height:1.6}#sheet{display:inline-block;background:#fff;box-shadow:0 4px 24px #173d3520;max-width:100%;overflow:auto}canvas{display:block;max-width:100%;height:auto}#page{min-width:90px;text-align:center}#zoom{min-width:55px;text-align:center}#error{padding:18px;background:#fff2e9;border:1px solid #eacdb7;border-radius:8px;max-width:620px;margin:12px auto;line-height:1.7;text-align:left}#error[hidden]{display:none}@media(max-width:700px){header{padding:12px;gap:12px}.controls{justify-content:center;width:100%}nav{width:100%;justify-content:space-between}h1{font-size:21px}button,a{padding:10px}main{padding:16px 8px 30px}}
  </style></head><body><header><div><h1>Paperloom</h1><small>Shared paper · view only · no sign-in</small></div><nav aria-label="Paper actions"><a class="download" href="/papers/${id}/pdf">Download PDF</a></nav><div class="controls" aria-label="PDF controls"><button id="prev" disabled aria-label="Previous page">←</button><span id="page" aria-live="polite">Loading…</span><button id="next" disabled aria-label="Next page">→</button><button id="less" disabled aria-label="Zoom out">−</button><span id="zoom">100%</span><button id="more" disabled aria-label="Zoom in">+</button><button id="fit" disabled>Fit width</button></div></header><main><p id="status" role="status">Opening your paper…</p><div id="error" role="alert" hidden>We could not display this paper. Please refresh, or use Download PDF to open it with another PDF reader.</div><div id="sheet"><canvas id="canvas" aria-label="PDF page"></canvas></div></main><script type="module" nonce="${nonce}">
  import * as pdfjs from '${cdn}/pdf.min.mjs';
  pdfjs.GlobalWorkerOptions.workerSrc='${cdn}/pdf.worker.min.mjs';
  const el=id=>document.getElementById(id);let pdf,current=1,zoom=1,rendering=false;const canvas=el('canvas');
  function controls(){el('prev').disabled=rendering||!pdf||current<=1;el('next').disabled=rendering||!pdf||current>=pdf.numPages;for(const name of ['less','more','fit'])el(name).disabled=rendering||!pdf;el('page').textContent=pdf?'Page '+current+' of '+pdf.numPages:'Loading…';el('zoom').textContent=Math.round(zoom*100)+'%';}
  async function render(){if(rendering||!pdf)return;rendering=true;controls();try{const page=await pdf.getPage(current);const natural=page.getViewport({scale:1});const width=Math.min(innerWidth-32,1000);const scale=width/natural.width*zoom;const viewport=page.getViewport({scale});const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.floor(viewport.width*dpr);canvas.height=Math.floor(viewport.height*dpr);canvas.style.width=viewport.width+'px';canvas.style.height=viewport.height+'px';el('sheet').style.maxWidth=zoom>1?'none':'100%';await page.render({canvasContext:canvas.getContext('2d'),viewport,transform:dpr===1?null:[dpr,0,0,dpr,0,0]}).promise;el('status').textContent='';canvas.setAttribute('aria-label','Page '+current+' of '+pdf.numPages);}catch{el('error').hidden=false;}finally{rendering=false;controls();}}
  el('prev').onclick=()=>{if(current>1){current--;render();}};el('next').onclick=()=>{if(current<pdf.numPages){current++;render();}};el('less').onclick=()=>{zoom=Math.max(.5,zoom-.25);render();};el('more').onclick=()=>{zoom=Math.min(2.5,zoom+.25);render();};el('fit').onclick=()=>{zoom=1;render();};let resize;addEventListener('resize',()=>{clearTimeout(resize);resize=setTimeout(render,200);});
  try{pdf=await pdfjs.getDocument({url:'/papers/${id}/pdf',isEvalSupported:false}).promise;await render();}catch{el('status').textContent='';el('error').hidden=false;el('page').textContent='Unavailable';}
  </script></body></html>`;
  return new Response(html, { headers: { 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store', 'Content-Security-Policy':`default-src 'none'; script-src 'nonce-${nonce}' https://cdnjs.cloudflare.com; style-src 'nonce-${nonce}'; connect-src 'self' https://cdnjs.cloudflare.com; worker-src blob: https://cdnjs.cloudflare.com; img-src data: blob:; font-src data: blob:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'` } });
}

// Free-plan Workers KV adapter. No R2 subscription or payment method is needed.
function kvStorage(namespace) {
  return {
    async put(key, value, options = {}) {
      const metadata = options.customMetadata?.record ? JSON.parse(options.customMetadata.record) : undefined;
      if (metadata && new TextEncoder().encode(JSON.stringify(metadata)).length > 1024) throw new Error('Metadata too large');
      await namespace.put(key, value, metadata ? { metadata } : {});
    },
    async get(key) {
      const value = await namespace.get(key, { type: 'arrayBuffer' });
      return value === null ? null : { body: value };
    },
    async delete(key) { await namespace.delete(key); },
    async list({ prefix, limit, cursor }) {
      const page = await namespace.list({ prefix, limit, ...(cursor ? { cursor } : {}) });
      return { objects: page.keys.map(key => ({ key: key.name, customMetadata: { record: JSON.stringify(key.metadata || null) } })), truncated: !page.list_complete, cursor: page.cursor };
    }
  };
}
const MAX_PDF = 5 * 1024 * 1024;
const MAX_SNAPSHOT = 256 * 1024;
const MAX_BODY = MAX_PDF + MAX_SNAPSHOT + 64 * 1024;
const ID = /^\d{13}-[a-f0-9-]{36}$/;
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
function clean(value, max = 100) { return typeof value === 'string' ? value.replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, max) : ''; }
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }); }
function recordOf(object) { try { return JSON.parse(object.customMetadata.record); } catch { return null; } }
async function boundedBytes(stream, max) {
  if (!stream) throw new HttpError(400, 'Missing upload body.');
  const reader = stream.getReader(); const chunks = []; let size = 0;
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > max) { await reader.cancel(); throw new HttpError(413, 'Upload exceeds the size limit.'); } chunks.push(value); }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
async function validateChallenge(token, request, env) {
  if (!env.TURNSTILE_SECRET_KEY || !env.TURNSTILE_HOSTNAME) throw new HttpError(503, 'Upload protection is not configured.');
  if (typeof token !== 'string' || !token || token.length > 2048) throw new HttpError(400, 'Complete the spam-protection check.');
  let verdict;
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10000),
      body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: token, remoteip: request.headers.get('CF-Connecting-IP') || undefined })
    });
    if (!response.ok) throw new Error('Verification unavailable');
    verdict = await response.json();
  } catch { throw new HttpError(503, 'Spam protection is unavailable. Please try again.'); }
  if (!verdict.success || verdict.hostname !== env.TURNSTILE_HOSTNAME || verdict.action !== 'save-paper') throw new HttpError(403, 'Verification expired or failed. Please verify again.');
}
async function upload(request, env) {
  if (env.UPLOADS_ENABLED !== 'true') throw new HttpError(503, 'New uploads are temporarily paused.');
  if (!env.PAPERS || !env.UPLOAD_LIMIT) throw new HttpError(503, 'Cloud storage or upload limits are not configured.');
  const ip = request.headers.get('CF-Connecting-IP');
  if (!ip) throw new HttpError(400, 'Could not verify the request source.');
  if (!(await env.UPLOAD_LIMIT.limit({ key: ip })).success) throw new HttpError(429, 'Too many save attempts. Please wait one minute.');
  if (!request.headers.get('Content-Type')?.startsWith('multipart/form-data;')) throw new HttpError(415, 'Expected a PDF upload.');
  if (Number(request.headers.get('Content-Length')) > MAX_BODY) throw new HttpError(413, 'Upload exceeds the size limit.');
  const bytes = await boundedBytes(request.body, MAX_BODY);
  let form; try { form = await new Response(bytes, { headers: { 'Content-Type': request.headers.get('Content-Type') } }).formData(); } catch { throw new HttpError(400, 'Invalid upload form.'); }
  if (form.get('publicConsent') !== 'yes') throw new HttpError(400, 'Confirm that this paper may be publicly shared.');
  const pdf = form.get('pdf'); const draft = form.get('snapshot');
  if (!pdf || typeof pdf === 'string' || pdf.type !== 'application/pdf' || !pdf.size) throw new HttpError(400, 'A PDF file is required.');
  if (pdf.size > MAX_PDF) throw new HttpError(413, 'PDF must be 5 MB or smaller.');
  if (!draft || typeof draft === 'string' || draft.size > MAX_SNAPSHOT) throw new HttpError(400, 'Paper settings are missing or too large.');
  if (await pdf.slice(0, 5).text() !== '%PDF-') throw new HttpError(400, 'The file is not a PDF.');
  let snapshot; try { snapshot = JSON.parse(await draft.text()); } catch { throw new HttpError(400, 'Invalid paper settings.'); }
  if (snapshot.version !== 1 || !['IX','X','XI','XII'].includes(snapshot.class) || !Array.isArray(snapshot.questions) || snapshot.questions.length < 1 || snapshot.questions.length > 200) throw new HttpError(400, 'Invalid paper settings.');
  const subject = clean(snapshot.subject, 60); const title = clean(form.get('title'), 120);
  if (!title || !subject) throw new HttpError(400, 'Paper title and subject are required.');
  if (!snapshot.questions.every(q => q && ['B','C'].includes(q.section) && typeof q.text === 'string' && q.text.length <= 20000 && (!q.parts || (Array.isArray(q.parts) && q.parts.length <= 100)))) throw new HttpError(400, 'Invalid questions in paper settings.');
  await validateChallenge(form.get('turnstileToken'), request, env);
  const id = `${String(9999999999999 - Date.now()).padStart(13, '0')}-${crypto.randomUUID()}`;
  const shortCode = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(9)))).replace(/\+/g, '-').replace(/\//g, '_');
  if (await env.PAPERS.get(`links/${shortCode}`)) throw new HttpError(503, 'Please retry saving.');
  const record = { id, shortCode, title, class: snapshot.class, subject, savedAt: new Date().toISOString(), questionCount: snapshot.questions.length, bytes: pdf.size };
  // PDF is the listing/commit marker. Write it last so failed settings uploads do not appear in the library.
  try {
    await env.PAPERS.put(`settings/${id}.json`, JSON.stringify(snapshot), { httpMetadata: { contentType: 'application/json' } });
    await env.PAPERS.put(`links/${shortCode}`, id);
    await env.PAPERS.put(`papers/${id}.pdf`, await pdf.arrayBuffer(), { httpMetadata: { contentType: 'application/pdf' }, customMetadata: { record: JSON.stringify(record) } });
  } catch { try { await env.PAPERS.delete(`settings/${id}.json`); await env.PAPERS.delete(`links/${shortCode}`); } catch {} throw new HttpError(503, 'Storage is unavailable. The paper was not confirmed saved.'); }
  return json(record, 201);
}
async function route(request, env) {
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/health') return json({ ready: Boolean(env.PAPERS && env.UPLOAD_LIMIT && env.READ_LIMIT && env.TURNSTILE_SECRET_KEY && env.TURNSTILE_HOSTNAME), uploadsEnabled: env.UPLOADS_ENABLED === 'true' });
  if (request.method === 'POST' && url.pathname === '/papers') return upload(request, env);
  if (request.method !== 'GET') throw new HttpError(405, 'This operation is not available.');
  if (!env.PAPERS || !env.READ_LIMIT) throw new HttpError(503, 'Cloud storage is not configured.');
  if (!(await env.READ_LIMIT.limit({ key: request.headers.get('CF-Connecting-IP') || 'public' })).success) throw new HttpError(429, 'Too many requests. Please wait one minute.');
  if (url.pathname === '/papers') {
    const cursor = url.searchParams.get('cursor') || undefined;
    if (cursor && cursor.length > 4096) throw new HttpError(400, 'Invalid page cursor.');
    const page = await env.PAPERS.list({ prefix: 'papers/', limit: 30, cursor, include: ['customMetadata'] });
    return json({ papers: page.objects.map(recordOf).filter(Boolean), cursor: page.truncated ? page.cursor : null });
  }
  const short = url.pathname.match(/^\/p\/([A-Za-z0-9_-]{12}|[A-Za-z0-9_-]{30})$/);
  if (short) {
    let id;
    if (short[1].length === 12) {
      const alias = await env.PAPERS.get(`links/${short[1]}`);
      if (alias) id = await new Response(alias.body).text();
    } else {
      try {
        const raw = atob(short[1].replace(/-/g, '+').replace(/_/g, '/') + '==');
        if (raw.length === 22) {
          let timestamp = 0; for (let i = 0; i < 6; i++) timestamp = timestamp * 256 + raw.charCodeAt(i);
          const hex = [...raw.slice(6)].map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
          id = `${String(timestamp).padStart(13,'0')}-${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
        }
      } catch {}
    }
    if (!id || !ID.test(id)) throw new HttpError(404, 'Paper not found.');
    // Shared links open the PDF inline; explicit download routes remain attachments.
    const object = await env.PAPERS.get(`papers/${id}.pdf`);
    if (!object) throw new HttpError(404, 'Paper not found.');
    return pdfViewer(id);
  }
  const match = url.pathname.match(/^\/papers\/([^/]+)\/(pdf|settings)$/);
  if (!match || !ID.test(match[1])) throw new HttpError(404, 'Paper not found.');
  const [, id, kind] = match;
  const object = await env.PAPERS.get(kind === 'pdf' ? `papers/${id}.pdf` : `settings/${id}.json`);
  if (!object) throw new HttpError(404, 'Paper not found.');
  const filename = kind === 'pdf' ? `paperloom-${id}.pdf` : `paperloom-${id}.json`;
  return new Response(object.body, { headers: { 'Content-Type': kind === 'pdf' ? 'application/pdf' : 'application/json', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'public, max-age=300' } });
}
export default {
  async fetch(request, env) {
    if (env.PAPERS_KV) env = { ...env, PAPERS: kvStorage(env.PAPERS_KV) };
    const origin = request.headers.get('Origin');
    const allowed = env.ALLOWED_ORIGIN;
    let response;
    try {
      if (!allowed || (origin && origin !== allowed && !(request.method === 'GET' && origin === new URL(request.url).origin))) throw new HttpError(403, 'This website is not allowed.');
      if (request.method === 'OPTIONS') {
        if (origin !== allowed || !['GET','POST'].includes(request.headers.get('Access-Control-Request-Method'))) throw new HttpError(403, 'Request not allowed.');
        response = new Response(null, { status: 204, headers: { 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600' } });
      } else {
        // CORS is not authentication. Turnstile and rate limits protect anonymous uploads.
        if (request.method === 'POST' && origin !== allowed) throw new HttpError(403, 'Upload from the configured website.');
        response = await route(request, env);
      }
    } catch (error) { response = json({ error: error instanceof HttpError ? error.message : 'Cloud service is temporarily unavailable.' }, error instanceof HttpError ? error.status : 503); }
    const headers = new Headers(response.headers);
    if (origin === allowed) headers.set('Access-Control-Allow-Origin', allowed);
    headers.set('Vary', 'Origin'); headers.set('X-Content-Type-Options', 'nosniff'); headers.set('Referrer-Policy', 'no-referrer');
    if (!headers.has('Content-Security-Policy')) headers.set('Content-Security-Policy', "default-src 'none'; sandbox");
    return new Response(response.body, { status: response.status, headers });
  }
};
