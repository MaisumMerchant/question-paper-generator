# Shared paper library — owner setup

Readers do **not** sign in. Publishing requires the owner’s private publishing key. GitHub Pages remains the frontend. A Cloudflare Worker receives uploads; a Workers KV namespace stores PDFs and question snapshots. The Worker deliberately provides public download/list routes and owner-key-protected saves/replacements, but no anonymous delete or administration route.

**Deployment:** this repository uses `paperloom-library` with the `paperloom-papers` KV namespace. Its public endpoint and site key are configured in `public/cloud-config.json`. The Turnstile secret exists only in Worker secrets. The owner maintains the service separately; readers need no accounts; publishers need the private publishing key.

## One-time setup

1. Create/sign in to your **Cloudflare account**. Stay on **Workers Free** and use **Workers KV Free**. No payment method or R2 subscription is required. Do not click Upgrade or activate R2.
2. Clone this repository. In your own terminal:
   ```sh
   cd cloudflare
   npm install
   npx wrangler login
   npx wrangler kv namespace create paperloom-papers
   ```
   If the namespace already exists, reuse it. Set `kv_namespaces[0].id` in `wrangler.jsonc` to its returned ID; the binding is `PAPERS_KV`. You can instead deploy via the dashboard code editor and add the KV and Rate limiter bindings shown in that config.
3. In Cloudflare **Turnstile**, create a Managed widget. Allow the hostname `maisummerchant.github.io`. Copy its **site key** (public) and **secret key** (private). Teachers may see a human-verification check, but never an account login.
4. Set the secret through the private terminal prompt:
   ```sh
   npx wrangler secret put TURNSTILE_SECRET_KEY
   npx wrangler secret put PUBLISH_KEY
   npx wrangler deploy
   ```
   Do not paste this secret into GitHub, `cloud-config.json`, chat, or client-side JavaScript. If Wrangler asks to create the Worker before storing its secret, deploy first, set the secret, then deploy again. Choose a publishing key of at least 16 characters. Uploads fail closed until both secrets exist. With dashboard deployment, add **PUBLISH_KEY** under Settings → Variables and Secrets with type **Secret**. Keep this key private and separate from the Turnstile secret.
5. Copy the actual deployed HTTPS `workers.dev` origin. Edit `public/cloud-config.json` in the repository:
   ```json
   {
     "apiUrl": "https://YOUR-ACTUAL-WORKER.YOUR-ACTUAL-SUBDOMAIN.workers.dev",
     "turnstileSiteKey": "YOUR-PUBLIC-TURNSTILE-SITE-KEY"
   }
   ```
   Replace both placeholders with real values; neither is a secret. `apiUrl` must be an origin, without a path, query string or credentials. Commit/push to trigger the existing GitHub Pages deployment.
6. Open the website. Generate a paper, select **Save to shared library**, name it, enter your publishing key, confirm public sharing and complete verification if prompted. Confirm the success message, open/download the PDF, copy its link, and verify **Shared papers** from another browser without signing in.

## Free plan — no billing setup

