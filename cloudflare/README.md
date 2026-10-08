# Shared paper library — owner setup

Teachers do **not** sign in. GitHub Pages remains the frontend. A Cloudflare Worker receives uploads; a private R2 bucket stores PDFs and question snapshots. The Worker deliberately provides public download/list routes, but no anonymous delete, overwrite or administration route.

**Status:** implementation is included; cloud saving is inactive until the owner completes this setup. No Cloudflare account, deployed endpoint or keys are supplied by this repository.

## One-time setup

1. Create/sign in to your **Cloudflare account**. Enable R2 and review Cloudflare's current billing, free allowance and payment-method requirements. Configure usage/billing alerts. No claim of unlimited free storage is made.
2. Clone this repository. In your own terminal:
   ```sh
   cd cloudflare
   npm install
   npx wrangler login
   npx wrangler r2 bucket create paperloom-papers
   ```
   If that bucket already exists in your account, reuse it instead of creating a replacement. Keep the bucket private; do not enable an unrestricted public R2 URL.
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

## Controls and limits

- PDF limit: 20 MiB. Question JSON limit: 256 KiB. Streaming request limit is checked before multipart parsing.
- Server-side PDF signature/type validation; metadata and snapshot validation.
- Server-side Turnstile validation checks success, the exact hostname and `save-paper` action. Missing protection fails closed.
- Upload rate limit: 5 attempts per minute per source IP; read limit: 120 requests per minute per source IP. Cloudflare's binding is location-local and eventually consistent; it is **not** a strict global storage/billing quota or a complete abuse guarantee.
- Exact CORS origin: `https://maisummerchant.github.io`. CORS is not authentication; Turnstile and rate limits are independent protections. Other apps on that same GitHub Pages origin are not isolated by CORS.
- Newest-first listing, 30 papers per page, with opaque R2 cursor pagination.
- Public downloads are served as attachments with fixed content types and `nosniff`. No uploaded HTML is rendered. PDF signature checking is not malware scanning.
- No end-user identities are stored. Public paper names, questions, class/subject, creation time and files are visible. Do not upload confidential/unreleased exams, student information or personal data. **No-login means the library is not private.**
- Keep Turnstile credentials server-side and R2 access private. No storage admin token is needed in GitHub Pages.
- To stop new saves, change `UPLOADS_ENABLED` to `"false"` in `wrangler.jsonc` and deploy. Existing papers remain readable. To remove inappropriate papers, the owner deletes their matching `papers/<id>.pdf` and `settings/<id>.json` objects through the Cloudflare dashboard.

## Question snapshots

Every save also stores the exact generated question list and paper settings as JSON. **Question JSON** downloads it; **Import JSON** can load those saved questions into the generator. Paper properties are preserved under `paper`, but importing a question bank does not automatically reapply its counts, marks or instructions. This release does not promise collaborative editing of a PDF.

## Testing

```sh
node --test cloudflare/test/*.test.js
npm run build
```

Backend unit tests use an in-memory R2 substitute and mocked Turnstile replies. Browser tests can mock the service to verify UI behavior. Neither replaces a real hosted save/download check after setup. Do not use test Turnstile keys, permissive CORS or disabled verification in production.

Official references:
- [GitHub Pages is static hosting](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- [R2 bindings](https://developers.cloudflare.com/r2/api/workers/workers-api-usage/)
- [Worker rate-limit bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
- [Turnstile server validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
