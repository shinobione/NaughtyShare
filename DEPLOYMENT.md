# NaughtyShare deployment

This document intentionally contains **no production identifiers, emails, tokens or private media**.

## Safety defaults

Production exposure is denied by default in `wrangler.jsonc`:

- `workers_dev: false`
- `preview_urls: false`
- required Worker secrets are declared explicitly
- the production preflight refuses to deploy while the D1 ID is still a placeholder
- the production preflight refuses to deploy until a real custom-domain route is configured

The GitHub production workflow is **manual only** and requires typing `DEPLOY`.

## 1. Create private Cloudflare storage

Authenticate Wrangler locally:

```bash
npm install
npx wrangler login
```

Create the R2 bucket used by the `MEDIA` binding:

```bash
npx wrangler r2 bucket create naughtyshare-media
```

Do **not** enable `r2.dev` public access and do not attach a public R2 custom domain.

Create the D1 database:

```bash
npx wrangler d1 create naughtyshare
```

Copy the returned D1 `database_id` into `wrangler.jsonc`, replacing the all-zero placeholder.

Apply the schema:

```bash
npx wrangler d1 migrations apply naughtyshare --remote
```

## 2. Choose the private app hostname

Use a custom hostname on a Cloudflare-managed domain, for example `share.your-domain.example`.

Add it to `wrangler.jsonc` as a custom-domain route before any production deployment:

```jsonc
"routes": [
  {
    "pattern": "share.your-domain.example",
    "custom_domain": true
  }
]
```

Keep `workers_dev` and `preview_urls` set to `false`.

## 3. Configure Cloudflare Access

Create a Cloudflare Access self-hosted application for the exact hostname chosen above.

Create an **Allow** policy whose identity rule contains exactly the two approved email addresses. Do not use `Everyone`, a whole email domain, or a login-method-only rule.

Email one-time PIN is sufficient for the initial two-person setup if desired. Access is the first authorization boundary; the Worker performs a second exact-email check.

From the Access application settings, collect:

- the team domain, for example `your-team.cloudflareaccess.com`;
- the Application Audience (AUD) tag.

The Worker validates the `Cf-Access-Jwt-Assertion` signature, issuer and audience before trusting the email claim.

## 4. Configure GitHub production secrets

Create a GitHub Environment named `production` and store these secrets in it:

```text
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN
ACCESS_TEAM_DOMAIN
ACCESS_AUD
ALLOWED_EMAILS
```

`ALLOWED_EMAILS` is a comma-separated list containing exactly the two approved addresses.

Scope the Cloudflare API token as narrowly as practical to the target account/resources. Never commit or paste these values into issues, PRs, logs or screenshots.

If desired, add a required reviewer to the GitHub `production` environment for an additional manual deployment gate.

## 5. Validate before deployment

```bash
npm run check
npm run preflight:production
```

`npm run check` builds the PWA and asks Wrangler to bundle/validate the Worker without publishing it.

`npm run preflight:production` additionally refuses production deployment when:

- `workers.dev` or preview URLs are not explicitly disabled;
- the D1 database ID is still the placeholder;
- no real custom-domain route is configured;
- required Worker secret names are missing from Wrangler config;
- the private R2 binding is no longer the expected bucket.

## 6. Manual GitHub deployment

Open **Actions → Deploy Production → Run workflow** and enter:

```text
DEPLOY
```

The workflow:

1. installs dependencies;
2. runs the production preflight;
3. builds the PWA;
4. creates a temporary permission-restricted `.env.production` from GitHub secrets;
5. runs `wrangler deploy --strict --secrets-file .env.production` so code and Worker secrets are uploaded together;
6. removes the temporary secrets file even when the job fails.

No production deployment runs automatically on a push or PR.

## 7. Production smoke test

Use disposable/non-sensitive test media first.

1. Open the final hostname while logged out: Cloudflare Access must challenge you before the app loads.
2. Authenticate with approved account A: `/api/health` should make the UI show `Coffre connecté`.
3. Upload one disposable image smaller than 95 MB.
4. Confirm it appears in the gallery and loads from `/media/<id>`.
5. Upload one short disposable video and verify playback plus seeking.
6. Authenticate with approved account B and confirm the same gallery is visible.
7. Attempt access from an unapproved email and confirm Access denies it.
8. Confirm `workers.dev`, Worker preview URLs and public R2 access are all disabled.
9. Delete the disposable test media before using sensitive content if desired.

## Current upload limit

Phase 1 uses direct authenticated uploads through the Worker and caps each file at **95 MB**. Larger videos will use multipart upload in a later slice.

## Logging rule

Do not add request bodies, filenames, JWTs, email addresses or media URLs to application logs. The Worker currently emits no application `console.log` output and stores filenames/user identity only in D1, not in R2 custom metadata.
