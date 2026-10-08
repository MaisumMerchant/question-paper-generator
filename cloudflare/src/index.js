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
    // Serve the PDF directly: no redirect, tracking, login or third-party shortener.
    const object = await env.PAPERS.get(`papers/${id}.pdf`);
    if (!object) throw new HttpError(404, 'Paper not found.');
    return new Response(object.body, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="paperloom-${id}.pdf"`, 'Cache-Control': 'public, max-age=300' } });
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
      if (!allowed || (origin && origin !== allowed)) throw new HttpError(403, 'This website is not allowed.');
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
    headers.set('Content-Security-Policy', "default-src 'none'; sandbox");
    return new Response(response.body, { status: response.status, headers });
  }
};
