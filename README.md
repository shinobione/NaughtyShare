# NaughtyShare

Private two-person PWA for securely sharing personal photos and videos.

> **Security rule:** media files, credentials and secrets must never be committed to this repository.

## Goal

NaughtyShare is a private gallery shared by two explicitly authorized users. It is designed as an installable PWA with a mobile-first experience for photos and videos.

The product direction is now centered on **manual device import + private organization inside NaughtyShare** rather than Google Photos Picker integration.

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
    +--> private R2 bucket       original media + private organization metadata
    |
    `--> D1 database             canonical media index
```

### Privacy boundary

- The GitHub repository contains code and documentation only.
- R2 is private and must not expose an `r2.dev` or public custom-domain endpoint.
- `/api/*` and `/media/*` are handled by the authenticated Worker.
- Private media responses use `Cache-Control: private, no-store`.
- The PWA service worker never caches `/api/*` or `/media/*`.
- Executable app HTML/JS/CSS is network-fresh so a deploy cannot leave a stale authenticated UI running indefinitely.
- No analytics or third-party trackers are present.
- Cloudflare Access JWTs are signature-validated by the Worker; an email header alone is never trusted.
- Exact authorized emails are checked a second time in the Worker through `ALLOWED_EMAILS`.

## Current implementation

### v0.4.0 production

The production Secure Vault is active on Cloudflare. v0.4.0 is deployed and its main Phase 1.5 gallery-management flows have been smoke-tested successfully in production.

Implemented and validated foundation:

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
- Persisted sorting by name, media type, duration and upload date.
- Authenticated rename/delete actions.
- Compensating D1/R2 delete flow.
- Expanded photo/video lightbox with previous/next navigation.
- NaughtyShare storage count/bytes summary from the D1 index.

### v0.5.0 candidate — Moments & Collections

The next release candidate moves NaughtyShare from a flat gallery toward a small private media library for two people.

Candidate features:

- **Google Photos import removed from the active product**; manual device upload is canonical.
- **Moments / Collections / Themes** as editable cards with name, type, date, description, icon and visual tone.
- Free naming such as `NuNu`, `LuLu`, `KuKu`, `PuPu`, or any other private theme.
- **Favorites** as an automatic collection.
- Per-media **captions** and optional moment date.
- Search by media name or caption.
- Add/remove a media item from multiple collections.
- Collection cards with optional authenticated media cover.
- Mobile horizontal collection strip with scroll snapping.
- Mobile swipe navigation in the expanded photo viewer.
- Multipart/resumable-style chunk upload path for media above the old 95 MB direct-upload limit, with a current NaughtyShare cap of 5 GB per file.
- Upload progress for large media.
- Organization metadata stored privately under an `app-data/` prefix in the existing R2 bucket; it is never exposed as gallery media.
- Media deletion performs best-effort cleanup of favorites/captions/collection membership metadata.
- Client bundle/cache hardening so new releases do not execute stale JS after deployment.

## Roadmap

### Phase 0 — Foundation
- [x] Initialize repository
- [x] Define privacy boundary
- [x] PWA shell + manifest
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
- [x] Second-user production smoke test with Trân

### Phase 1.5 — Gallery management & viewer **PRODUCTION SMOKE PASS**

#### Sorting and metadata
- [x] Sort by name / type / duration / date
- [x] Ascending / descending direction
- [x] Persist selected sort locally per device
- [ ] Persist/backfill video duration server-side

#### Rename and delete
- [x] Rename media item
- [x] Keep immutable R2 object key stable on rename
- [x] Delete media item with explicit confirmation
- [x] Compensating D1/R2 deletion
- [x] FR/VN success and failure states

#### Expanded viewer
- [x] Responsive photo/video modal
- [x] Native video controls, seek and fullscreen
- [x] Previous / next navigation
- [x] Close by button, backdrop and `Esc`
- [x] Viewer rename/delete actions
- [x] FR/VN viewer strings
- [ ] Optional card-to-viewer morph animation

#### Storage awareness
- [x] NaughtyShare storage counter
- [x] Media count + total bytes / MB / GB
- [ ] Configurable warning thresholds
- [ ] Optional admin-only account-wide R2 usage view

### Phase 2 — Moments, Collections & personal organization
- [x] Remove Google Photos Picker from active UI and Worker path
- [x] Editable **Moment / Collection / Theme** cards
- [x] Editable collection name, type, date, description, icon and visual tone
- [x] Automatic **Favorites** collection
- [x] Per-media favorite toggle
- [x] Per-media captions
- [x] Optional per-media moment date
- [x] Add/remove media from multiple collections
- [x] Search by media name or caption
- [x] Mobile horizontal collection cards
- [ ] Drag/reorder collections
- [ ] Choose/replace collection cover explicitly
- [ ] Bulk-select multiple media and assign them together
- [ ] Optional collection sharing/export summary without exposing media URLs

### Phase 3 — Mobile gallery polish
- [x] Swipe navigation for photos in viewer
- [ ] Swipe navigation that coexists safely with video controls
- [ ] Better mobile density/layout controls
- [ ] Optional masonry / compact view
- [ ] Faster thumbnail strategy for very large libraries
- [ ] Smarter date grouping in the main gallery
- [ ] Quick filters by type/date/favorite/collection

### Phase 4 — Large media
- [x] Multipart upload path above the 95 MB direct-upload threshold
- [x] Large-upload progress
- [x] Abort cleanup on failed client transfer
- [x] Final D1 insert only after R2 multipart completion
- [x] Size verification before indexing completed multipart media
- [ ] Resume an interrupted upload after app/browser restart
- [ ] Parallel part upload tuning on fast connections
- [ ] Large-video playback performance review
- [ ] Optional configurable maximum above the current 5 GB app limit

### Phase 5 — Hardening
- [x] Initial Content Security Policy
- [x] Never cache private API/media responses
- [x] Prevent stale executable PWA bundles after deploys
- [ ] Rate limiting
- [ ] Access audit events without sensitive media data
- [ ] Backup/restore strategy
- [ ] EXIF/location metadata policy
- [ ] Security review after Moments/Collections and large uploads are production-tested

## Google Photos decision

Google Photos Picker was prototyped and reached a successful small import, but its browser/session lifecycle proved too fragile for this two-person product compared with the already reliable manual device flow. The integration has therefore been **retired from the active product**. NaughtyShare does not depend on Google Photos to function.

Manual workflow:

1. Select media from the phone/device.
2. Upload directly into the private NaughtyShare vault.
3. Organize it inside NaughtyShare using Favorites, Moments, Collections and Themes.

## Repository policy

This repository contains **code and documentation only**. Do not add personal photos/videos, exports, `.env` files, `.dev.vars`, credentials, private keys or production database dumps.