Workers KV Free includes 1 GB storage, 100,000 reads/day, 1,000 writes/day and 1,000 list operations/day. A first save uses three writes (PDF + JSON + permanent alias). Replacing a paper uses those three writes plus up to two writes to expire superseded files after 24 hours. Other operations and retries consume quota too. On the Free plan, excess operations fail instead of causing overage charges. Free storage is limited, not unlimited; the owner must remove older papers as needed. Keep the account on Free. See [current KV pricing](https://developers.cloudflare.com/kv/platform/pricing/).

KV is eventually consistent: newly saved papers can take about a minute or longer to appear or download from another location. Refresh later rather than saving duplicates. PDFs use native compression and have a 5 MiB per-file limit.

## Controls and limits

- PDF limit: 5 MiB. Question JSON limit: 256 KiB. Streaming request limit is checked before multipart parsing.
- Server-side PDF signature/type validation; metadata and snapshot validation.
- Server-side Turnstile validation checks success, the exact hostname and `save-paper` action. Missing protection fails closed.
- Upload rate limit: 5 attempts per minute per source IP; read limit: 120 requests per minute per source IP. Cloudflare's binding is location-local and eventually consistent; it is **not** a strict global storage/billing quota or a complete abuse guarantee.
- Exact CORS origin: `https://maisummerchant.github.io`. CORS is not authentication; Turnstile and rate limits are independent protections. Other apps on that same GitHub Pages origin are not isolated by CORS.
- One latest paper per class and subject, 30 entries per page, with opaque KV cursor pagination. Short permanent aliases are deterministic for the class/subject; Maths/Mathematics and Computer/Computer Science share their respective slot.
- Explicit downloads are served as attachments; shared `/p/` links return the raw PDF with inline disposition for the browser’s native viewer. Both use fixed content types and `nosniff`. No uploaded HTML is rendered. PDF signature checking is not malware scanning.
- All writes require PUBLISH_KEY, verified server-side with a constant-time digest comparison. Anonymous readers cannot claim or replace a class/subject slot. Key guessing is limited by the upload limiter.
- No end-user identities are stored. Public paper names, questions, class/subject, creation time and files are visible. Do not upload confidential/unreleased exams, student information or personal data. **No-login means the library is not private.**
- Keep Turnstile credentials server-side. No storage admin token is embedded in GitHub Pages. The owner enters the publishing key into the password field; it is sent over HTTPS only in the save form, never copied into the public PDF or snapshot. Remembering it on this device is optional; use that only on a trusted device because local storage is readable by JavaScript from the same origin.
- To stop new saves, change `UPLOADS_ENABLED` to `"false"` in `wrangler.jsonc` and deploy. Existing papers remain readable. To remove a paper or clear the library, the owner deletes their matching `papers/<id>.pdf`, `settings/<id>.json` and `links/<shortCode>` keys through the Cloudflare Workers KV dashboard.

## Question snapshots

Every save also stores the exact generated question list and paper settings as JSON. **Question JSON** downloads it; **Import JSON** can load those saved questions into the generator. Paper properties are preserved under `paper`, but importing a question bank does not automatically reapply its counts, marks or instructions. This release does not promise collaborative editing of a PDF.

## Testing

```sh
node --test cloudflare/test/*.test.js
npm run build
```

Backend unit tests use an in-memory storage substitutes, including the KV adapter and mocked Turnstile replies. Browser tests can mock the service to verify UI behavior. Neither replaces a real hosted save/download check after setup. Do not use test Turnstile keys, permissive CORS or disabled verification in production.

Official references:
- [GitHub Pages is static hosting](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- [KV bindings](https://developers.cloudflare.com/kv/concepts/kv-bindings/)
- [Worker rate-limit bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
- [Turnstile server validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)

## Short public links

Copy link uses `/p/<12-character-code>` for newly saved papers. Older papers get lossless compact links with no migration. Both return `application/pdf` with `Content-Disposition: inline`, with no HTML page, iframe, or PDF.js wrapper. The separate Download PDF button still uses attachment delivery. PDF responses are not CSP-sandboxed, so native PDF viewers are not blocked. Browser support and user settings determine whether the PDF is displayed or downloaded; the site cannot override a browser configured to always download PDFs. Original `/papers/<id>/pdf` URLs remain valid. No third-party URL shortener or tracking service is used.

## Permanent latest-paper links

Save to shared library stages a new immutable PDF and matching question JSON, then commits its permanent class/subject alias last. Saving the same class and subject keeps the exact `/p/<code>` URL; the displayed paper name does not affect the slot. A failed staged save leaves the last published alias intact. The library lists alias metadata, so replacement never adds another visible entry. Generating or exporting locally does not publish anything.

Superseded PDF/JSON files expire after 24 hours to allow eventually consistent reads to finish; only the latest alias is listed. A failed expiry cleanup can leave an unlisted orphan for owner maintenance, but does not fail an otherwise committed save. KV does not provide global transactions; concurrent saves are last alias write wins, and updates can take a minute or longer to propagate. All PDF/JSON responses use no-store, but an already-open PDF tab must be reloaded. Owners should avoid simultaneous saves for the same class/subject.
