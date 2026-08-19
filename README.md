# NaughtyShare

Private two-person PWA for securely sharing personal photos and videos.

> **Security rule:** media files, credentials and secrets must never be committed to this repository.

## Goal

NaughtyShare is a private gallery shared by two explicitly authorized users. It is designed as an installable, mobile-first PWA for photos and videos, with manual device upload as the canonical ingest path and private organization inside the app.

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
- `/api/*`, `/media/*` and derived `/thumbnail/*` assets are handled by the authenticated Worker.
- Private media and private derived previews use `Cache-Control: private, no-store`.
- The PWA service worker never caches `/api/*`, `/media/*` or `/thumbnail/*`.
- Executable app HTML/JS/CSS is network-fresh so a deploy cannot leave a stale authenticated UI running indefinitely.
- No analytics or third-party trackers are present.
- Cloudflare Access JWTs are signature-validated by the Worker; an email header alone is never trusted.
- Exact authorized emails are checked a second time in the Worker through `ALLOWED_EMAILS`.
- Manual photo rotation is metadata-only and never rewrites the original image bytes.
- Smart Moments use only trusted capture dates: EXIF, video-container metadata or a manually corrected capture date.
- v1 thumbnails are client-generated WebP derivatives stored privately under `app-data/`; they never replace the originals.

## Current production state

### v0.9.0 — PRODUCTION SMOKE PASS

NaughtyShare is active in production on Cloudflare. The secure vault, organization flows, Smart Moments and the v0.9 Timeline/Quick Filters path have been smoke-tested successfully.

Validated foundation and media flows:

- Cloudflare Worker backend.
- Cloudflare Access with Google authentication and exact two-user authorization.
- Worker-side Access JWT signature/AUD/issuer validation through `jose`.
- Second exact-email allowlist in the Worker.
- Private R2 media storage binding (`naughtyshare-media`).
- D1 canonical media metadata index.
- Authenticated image/video streaming with byte-range support and video seek.
- Direct device upload up to 95 MB per file.
- Multipart upload path above 95 MB, with a current app cap of 5 GB/file.
- Upload progress and abort cleanup for the pre-v1 large-transfer path.
- R2 rollback when final D1 indexing fails.
- Persistent FR/VN interface switch.
- Sorting by name, type, duration, upload date and real capture date.
- Real photo capture dates from EXIF and video dates from MP4/MOV container metadata.
- Manual capture-date correction when embedded metadata is absent or wrong.
- Non-destructive photo rotation by 90° steps.
- Authenticated rename/delete with compensating D1/R2 behavior.
- Expanded photo/video viewer with previous/next navigation and mobile photo swipe.
- Viewer navigation constrained to the currently visible filtered set.
- NaughtyShare media count and indexed storage total.

Validated organization and gallery flows:

- Editable **Moments / Collections / Themes** with free names, date, description, icon and visual tone.
- Automatic **Favorites** collection.
- Per-media favorites, captions and optional moment date.
- Add/remove media from multiple collections.
- Search by media name or caption.
- Explicit collection cover selection with authenticated media.
- Persistent custom collection ordering.
- Active-Moment presentation with cover, metadata and quick actions.
- Bulk-select visible media and assign them to one or several cards.
- Bulk-remove media from the currently active custom collection without deleting the underlying media.
- Persistent gallery display modes: **Comfort / Masonry / Compact**.
- **Smart Moments** generated from trusted capture dates only.
- Same-day suggestions from 2+ media and short 2–3 day suggestions from 4+ media.
- One-click Smart Moment creation with automatic membership assignment and rollback on failure.
- Chronological **month → day** navigation based on capture dates.
- Quick filters for **All / Photos / Videos / Favorites / Dated / Undated** plus custom Collection.
- Timeline filters combine with search and active Moment filters rather than replacing them.
- Viewer previous/next and keyboard navigation stay inside the final visible set.

## v1.0.0 candidate — stability & mobile milestone

The v1 candidate is intentionally reliability-focused rather than a visual rewrite. It builds on the validated v0.9 product without changing the privacy model or media originals.

