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

## Target architecture

```text
Google Photos
    |
    | explicit Picker selection
    v
NaughtyShare PWA
    |
    | authenticated import / API
    v
Private API / edge backend
    |-- private object storage: original photos + videos
    |-- metadata store: media index, captions, timestamps
    `-- authorization: exactly the allowed users
```

### Frontend

- Installable PWA
- Mobile-first gallery
- Photo viewer
- Video player
- Upload/import screen
- Favorites / captions later
- No secret embedded in client JavaScript

### Backend

Recommended deployment target: Cloudflare Worker + private R2 bucket, with application access restricted to the two approved identities. The repository remains source code only.

## Security requirements

- Deny access by default.
- Only explicitly allow the two intended identities.
- Never expose the R2/object-storage bucket publicly.
- Never store permanent public media URLs.
- Serve media only after authorization.
- Prefer same-origin API/media delivery.
- Strip unnecessary location metadata on import where practical.
- No analytics or third-party trackers on private gallery pages.
- No media content in Git history, Actions artifacts, logs or screenshots.
- OAuth tokens are transient and must never be persisted in logs or the repository.
- Secrets are environment/deployment secrets, never source-controlled values.

## Planned phases

### Phase 0 — Foundation
- [x] Initialize repository
- [x] Define privacy boundary
- [x] Document Google Photos Locked Folder limitation
- [x] PWA shell + manifest + offline app shell
- [ ] Private API skeleton

### Phase 1 — Secure vault
- [ ] Two-user authentication/authorization
- [ ] Private object storage
- [ ] Media metadata index
- [ ] Authenticated photo/video streaming
- [ ] Upload from device

### Phase 2 — Google Photos import
- [ ] Google OAuth configuration
- [ ] Google Photos Picker session flow
- [ ] Copy selected photos/videos into private storage
- [ ] Import progress + failure recovery

### Phase 3 — Gallery UX
- [ ] Responsive masonry/grid gallery
- [ ] Fullscreen photo viewer
- [ ] Video playback
- [ ] Favorites
- [ ] Captions
- [ ] Search/filter by type/date

### Phase 4 — Hardening
- [ ] Content Security Policy
- [ ] Rate limiting
- [ ] Access audit events without sensitive media data
- [ ] Backup/restore strategy
- [ ] Security review

## Current implementation

The `feat/pwa-foundation` branch contains the first mobile-first PWA shell. Import controls intentionally remain disabled until an authenticated private backend is connected. The service worker caches only the application shell and explicitly excludes `/api/*` and `/media/*` from offline caching.

## Repository policy

This repository contains **code and documentation only**. Do not add personal photos/videos, exports from Google Photos, `.env` files, OAuth credentials, service-account files, private keys or production database dumps.
