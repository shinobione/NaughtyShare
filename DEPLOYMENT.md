# NaughtyShare deployment

This document intentionally contains **no production identifiers, emails, tokens or private media**.

## Deployment model

NaughtyShare can start on its Cloudflare `workers.dev` hostname; a custom domain is optional later.

Security remains deny-by-default:

- `preview_urls: false` disables Worker preview URLs;
- `workers_dev: true` provides the initial stable application hostname;
- `assets.run_worker_first: true` sends the PWA shell and static assets through Worker authentication too;
- required Worker secrets are declared explicitly;
- the production preflight refuses to deploy while the D1 ID is still a placeholder;
- the GitHub production workflow is manual only and requires typing `DEPLOY`.

The first deployment uses **bootstrap mode**. It intentionally installs invalid Access credentials, so the deployed Worker exists but returns an authentication error to everyone. After Cloudflare Access is enabled on that Worker, a second **production mode** deployment installs the real Access settings and exact two-email allowlist.

## 1. Create private Cloudflare storage

Authenticate Wrangler locally if you are doing the resource setup from a terminal:

```bash
npm install
npx wrangler login
```

Create the R2 bucket used by the `MEDIA` binding:

```bash
npx wrangler r2 bucket create naughtyshare-media
```

Do **not** enable public `r2.dev` access for this bucket and do not attach a public R2 custom domain.

Create the D1 database:

```bash
npx wrangler d1 create naughtyshare
```

Copy the returned D1 `database_id` into `wrangler.jsonc`, replacing the all-zero placeholder.

Apply the schema:

```bash
npx wrangler d1 migrations apply naughtyshare --remote
```

The D1 database ID is an identifier, not an application secret; it belongs in `wrangler.jsonc`.

## 2. Configure the GitHub deployment environment

Create a GitHub Environment named `production`.

For the bootstrap deployment it needs:

```text
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN
```

Store both as GitHub encrypted environment secrets. Scope the Cloudflare API token as narrowly as practical to the account/resources NaughtyShare needs. Never commit or paste the token into an issue, PR, log or screenshot.

The real Access values are added later in step 5.

## 3. Validate and perform the locked bootstrap deploy

Before deployment:

```bash
npm run check
npm run preflight:production
```

The production preflight verifies that:

- Worker preview URLs are disabled;
- static assets are routed through Worker authentication;
- required Worker secret names are declared;
- the D1 database ID is no longer the placeholder;
- either `workers.dev` is enabled or a real custom-domain route exists;
- the private R2 binding still points at `naughtyshare-media`.

Then open **Actions → Deploy Production → Run workflow** and choose:

```text
mode: bootstrap
confirm: DEPLOY
```

Bootstrap mode deploys the application with deliberately invalid authentication values. The Worker is therefore present at its `workers.dev` hostname but must not serve the PWA, API or media to an unauthenticated visitor.

Record the resulting `https://<worker>.<account-subdomain>.workers.dev` hostname.

## 4. Enable Cloudflare Access on the Worker

In Cloudflare, enable Access protection for the Worker's `workers.dev` route and configure an **Allow** policy containing exactly the two approved email addresses.

Do not use an `Everyone` rule or a broad whole-domain allow rule for this two-person vault.

Email one-time PIN is suitable for the initial two-person setup if desired. Access becomes the first authorization boundary; the Worker remains the second boundary.

From the resulting Access application/settings, collect:

- the Access team domain, for example `your-team.cloudflareaccess.com`;
- the Application Audience (AUD) tag.

The Worker validates the `Cf-Access-Jwt-Assertion` signature, issuer and audience before accepting its email claim.

## 5. Add the real Access secrets

Add these GitHub `production` environment secrets:

```text
ACCESS_TEAM_DOMAIN
ACCESS_AUD
ALLOWED_EMAILS
```

`ALLOWED_EMAILS` is a comma-separated list containing exactly the same two approved addresses as the Cloudflare Access policy.

At this point the GitHub production environment contains five secrets total:

```text
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN
ACCESS_TEAM_DOMAIN
ACCESS_AUD
ALLOWED_EMAILS
```

## 6. Deploy the real authenticated configuration

Open **Actions → Deploy Production → Run workflow** again and choose:

```text
mode: production
confirm: DEPLOY
```

The workflow:

1. installs dependencies;
2. runs the production preflight;
3. builds the PWA;
4. creates a temporary permission-restricted `.env.production` from GitHub encrypted secrets;
5. runs `wrangler deploy --strict --secrets-file .env.production`, uploading code and Worker secrets together;
6. removes the temporary secrets file even when the job fails.

No production deployment runs automatically on a push or pull request.

## 7. Production smoke test

Use disposable/non-sensitive test media first.

1. Open the `workers.dev` hostname while logged out: Cloudflare Access must challenge you before the PWA is usable.
2. Authenticate with approved account A: `/api/health` should make the UI show `Coffre connecté`.
3. Upload one disposable image smaller than 95 MB.
4. Confirm it appears in the gallery and loads from `/media/<id>`.
5. Upload one short disposable video and verify playback plus seeking.
6. Authenticate with approved account B and confirm the same gallery is visible.
7. Attempt access with an unapproved email and confirm it is denied.
8. Confirm Worker preview URLs and public R2 access remain disabled.
9. Delete the disposable test media before using sensitive content if desired.

Only after this smoke passes should real private media be imported.

## Optional custom domain later

A custom domain can replace the `workers.dev` address later without changing the media architecture. When doing that, keep Cloudflare Access enabled for the new hostname and keep `assets.run_worker_first: true`.

## Current upload limit

Phase 1 uses direct authenticated uploads through the Worker and caps each file at **95 MB**. Larger videos will use multipart upload in a later slice.

## Logging rule

Do not add request bodies, filenames, JWTs, email addresses or media URLs to application logs. The Worker currently emits no application `console.log` output and stores filenames/user identity only in D1, not in R2 custom metadata.