Candidate additions:

- **Restart-resumable large uploads**: current multipart session and completed part ETags persist locally; after a reload the user re-selects the same file and only missing parts are sent.
- **Wrong-file protection** through a SHA-256 edge fingerprint using file metadata plus bounded first/last chunks.
- **Parallel multipart upload** tuned conservatively from 1–3 concurrent parts based on connection hints.
- **Ambiguous-completion reconciliation**: if the final response is lost after D1/R2 commit, the client rereads `/api/media` and clears the stale pending session instead of re-uploading.
- Explicit **Resume / Abandon** controls for interrupted large uploads.
- Existing EXIF/video capture-date extraction retained for v1-owned uploads.
- **Safe video edge-swipe**: viewer navigation only starts from the left/right edge and above the native video-control band.
- **Private WebP previews** generated client-side, stored under private R2 `app-data/`, authenticated on read, and never service-worker cached.
- Lazy near-viewport preview work and `content-visibility` for Comfort/Compact while preserving exact Masonry measurement.
- **Persisted derived video duration** metadata reused for duration display/sort without modifying the media bytes.
- Explicit **metadata/organization JSON backup** for collections, memberships, favorites, captions, capture dates, rotations and Moment UI preferences.
- Merge-safe JSON restore only for media IDs still present in the vault; restore never deletes media.
- Backup JSON intentionally contains **no photo/video bytes** and may contain private names/captions, so export is explicit and user-controlled.
- No new secret and no D1 migration.

v1 remains a **candidate until production deployment and smoke tests pass**.

## Release history

- **v0.4.0** — gallery management, storage counter, rename/delete, expanded viewer.
- **v0.5.0** — Moments/Collections/Themes, favorites, captions, search, large multipart upload.
- **v0.5.1** — real capture dates, capture-date scan/backfill and non-destructive photo rotation.
- **v0.6.0** — explicit covers, persistent card ordering and polished Moment presentation.
- **v0.7.0** — bulk selection plus Comfort/Masonry/Compact gallery modes.
- **v0.7.1** — capture-sorted viewer navigation stays inside the visible collection/search result.
- **v0.8.0** — Smart Moments from trusted capture dates.
- **v0.9.0** — Timeline month/day navigation, quick filters and generic filtered-viewer guard.
- **v1.0.0 candidate** — restart-resumable multipart, private previews, persisted derived duration, safe video edge-swipe and metadata backup/restore.

## Roadmap

### Phase 0 — Foundation — DONE
- [x] Initialize repository
- [x] Define privacy boundary
- [x] PWA shell + manifest
- [x] Private API skeleton

### Phase 1 — Secure vault — PRODUCTION SMOKE PASS
- [x] Cloudflare Access JWT verification in Worker
- [x] Second exact-email allowlist in Worker
- [x] Private R2 object storage binding
- [x] D1 media metadata index
- [x] Authenticated photo/video streaming
- [x] Upload from device up to 95 MB per file
- [x] Production photo upload/read smoke
- [x] Production video playback + seek smoke
- [x] Second-user production smoke
- [x] Google authentication through Cloudflare Access

### Phase 1.5 — Gallery management & viewer — PRODUCTION SMOKE PASS
- [x] Sort by name / type / duration / upload date
- [x] Ascending / descending direction
- [x] Persist selected sort locally per device
- [x] Authenticated rename/delete
- [x] Compensating D1/R2 deletion
- [x] Responsive photo/video modal
- [x] Native video controls, seek and fullscreen
- [x] Previous / next navigation
- [x] Viewer rename/delete actions
- [x] FR/VN viewer strings
- [x] NaughtyShare storage counter
- [x] Persist reusable derived video duration metadata **v1 candidate**
- [ ] Optional card-to-viewer morph animation
- [ ] Configurable storage warning thresholds
- [ ] Optional admin-only account-wide R2 usage view

