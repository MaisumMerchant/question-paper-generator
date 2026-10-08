# Shared paper library — owner setup

Teachers do **not** sign in. GitHub Pages remains the frontend. A Cloudflare Worker receives uploads; a Workers KV namespace stores PDFs and question snapshots. The Worker deliberately provides public download/list routes, but no anonymous delete, overwrite or administration route.

**Deployment:** this repository uses `paperloom-library` with the `paperloom-papers` KV namespace. Its public endpoint and site key are configured in `public/cloud-config.json`. The Turnstile secret exists only in Worker secrets. The owner maintains the service separately; teachers need no accounts.

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
   npx wrangler deploy
   ```
   Do not paste this secret into GitHub, `cloud-config.json`, chat, or client-side JavaScript. If Wrangler asks to create the Worker before storing its secret, deploy first, set the secret, then deploy again. Uploads fail closed until the secret exists.
5. Copy the actual deployed HTTPS `workers.dev` origin. Edit `public/cloud-config.json` in the repository:
   ```json
   {
     "apiUrl": "https://YOUR-ACTUAL-WORKER.YOUR-ACTUAL-SUBDOMAIN.workers.dev",
     "turnstileSiteKey": "YOUR-PUBLIC-TURNSTILE-SITE-KEY"
   }
   ```
   Replace both placeholders with real values; neither is a secret. `apiUrl` must be an origin, without a path, query string or credentials. Commit/push to trigger the existing GitHub Pages deployment.
6. Open the website. Generate a paper, select **Save to shared library**, name it, confirm public sharing and complete verification if prompted. Confirm the success message, open/download the PDF, copy its link, and verify **Shared papers** from another browser without signing in.

## Free plan — no billing setup

Workers KV Free includes 1 GB storage, 100,000 reads/day, 1,000 writes/day and 1,000 list operations/day. A saved paper uses two writes (PDF + JSON). Other operations and retries consume quota too. On the Free plan, excess operations fail instead of causing overage charges. Free storage is limited, not unlimited; the owner must remove older papers as needed. Keep the account on Free. See [current KV pricing](https://developers.cloudflare.com/kv/platform/pricing/).

KV is eventually consistent: newly saved papers can take about a minute or longer to appear or download from another location. Refresh later rather than saving duplicates. PDFs use native compression and have a 5 MiB per-file limit.

## Controls and limits

- PDF limit: 5 MiB. Question JSON limit: 256 KiB. Streaming request limit is checked before multipart parsing.
- Server-side PDF signature/type validation; metadata and snapshot validation.
- Server-side Turnstile validation checks success, the exact hostname and `save-paper` action. Missing protection fails closed.
- Upload rate limit: 5 attempts per minute per source IP; read limit: 120 requests per minute per source IP. Cloudflare's binding is location-local and eventually consistent; it is **not** a strict global storage/billing quota or a complete abuse guarantee.
- Exact CORS origin: `https://maisummerchant.github.io`. CORS is not authentication; Turnstile and rate limits are independent protections. Other apps on that same GitHub Pages origin are not isolated by CORS.
- Newest-first listing, 30 papers per page, with opaque KV cursor pagination.
- Public downloads are served as attachments with fixed content types and `nosniff`. No uploaded HTML is rendered. PDF signature checking is not malware scanning.
- No end-user identities are stored. Public paper names, questions, class/subject, creation time and files are visible. Do not upload confidential/unreleased exams, student information or personal data. **No-login means the library is not private.**
- Keep Turnstile credentials server-side. No storage admin token is needed in GitHub Pages.
- To stop new saves, change `UPLOADS_ENABLED` to `"false"` in `wrangler.jsonc` and deploy. Existing papers remain readable. To remove inappropriate papers, the owner deletes their matching `papers/<id>.pdf` and `settings/<id>.json` keys through the Cloudflare Workers KV dashboard.

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
