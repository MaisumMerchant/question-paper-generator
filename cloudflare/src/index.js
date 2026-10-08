// Free-plan Workers KV adapter. No R2 subscription or payment method is needed.
function kvStorage(namespace) {
  return {
    async put(key, value, options = {}) {
      const metadata = options.customMetadata?.record ? JSON.parse(options.customMetadata.record) : undefined;
      if (metadata && new TextEncoder().encode(JSON.stringify(metadata)).length > 1024) throw new Error('Metadata too large');
      await namespace.put(key, value, { ...(metadata ? { metadata } : {}), ...(options.expirationTtl ? { expirationTtl: options.expirationTtl } : {}) });
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
function canonicalSubject(value) {
  const subject = clean(value, 60);
  const names = { maths: 'Mathematics', mathematics: 'Mathematics', physics: 'Physics', chemistry: 'Chemistry', biology: 'Biology', computer: 'Computer Science', 'computer science': 'Computer Science' };
  return names[subject.toLowerCase()] || subject;
}
async function publishingAccess(key, env) {
  if (typeof env.PUBLISH_KEY !== 'string' || env.PUBLISH_KEY.length < 16) throw new HttpError(503, 'Owner publishing protection is not configured.');
  if (typeof key !== 'string' || !key || key.length > 256) throw new HttpError(403, 'Enter the owner publishing key to save or replace a paper.');
  const digest = async value => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  const expected = await digest(env.PUBLISH_KEY); const supplied = await digest(key);
  let difference = 0; for (let i = 0; i < expected.length; i++) difference |= expected[i] ^ supplied[i];
  if (difference) throw new HttpError(403, 'The publishing key is incorrect.');
}
async function stableCode(className, subject) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`paperloom-slot-v1:${className}:${subject.toLowerCase()}`)));
  return btoa(String.fromCharCode(...bytes.slice(0, 9))).replace(/\+/g, '-').replace(/\//g, '_');
}
async function retirePrevious(id, env) {
  if (!id || !ID.test(id)) return;
  // Keep old immutable files for a day so an eventually consistent alias can still resolve.
  // They are not listed; the permanent alias is the only public library entry.
  for (const key of [`papers/${id}.pdf`, `settings/${id}.json`]) {
    try { const old = await env.PAPERS.get(key); if (old) await env.PAPERS.put(key, await new Response(old.body).arrayBuffer(), { expirationTtl: 86400 }); } catch {}
  }
}
async function upload(request, env, ctx) {
  if (env.UPLOADS_ENABLED !== 'true') throw new HttpError(503, 'New uploads are temporarily paused.');
  if (!env.PAPERS || !env.UPLOAD_LIMIT) throw new HttpError(503, 'Cloud storage or upload limits are not configured.');
  const ip = request.headers.get('CF-Connecting-IP');
  if (!ip) throw new HttpError(400, 'Could not verify the request source.');
  if (!(await env.UPLOAD_LIMIT.limit({ key: ip })).success) throw new HttpError(429, 'Too many save attempts. Please wait one minute.');
  if (!request.headers.get('Content-Type')?.startsWith('multipart/form-data;')) throw new HttpError(415, 'Expected a PDF upload.');
  if (Number(request.headers.get('Content-Length')) > MAX_BODY) throw new HttpError(413, 'Upload exceeds the size limit.');
  const bytes = await boundedBytes(request.body, MAX_BODY);
  let form; try { form = await new Response(bytes, { headers: { 'Content-Type': request.headers.get('Content-Type') } }).formData(); } catch { throw new HttpError(400, 'Invalid upload form.'); }
  await publishingAccess(form.get('publisherKey'), env);
  if (form.get('publicConsent') !== 'yes') throw new HttpError(400, 'Confirm that this paper may be publicly shared.');
  const pdf = form.get('pdf'); const draft = form.get('snapshot');
  if (!pdf || typeof pdf === 'string' || pdf.type !== 'application/pdf' || !pdf.size) throw new HttpError(400, 'A PDF file is required.');
  if (pdf.size > MAX_PDF) throw new HttpError(413, 'PDF must be 5 MB or smaller.');
  if (!draft || typeof draft === 'string' || draft.size > MAX_SNAPSHOT) throw new HttpError(400, 'Paper settings are missing or too large.');
  if (await pdf.slice(0, 5).text() !== '%PDF-') throw new HttpError(400, 'The file is not a PDF.');
  let snapshot; try { snapshot = JSON.parse(await draft.text()); } catch { throw new HttpError(400, 'Invalid paper settings.'); }
  if (snapshot.version !== 1 || !['IX','X','XI','XII'].includes(snapshot.class) || !Array.isArray(snapshot.questions) || snapshot.questions.length < 1 || snapshot.questions.length > 200) throw new HttpError(400, 'Invalid paper settings.');
  const subject = canonicalSubject(snapshot.subject); const title = clean(form.get('title'), 120);
  if (!title || !subject) throw new HttpError(400, 'Paper title and subject are required.');
  if (!snapshot.questions.every(q => q && ['B','C'].includes(q.section) && typeof q.text === 'string' && q.text.length <= 20000 && (!q.parts || (Array.isArray(q.parts) && q.parts.length <= 100)))) throw new HttpError(400, 'Invalid questions in paper settings.');
  await validateChallenge(form.get('turnstileToken'), request, env);
  const id = `${String(9999999999999 - Date.now()).padStart(13, '0')}-${crypto.randomUUID()}`;
  const shortCode = await stableCode(snapshot.class, subject);
  const previous = await env.PAPERS.get(`links/${shortCode}`);
  const previousId = previous ? await new Response(previous.body).text() : null;
  const record = { id, shortCode, title, class: snapshot.class, subject, savedAt: new Date().toISOString(), questionCount: snapshot.questions.length, bytes: pdf.size };
  snapshot.subject = subject;
  // Stage immutable PDF + JSON, then atomically switch this class/subject's alias.
  // A failed staged upload leaves the previous public paper untouched.
  try {
    await env.PAPERS.put(`settings/${id}.json`, JSON.stringify(snapshot), { httpMetadata: { contentType: 'application/json' } });
    await env.PAPERS.put(`papers/${id}.pdf`, await pdf.arrayBuffer(), { httpMetadata: { contentType: 'application/pdf' } });
    await env.PAPERS.put(`links/${shortCode}`, id, { customMetadata: { record: JSON.stringify(record) } });
  } catch {
    try { await env.PAPERS.delete(`settings/${id}.json`); await env.PAPERS.delete(`papers/${id}.pdf`); } catch {}
    throw new HttpError(503, 'Storage is unavailable. The paper was not confirmed saved.');
  }
  if (previousId && previousId !== id) {
    const cleanup = retirePrevious(previousId, env);
    if (ctx?.waitUntil) ctx.waitUntil(cleanup); else await cleanup;
  }
  return json(record, previousId ? 200 : 201);
}
async function route(request, env, ctx) {
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/health') return json({ ready: Boolean(env.PAPERS && env.UPLOAD_LIMIT && env.READ_LIMIT && env.TURNSTILE_SECRET_KEY && env.TURNSTILE_HOSTNAME && env.PUBLISH_KEY?.length >= 16), uploadsEnabled: env.UPLOADS_ENABLED === 'true' });
  if (request.method === 'POST' && url.pathname === '/papers') return upload(request, env, ctx);
  if (request.method !== 'GET') throw new HttpError(405, 'This operation is not available.');
  if (!env.PAPERS || !env.READ_LIMIT) throw new HttpError(503, 'Cloud storage is not configured.');
  if (!(await env.READ_LIMIT.limit({ key: request.headers.get('CF-Connecting-IP') || 'public' })).success) throw new HttpError(429, 'Too many requests. Please wait one minute.');
  if (url.pathname === '/papers') {
    const cursor = url.searchParams.get('cursor') || undefined;
    if (cursor && cursor.length > 4096) throw new HttpError(400, 'Invalid page cursor.');
    const page = await env.PAPERS.list({ prefix: 'links/', limit: 30, cursor, include: ['customMetadata'] });
    return json({ papers: page.objects.map(recordOf).filter(Boolean).sort((a,b) => b.savedAt.localeCompare(a.savedAt)), cursor: page.truncated ? page.cursor : null });
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
    return new Response(object.body, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="paperloom-${id}.pdf"`, 'Cache-Control': 'no-store' } });
  }
  const match = url.pathname.match(/^\/papers\/([^/]+)\/(pdf|settings)$/);
  if (!match || !ID.test(match[1])) throw new HttpError(404, 'Paper not found.');
  const [, id, kind] = match;
  const object = await env.PAPERS.get(kind === 'pdf' ? `papers/${id}.pdf` : `settings/${id}.json`);
  if (!object) throw new HttpError(404, 'Paper not found.');
  const filename = kind === 'pdf' ? `paperloom-${id}.pdf` : `paperloom-${id}.json`;
  return new Response(object.body, { headers: { 'Content-Type': kind === 'pdf' ? 'application/pdf' : 'application/json', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store' } });
}
export default {
  async fetch(request, env, ctx) {
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
        // CORS is not authentication. The private publishing key, Turnstile and rate limits protect all writes.
        if (request.method === 'POST' && origin !== allowed) throw new HttpError(403, 'Upload from the configured website.');
        response = await route(request, env, ctx);
      }
    } catch (error) { response = json({ error: error instanceof HttpError ? error.message : 'Cloud service is temporarily unavailable.' }, error instanceof HttpError ? error.status : 503); }
    const headers = new Headers(response.headers);
    if (origin === allowed) headers.set('Access-Control-Allow-Origin', allowed);
    headers.set('Vary', 'Origin'); headers.set('X-Content-Type-Options', 'nosniff'); headers.set('Referrer-Policy', 'no-referrer');
    // Do not sandbox PDF responses: that can block a browser's native PDF plugin.
    headers.set('Content-Security-Policy', headers.get('Content-Type') === 'application/pdf' ? "frame-ancestors 'none'" : "default-src 'none'; sandbox");
    return new Response(response.body, { status: response.status, headers });
  }
};
