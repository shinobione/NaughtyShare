# NaughtyShare

Private two-person PWA for securely sharing personal photos and videos.

> **Security rule:** media files, Google OAuth tokens, credentials and secrets must never be committed to this repository.

## Goal

NaughtyShare is a private gallery shared by two explicitly authorized users. It is designed as an installable PWA with a mobile-first experience for photos and videos.

## Google Photos constraint

Google Photos **Locked Folder cannot be accessed or shared directly by third-party apps**. An item must first be moved out of Locked Folder before it can be selected/shared. For user-library selection, the supported integration is the **Google Photos Picker API**.

Intended import flow:

1. Owner temporarily moves selected items out of Google Photos Locked Folder.
2. Owner opens NaughtyShare and chooses **Import from Google Photos**.
3. Google Photos Picker is used to explicitly select items.
4. NaughtyShare copies the selected bytes into its own private media vault.
5. Owner may move the source items back into Google Photos Locked Folder.
6. The second authorized user views the imported copy only through NaughtyShare.

Google Photos Picker URLs are temporary and are not used as permanent storage.

## Architecture

```text
Cloudflare Access
    |
    | exact-email policy + verified JWT
    v
NaughtyShare Worker + static PWA
    |-- JWT signature/AUD/issuer validation
    |-- second exact-email allowlist
    |
    +--> private R2 bucket       original photo/video bytes
    |
    `--> D1 database             media index and ownership metadata
```

Google Photos Picker will plug into the same authenticated import API during Phase 2.

### Privacy boundary

- The GitHub repository contains code and documentation only.
- R2 is private and must not expose an `r2.dev` or public custom-domain endpoint.
- `/api/*` and `/media/*` are handled by the authenticated Worker.
- Private media responses use `Cache-Control: private, no-store`.
- The PWA service worker explicitly refuses to cache `/api/*` and `/media/*`.
- No analytics or third-party trackers are present.
- Cloudflare Access JWTs are signature-validated by the Worker; an email header alone is never trusted.
- Exact authorized emails are checked a second time in the Worker through `ALLOWED_EMAILS`.

## Current implementation — v0.2.0

The `feat/secure-vault` branch contains the first Secure Vault implementation:

- Cloudflare Worker backend.
- Cloudflare Access JWT validation using `jose`.
- Exact two-user allowlist support.
- Private R2 media storage binding.
- D1 media metadata index.
- Authenticated gallery listing.
- Authenticated image/video streaming with byte-range support.
- Direct device upload for images and videos up to 95 MB per file.
- Streamed uploads: media is not buffered into Worker memory.
- R2 rollback when D1 metadata commit fails.
- CSP, frame denial, referrer and browser-permission headers for static assets.
- GitHub CI build + Wrangler dry-run validation.

The code is **not production-active until the Cloudflare resources, Access application, exact emails, AUD and team domain are configured**. See [`DEPLOYMENT.md`](./DEPLOYMENT.md).

## Planned phases

### Phase 0 — Foundation
- [x] Initialize repository
- [x] Define privacy boundary
- [x] Document Google Photos Locked Folder limitation
- [x] PWA shell + manifest + offline app shell
- [x] Private API skeleton

### Phase 1 — Secure vault
- [x] Cloudflare Access JWT verification in Worker
- [x] Second exact-email allowlist in Worker
- [x] Private R2 object storage binding
- [x] D1 media metadata index
- [x] Authenticated photo/video streaming
- [x] Upload from device up to 95 MB per file
- [x] Responsive initial gallery
- [ ] Configure production Cloudflare resources
- [ ] Configure Access policy for exactly two emails
- [ ] Production smoke test with disposable media
- [ ] Multipart upload for large videos

### Phase 2 — Google Photos import
- [ ] Google OAuth configuration
- [ ] Google Photos Picker session flow
- [ ] Copy selected photos/videos into private storage
- [ ] Import progress + failure recovery

### Phase 3 — Gallery UX
- [ ] Fullscreen photo viewer
- [ ] Improved video viewer
- [ ] Favorites
- [ ] Captions
- [ ] Search/filter by type/date
- [ ] Optional thumbnails/transcodes

### Phase 4 — Hardening
- [x] Initial Content Security Policy
- [ ] Rate limiting
- [ ] Access audit events without sensitive media data
- [ ] Backup/restore strategy
- [ ] EXIF/location metadata policy
- [ ] Security review

## Repository policy

This repository contains **code and documentation only**. Do not add personal photos/videos, exports from Google Photos, `.env` files, `.dev.vars`, OAuth credentials, service-account files, private keys or production database dumps.
