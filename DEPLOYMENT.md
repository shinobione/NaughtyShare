# NaughtyShare deployment

This document intentionally contains **no production identifiers, emails, tokens or private media**.

## 1. Install and authenticate Wrangler

```bash
npm install
npx wrangler login
```

## 2. Create private storage

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

## 3. Configure Cloudflare Access

Deploy NaughtyShare on an Access-protected hostname, preferably a custom hostname on a Cloudflare-managed domain.

Create a Cloudflare Access application for that hostname and an **Allow** policy whose identity rule contains exactly the two approved email addresses. Do not use `Everyone`, a whole email domain, or a login-method-only rule.

Email one-time PIN is sufficient for the initial two-person setup if desired. The Access policy is the first authorization boundary; the Worker performs a second one.

From the Access application settings, collect:

- the team domain, for example `your-team.cloudflareaccess.com`;
- the Application Audience (AUD) tag.

## 4. Store private runtime configuration as Worker secrets

Never commit the values below to Git.

```bash
npx wrangler secret put ACCESS_TEAM_DOMAIN
npx wrangler secret put ACCESS_AUD
npx wrangler secret put ALLOWED_EMAILS
```

For `ALLOWED_EMAILS`, enter the two exact approved addresses separated by a comma:

```text
first@example.com,second@example.com
```

The Worker rejects a request unless the Cloudflare Access JWT signature, issuer and audience are valid **and** its verified email exists in this list.

## 5. Validate before deployment

```bash
npm run check
```

This builds the PWA and asks Wrangler to bundle/validate the Worker using `deploy --dry-run`; it does not publish anything.

## 6. Deploy

```bash
npm run deploy
```

Ensure the final application hostname is the hostname protected by the Access application from step 3.

## 7. Production smoke test

Use disposable/non-sensitive test media first.

1. Open the PWA while logged out: Cloudflare Access must challenge you before the app loads.
2. Authenticate with approved account A: `/api/health` should make the UI show `Coffre connecté`.
3. Upload one disposable image smaller than 95 MB.
4. Confirm it appears in the gallery and loads from `/media/<id>`.
5. Upload one short disposable video and verify playback plus seeking.
6. Authenticate with approved account B and confirm the same gallery is visible.
7. Attempt access from an unapproved email and confirm Access denies it.
8. Confirm the R2 bucket still has no public endpoint enabled.
9. Delete the disposable objects manually before using real private media if desired.

## Current upload limit

Phase 1 uses direct authenticated uploads through the Worker and intentionally caps each file at **95 MB**. This stays below Cloudflare's 100 MB request-body limit on Free/Pro accounts. A later slice will add multipart upload for larger videos.

## Logging rule

Do not add request bodies, filenames, JWTs, email addresses or media URLs to application logs. The Worker currently emits no application `console.log` output.
