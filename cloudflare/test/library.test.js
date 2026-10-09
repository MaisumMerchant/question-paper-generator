import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
const origin = 'https://maisummerchant.github.io';
const base = 'https://paperloom-library.example.workers.dev';
const originalFetch = globalThis.fetch;
class Bucket {
  data = new Map();
  async put(key, value, options = {}) { const bytes = value instanceof ReadableStream ? new Uint8Array(await new Response(value).arrayBuffer()) : value instanceof ArrayBuffer ? new Uint8Array(value) : new TextEncoder().encode(value); this.data.set(key, { key, bytes, ...options }); }
  async get(key) { const object = this.data.get(key); return object ? { ...object, body: new Blob([object.bytes]).stream(), httpEtag: '"test-etag"' } : null; }
  async delete(key) { this.data.delete(key); }
  async list({ prefix, limit, cursor }) { const items = [...this.data.values()].filter(o => o.key.startsWith(prefix)).sort((a,b) => a.key.localeCompare(b.key)); const offset = Number(cursor || 0); return { objects: items.slice(offset,offset+limit), truncated: items.length > offset+limit, cursor: String(offset+limit) }; }
}
function environment() { return { ALLOWED_ORIGIN: origin, TURNSTILE_HOSTNAME: 'maisummerchant.github.io', UPLOADS_ENABLED: 'true', TURNSTILE_SECRET_KEY: 'unit-test-only', PUBLISH_KEY: 'unit-test-publishing-key-only', PAPERS: new Bucket(), UPLOAD_LIMIT: { limit: async () => ({ success: true }) }, READ_LIMIT: { limit: async () => ({ success: true }) } }; }
function verify(verdict = { success: true, hostname: 'maisummerchant.github.io', action: 'save-paper' }) { globalThis.fetch = async url => { assert.equal(url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify'); return Response.json(verdict); }; }
function uploadRequest(changes = {}) {
  const form = new FormData();
  form.append('pdf', changes.pdf || new File(['%PDF-1.7\nunit-test\n%%EOF'], 'paper.pdf', { type: 'application/pdf' }));
  form.append('snapshot', new File([changes.snapshot || JSON.stringify({ version: 1, class: 'XI', subject: 'Physics', questions: [{ section: 'B', text: 'Define work.' }] })], 'paper.json', { type: 'application/json' }));
  form.append('publisherKey', changes.key ?? 'unit-test-publishing-key-only'); form.append('title', changes.title ?? 'Class XI Physics'); form.append('turnstileToken', changes.token ?? 'unit-test-token'); form.append('publicConsent', changes.consent ?? 'yes');
  return new Request(base+'/papers', { method: 'POST', body: form, headers: { Origin: changes.origin ?? origin, 'CF-Connecting-IP': '192.0.2.1', ...(changes.headers || {}) } });
}
async function save(env) { verify(); const response = await worker.fetch(uploadRequest(), env); assert.equal(response.status,201); return response.json(); }
test.afterEach(() => { globalThis.fetch = originalFetch; });
test('owner-protected upload stores PDF and question snapshot', async () => { const env=environment(); const r=await save(env);assert.equal(r.title,'Class XI Physics');assert.equal(env.PAPERS.data.size,3);assert.ok(env.PAPERS.data.has(`papers/${r.id}.pdf`)); });
test('public listing and both downloads work without sign-in', async () => { const env=environment(),r=await save(env);const list=await worker.fetch(new Request(base+'/papers'),env);assert.deepEqual((await list.json()).papers.map(p=>p.id),[r.id]);for(const kind of ['pdf','settings']){const d=await worker.fetch(new Request(`${base}/papers/${r.id}/${kind}`),env);assert.equal(d.status,200);assert.match(d.headers.get('Content-Disposition'),/^attachment/);assert.equal(d.headers.get('X-Content-Type-Options'),'nosniff');assert.ok((await d.arrayBuffer()).byteLength);} });
test('valid CORS preflight is allowed without credentials',async()=>{const r=await worker.fetch(new Request(base+'/papers',{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST'}}),environment());assert.equal(r.status,204);assert.equal(r.headers.get('Access-Control-Allow-Origin'),origin);assert.equal(r.headers.get('Access-Control-Allow-Credentials'),null);});
test('foreign origins and originless uploads are rejected',async()=>{const env=environment();let r=await worker.fetch(uploadRequest({origin:'https://evil.example'}),env);assert.equal(r.status,403);assert.equal(env.PAPERS.data.size,0);const req=uploadRequest();req.headers.delete('Origin');r=await worker.fetch(req,env);assert.equal(r.status,403);});
test('upload limiter blocks writes',async()=>{const env=environment();env.UPLOAD_LIMIT.limit=async()=>({success:false});const r=await worker.fetch(uploadRequest(),env);assert.equal(r.status,429);assert.equal(env.PAPERS.data.size,0);});
test('read limiter blocks listing',async()=>{const env=environment();env.READ_LIMIT.limit=async()=>({success:false});assert.equal((await worker.fetch(new Request(base+'/papers'),env)).status,429);});
test('missing rate limiter fails closed',async()=>{const env=environment();delete env.UPLOAD_LIMIT;assert.equal((await worker.fetch(uploadRequest(),env)).status,503);});
test('paused uploads do not store papers',async()=>{const env=environment();env.UPLOADS_ENABLED='false';assert.equal((await worker.fetch(uploadRequest(),env)).status,503);assert.equal(env.PAPERS.data.size,0);});
test('public sharing requires explicit consent',async()=>{const r=await worker.fetch(uploadRequest({consent:'no'}),environment());assert.equal(r.status,400);});
test('forged, wrong-host and wrong-action verification tokens cannot upload',async()=>{for(const verdict of [{success:false},{success:true,hostname:'evil.example',action:'save-paper'},{success:true,hostname:'maisummerchant.github.io',action:'other'}]){verify(verdict);const env=environment();assert.equal((await worker.fetch(uploadRequest(),env)).status,403);assert.equal(env.PAPERS.data.size,0);}});
test('missing secret and unavailable verification fail closed',async()=>{let env=environment();delete env.TURNSTILE_SECRET_KEY;assert.equal((await worker.fetch(uploadRequest(),env)).status,503);env=environment();globalThis.fetch=async()=>{throw Error('offline');};assert.equal((await worker.fetch(uploadRequest(),env)).status,503);assert.equal(env.PAPERS.data.size,0);});
test('fake PDFs are rejected despite their MIME type',async()=>{const r=await worker.fetch(uploadRequest({pdf:new File(['not pdf'],'bad.pdf',{type:'application/pdf'})}),environment());assert.equal(r.status,400);});
test('oversized uploads are rejected',async()=>{const r=await worker.fetch(uploadRequest({headers:{'Content-Length':String(30*1024*1024)}}),environment());assert.equal(r.status,413);});
test('invalid JSON snapshots and missing titles are rejected',async()=>{assert.equal((await worker.fetch(uploadRequest({snapshot:'invalid'}),environment())).status,400);assert.equal((await worker.fetch(uploadRequest({title:''}),environment())).status,400);});
test('MCQ snapshots with section A, options and answers are accepted',async()=>{const env=environment();verify();const snapshot=JSON.stringify({version:1,class:'XI',subject:'Mathematics',questions:[{section:'A',type:'mcq',text:'Simplify $\\\\frac{2}{4}$.',options:{A:'0.5',B:'2',C:'4',D:'8'},answer:'A'}]});const r=await worker.fetch(uploadRequest({snapshot,title:'Class XI Mathematics'}),env);assert.equal(r.status,201);const s=JSON.parse(await (await worker.fetch(new Request(`${base}/papers/${(await r.json()).id}/settings`),env)).text());assert.equal(s.questions[0].options.A,'0.5');});
test('malformed MCQ options are rejected',async()=>{const env=environment();for(const options of [{A:'ok',B:'ok',C:'ok',D:'ok',E:'ok',F:'ok',G:'ok',H:'ok',I:'too many'},{A:'ok',B:123},{A:'ok'}]){const snapshot=JSON.stringify({version:1,class:'XI',subject:'Mathematics',questions:[{section:'A',text:'Simplify.',options,answer:'A'}]});assert.equal((await worker.fetch(uploadRequest({snapshot,title:'Class XI Mathematics'}),env)).status,400);}assert.equal(env.PAPERS.data.size,0);});
test('unexpected methods and path traversal are rejected',async()=>{for(const method of ['DELETE','PUT','PATCH'])assert.equal((await worker.fetch(new Request(base+'/papers',{method}),environment())).status,405);assert.equal((await worker.fetch(new Request(base+'/papers/not-a-safe-id/pdf'),environment())).status,404);});
test('partial storage failures roll back orphan settings and do not claim success',async()=>{verify();const env=environment();const put=env.PAPERS.put.bind(env.PAPERS);env.PAPERS.put=async(key,...args)=>{if(key.startsWith('papers/'))throw Error('unavailable');return put(key,...args);};assert.equal((await worker.fetch(uploadRequest(),env)).status,503);assert.equal(env.PAPERS.data.size,0);});
test('latest-slot cursor pagination returns the next page',async()=>{const env=environment();for(let i=0;i<31;i++){const id=String(i).padStart(13,'0')+'-00000000-0000-0000-0000-000000000000';env.PAPERS.data.set(`links/${String(i).padStart(12,'0')}`,{key:`links/${String(i).padStart(12,'0')}`,customMetadata:{record:JSON.stringify({id,savedAt:new Date().toISOString(),title:'Paper '+i})}});}const first=await(await worker.fetch(new Request(base+'/papers'),env)).json();assert.equal(first.papers.length,30);assert.ok(first.cursor);const second=await(await worker.fetch(new Request(base+'/papers?cursor='+first.cursor),env)).json();assert.equal(second.papers.length,1);assert.equal(second.cursor,null);});

class KV {
  data = new Map();
  async put(key,value,options={}) { this.data.set(key,{value:typeof value==='string'?new TextEncoder().encode(value):new Uint8Array(value),metadata:options.metadata,expirationTtl:options.expirationTtl}); }
  async get(key,{type}) { assert.equal(type,'arrayBuffer'); const v=this.data.get(key); return v?v.value.slice().buffer:null; }
  async delete(key) { this.data.delete(key); }
  async list({prefix,limit,cursor}) { const keys=[...this.data.keys()].filter(k=>k.startsWith(prefix)).sort();const offset=Number(cursor||0);return {keys:keys.slice(offset,offset+limit).map(name=>({name,metadata:this.data.get(name).metadata})),list_complete:keys.length<=offset+limit,cursor:String(offset+limit)}; }
}
function kvEnvironment() {const env=environment();delete env.PAPERS;env.PAPERS_KV=new KV();return env;}
test('free KV upload, metadata listing and both binary downloads',async()=>{const env=kvEnvironment(),saved=await save(env);assert.equal(env.PAPERS_KV.data.size,3);const list=await(await worker.fetch(new Request(base+'/papers'),env)).json();assert.equal(list.papers[0].id,saved.id);for(const kind of ['pdf','settings']) {const r=await worker.fetch(new Request(`${base}/papers/${saved.id}/${kind}`),env);assert.equal(r.status,200);assert.ok((await r.arrayBuffer()).byteLength);}});
test('free KV quota failures return unavailable and never success',async()=>{verify();const env=kvEnvironment();env.PAPERS_KV.put=async()=>{throw Error('free quota exceeded');};const r=await worker.fetch(uploadRequest(),env);assert.equal(r.status,503);assert.equal(env.PAPERS_KV.data.size,0);});

test('short links serve the raw PDF inline with no webpage or login',async()=>{const env=kvEnvironment(),saved=await save(env);assert.match(saved.shortCode,/^[A-Za-z0-9_-]{12}$/);const short=await worker.fetch(new Request(`${base}/p/${saved.shortCode}`),env);const old=await worker.fetch(new Request(`${base}/papers/${saved.id}/pdf`),env);assert.equal(short.status,200);assert.equal(short.headers.get('Content-Type'),'application/pdf');assert.match(short.headers.get('Content-Disposition'),/^inline;/);assert.doesNotMatch(short.headers.get('Content-Security-Policy'),/sandbox/);assert.match(old.headers.get('Content-Disposition'),/^attachment;/);assert.equal(short.headers.get('Location'),null);assert.deepEqual(await short.arrayBuffer(),await old.arrayBuffer());});
test('compact legacy links work without migration',async()=>{const env=kvEnvironment(),saved=await save(env);const bytes=new Uint8Array(22);let n=Number(saved.id.slice(0,13));for(let i=5;i>=0;i--){bytes[i]=n%256;n=Math.floor(n/256);}const hex=saved.id.slice(14).replace(/-/g,'');for(let i=0;i<16;i++)bytes[6+i]=parseInt(hex.slice(i*2,i*2+2),16);const code=Buffer.from(bytes).toString('base64url');assert.equal(code.length,30);assert.equal((await worker.fetch(new Request(`${base}/p/${code}`),env)).status,200);});
test('missing and malformed short links return not found',async()=>{for(const code of ['aaaaaaaaaaaa','bad','x'.repeat(30),'..'])assert.equal((await worker.fetch(new Request(`${base}/p/${code}`),kvEnvironment())).status,404);});



test('publishing key is required and fails closed before writes',async()=>{
  for(const key of ['', 'incorrect']) {const env=environment();verify();const r=await worker.fetch(uploadRequest({key}),env);assert.equal(r.status,403);assert.equal(env.PAPERS.data.size,0);}
  const env=environment();delete env.PUBLISH_KEY;assert.equal((await worker.fetch(uploadRequest(),env)).status,503);
});
test('same class and subject retain one permanent link to the newest PDF and JSON',async()=>{
  const env=kvEnvironment();const first=await save(env);
  const snapshot=JSON.stringify({version:1,class:'XI',subject:'physics',questions:[{section:'B',text:'Latest question.'}]});
  const pdf=new File(['%PDF-1.7\nlatest version\n%%EOF'],'latest.pdf',{type:'application/pdf'});
  const response=await worker.fetch(uploadRequest({title:'New paper',snapshot,pdf}),env);assert.equal(response.status,200);const latest=await response.json();
  assert.equal(latest.shortCode,first.shortCode);assert.notEqual(latest.id,first.id);
  const listing=await(await worker.fetch(new Request(base+'/papers'),env)).json();assert.equal(listing.papers.length,1);assert.equal(listing.papers[0].id,latest.id);
  const shared=await worker.fetch(new Request(`${base}/p/${first.shortCode}`),env);assert.match(await shared.text(),/latest version/);assert.match(shared.headers.get('Content-Disposition'),/^inline/);assert.equal(shared.headers.get('Cache-Control'),'no-store');
  const settings=await(await worker.fetch(new Request(`${base}/papers/${latest.id}/settings`),env)).json();assert.equal(settings.questions[0].text,'Latest question.');assert.equal(settings.publisherKey,undefined);
  assert.equal(env.PAPERS_KV.data.get(`papers/${first.id}.pdf`).expirationTtl,86400);assert.equal(env.PAPERS_KV.data.get(`papers/${latest.id}.pdf`).expirationTtl,undefined);
});
test('class and subject have independent slots, names canonicalize',async()=>{
  const env=environment();verify();const first=await save(env);
  for(const [className,subject] of [['X','Physics'],['XI','Biology']]) {
    const snapshot=JSON.stringify({version:1,class:className,subject,questions:[{section:'B',text:'Question.'}]});
    const r=await(await worker.fetch(uploadRequest({snapshot}),env)).json();assert.notEqual(r.shortCode,first.shortCode);
  }
  const maths=async subject=>await(await worker.fetch(uploadRequest({snapshot:JSON.stringify({version:1,class:'IX',subject,questions:[{section:'B',text:'Question.'}]})}),env)).json();
  assert.equal((await maths('Maths')).shortCode,(await maths('Mathematics')).shortCode);
});
test('failed replacement leaves the old alias, PDF and JSON intact',async()=>{
  const env=environment();const first=await save(env);const put=env.PAPERS.put.bind(env.PAPERS);
  for(const failure of ['papers/','links/']) {
    env.PAPERS.put=async(key,...args)=>{if(key.startsWith(failure))throw Error('storage unavailable');return put(key,...args);};
    assert.equal((await worker.fetch(uploadRequest({title:'replacement'}),env)).status,503);
    assert.equal(env.PAPERS.data.size,3);assert.equal(await new Response((await env.PAPERS.get(`links/${first.shortCode}`)).body).text(),first.id);
    assert.equal((await worker.fetch(new Request(`${base}/p/${first.shortCode}`),env)).status,200);
  }
});