### Phase 2 — Moments, Collections & personal organization — PRODUCTION SMOKE PASS
- [x] Manual device upload is canonical; Google Photos Picker retired from active product
- [x] Editable Moment / Collection / Theme cards
- [x] Editable name, type, date, description, icon and visual tone
- [x] Automatic Favorites collection
- [x] Per-media favorite toggle and captions
- [x] Optional per-media moment date
- [x] Add/remove media from multiple collections
- [x] Search by media name or caption
- [x] Mobile horizontal collection cards
- [x] Explicit collection cover selection
- [x] Persistent collection ordering
- [x] Bulk-select and assign multiple media together
- [ ] Optional collection sharing/export summary without exposing media URLs

### Phase 2.5 — Capture intelligence — PRODUCTION SMOKE PASS
- [x] EXIF photo capture-date extraction
- [x] MP4/MOV container creation-date extraction
- [x] Manual capture-date correction
- [x] Existing-library capture-date scan/backfill
- [x] Sort by capture date
- [x] Non-destructive photo rotation
- [x] Viewer order guard for capture sort + active filters

### Phase 3 — Mobile gallery polish — v0.9 PASS / v1 CANDIDATE
- [x] Swipe navigation for photos in viewer
- [x] Better mobile density/layout controls
- [x] Masonry and Compact gallery modes
- [x] Bulk selection with touch-friendly controls
- [x] Chronological month/day navigation
- [x] Quick filters by type/date/favorite/collection
- [x] Safe video edge-swipe that avoids the native-control band **v1 candidate**
- [x] Private derived thumbnail strategy for larger libraries **v1 candidate**

### Phase 3.5 — Smart organization — PRODUCTION SMOKE PASS
- [x] Smart same-day grouping from trusted capture dates
- [x] Smart short-period grouping across 2–3 consecutive days
- [x] One-click real Moment creation
- [x] Automatic membership assignment
- [x] Roll back a newly created Smart Moment if assignment fails
- [x] FR/VN Smart Moments UI

### Phase 4 — Large media — v1 CANDIDATE
- [x] Multipart upload above the 95 MB direct-upload threshold
- [x] Large-upload progress
- [x] Final D1 insert only after R2 multipart completion
- [x] Size verification before indexing completed multipart media
- [x] Resume an interrupted upload after app/browser restart **v1 candidate**
- [x] Parallel part upload tuning on fast connections **v1 candidate**
- [x] Preserve a recoverable session across network failure instead of immediately aborting **v1 candidate**
- [x] Ambiguous completion reread before any re-upload **v1 candidate**
- [ ] Full large-video playback/performance soak on multiple devices
- [ ] Optional configurable maximum above the current 5 GB app limit

### Phase 5 — Hardening — PARTIAL / v1 CANDIDATE
- [x] Initial Content Security Policy
- [x] Never cache private API/media responses
- [x] Prevent stale executable PWA bundles after deploys
- [x] Never cache derived private thumbnails **v1 candidate**
- [x] Explicit metadata/organization export + merge restore **v1 candidate**
- [ ] Full media-byte disaster backup/restore strategy
- [ ] Rate limiting
- [ ] Access audit events without sensitive media data
- [ ] EXIF/location metadata policy
- [ ] Security review after v1 organization, preview and resumed-upload flows are production-tested

## After v1

The intentionally deferred work is now narrower:

- full disaster recovery that includes original media bytes, not only metadata;
- configurable storage warnings / optional account-wide R2 visibility;
- rate limiting and privacy-preserving audit events;
- longer large-video playback soak and optional >5 GB product limit;
- optional cosmetic transitions such as card-to-viewer morphing.

## Google Photos decision

Google Photos Picker was prototyped and reached a successful small import, but its browser/session lifecycle proved too fragile for this two-person product compared with the reliable manual device flow. The integration is therefore **retired from the active product**. NaughtyShare does not depend on Google Photos to function.

Manual workflow:

1. Select media from the phone/device.
2. Upload directly into the private NaughtyShare vault.
3. Organize it inside NaughtyShare using Favorites, Moments, Collections, Themes, Smart Moments and Timeline filters.

## Repository policy

This repository contains **code and documentation only**. Do not add personal photos/videos, exports, `.env` files, `.dev.vars`, credentials, private keys or production database dumps.
