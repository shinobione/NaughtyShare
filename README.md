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

## Current implementation — v0.4.0 production

The production Secure Vault is active on Cloudflare. v0.4.0 is deployed and its main Phase 1.5 gallery-management flows have been smoke-tested successfully in production.

Implemented and smoke-tested foundation:

- Cloudflare Worker backend.
- Cloudflare Access JWT validation using `jose`.
- Exact two-user allowlist support.
- Private R2 media storage binding (`naughtyshare-media`).
- D1 media metadata index.
- Authenticated gallery listing.
- Authenticated image/video streaming with byte-range support.
- Direct device upload for images and videos up to 95 MB per file.
- Streamed uploads: media is not buffered into Worker memory.
- R2 rollback when D1 metadata commit fails.
- CSP, frame denial, referrer and browser-permission headers for static assets.
- GitHub CI build + Wrangler dry-run validation.
- Production Cloudflare resources and Access policy configured.
- Production photo upload/read smoke test passed.
- Production video upload/playback/seek smoke test passed.
- Persistent FR/VN interface switch with Vietnamese browser-locale defaulting.

v0.4.0 production additionally includes and has been validated for:

- persisted sorting by name, media type, duration and upload date;
- authenticated rename/delete actions;
- compensating D1/R2 delete flow;
- expanded photo/video lightbox with previous/next navigation;
- NaughtyShare storage count/bytes summary from the D1 index;
- complete FR/VN strings for the new management UI;
- production smoke pass for sorting, storage counter, rename, delete and expanded photo/video viewer.

Remaining Phase 1 closeout: validate the second authorized user flow with Trân.

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
- [x] Configure production Cloudflare resources
- [x] Configure Access policy for exactly two emails
- [x] Production photo smoke test with disposable media
- [x] Production video playback + seek smoke test
- [ ] Second-user production smoke test with Trân

### Phase 1.5 — Gallery management & viewer **PRODUCTION SMOKE PASS**

#### Sorting and metadata
- [x] Sort gallery by **name**
- [x] Sort gallery by **type** (photo / video)
- [x] Sort gallery by **duration**
- [x] Sort gallery by **date**
- [x] Ascending / descending direction for every sort mode
- [x] Persist the selected sort locally per device
- [x] Derive video duration from authenticated media metadata for duration sorting
- [ ] Persist/backfill video duration server-side so large galleries do not need metadata probing on each fresh device

#### Rename and delete
- [x] Rename a media item from the gallery/viewer
- [x] Treat rename as a safe display-name metadata change in D1; keep the immutable R2 object key stable
- [x] Delete a media item from the gallery/viewer
- [x] Add an explicit confirmation step before deletion
- [x] Use compensating D1/R2 deletion so a failed R2 delete restores the D1 row and remains safely retryable
- [x] Surface clear FR/VN success and failure states for rename/delete

#### Classy expanded viewer / lightbox
- [x] Clicking a photo or video opens a polished **modal/lightbox viewer** above the gallery
- [ ] Optional card-to-viewer morph animation; current dialog honors the global reduced-motion fallback
- [x] Large responsive photo display with contain/fit behavior and no forced crop
- [x] Large responsive video player with native controls, seek and fullscreen support
- [x] Previous / next navigation without closing the viewer
- [x] Close by explicit button, backdrop click and `Esc` on desktop
- [ ] Mobile swipe navigation
- [x] Keep private media URLs behind the authenticated Worker; viewer introduces no public object URLs
- [x] Viewer actions: rename and delete available from the expanded item
- [x] All viewer UI translated FR/VN

#### Storage awareness
- [x] Add a **NaughtyShare storage counter** based on indexed media sizes
- [x] Show total media count + total bytes / MB / GB used by NaughtyShare
- [x] Keep the counter scoped to the `naughtyshare-media` app dataset
- [x] Display a note that Cloudflare R2 free-tier usage is account-wide, so LaunchPAD and NaughtyShare can contribute to the same overall billing quota even though they use separate buckets
- [ ] Add configurable warning thresholds before heavy storage growth
- [ ] Optional later admin-only account-wide R2 usage view if it can be implemented without exposing a Cloudflare management token to the browser

### Phase 2 — Google Photos import
- [ ] Google OAuth configuration
- [ ] Google Photos Picker session flow
- [ ] Copy selected photos/videos into private R2 storage
- [ ] Imported media enters the same D1 index and Gallery Management flow as manual uploads
- [ ] Import progress + failure recovery
- [ ] Prevent duplicate/incomplete imports when a Picker transfer is interrupted

### Phase 3 — Gallery UX expansion
- [ ] Favorites
- [ ] Captions
- [ ] Search by name/caption
- [ ] Filters by type/date in addition to sorting
- [ ] Optional thumbnails/transcodes for faster large galleries
- [ ] Better mobile gallery density/layout controls

### Phase 4 — Large media
- [ ] Multipart/resumable upload for videos above the current 95 MB direct-upload limit
- [ ] Upload progress suitable for large mobile videos
- [ ] Resume/retry strategy without duplicate media records
- [ ] Large-video playback performance review

### Phase 5 — Hardening
- [x] Initial Content Security Policy
- [ ] Rate limiting
- [ ] Access audit events without sensitive media data
- [ ] Backup/restore strategy
- [ ] EXIF/location metadata policy
- [ ] Security review after rename/delete/Google import are active

## Repository policy

This repository contains **code and documentation only**. Do not add personal photos/videos, exports from Google Photos, `.env` files, `.dev.vars`, OAuth credentials, service-account files, private keys or production database dumps.
