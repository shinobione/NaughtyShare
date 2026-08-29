# NaughtyShare — forward roadmap

This file extends the validated v0.9 / v1-candidate roadmap in `README.md` with the next product direction. The privacy rule remains unchanged: original media stays private, no media or secrets are committed to Git, and every server-side action remains behind NaughtyShare authentication.

## Phase 4.5 — Universal video playback — IN PROGRESS

Goal: make NaughtyShare video playback reliable on desktop, Android and iPhone before building synchronized viewing on top of it.

- [x] Strict authenticated HTTP byte-range delivery for `/media/:id`.
- [x] iPhone authenticated blob fallback as a transport-vs-codec diagnostic.
- [ ] Cloudflare Stream proof of concept for one existing video.
- [ ] Keep the original video unchanged in private R2; Stream is a playback derivative only.
- [ ] Require signed Stream playback URLs/tokens; never expose a permanent public Stream URL.
- [ ] First POC limited to videos <= 200 MB and <= 1 hour, using the Workers Stream binding direct-upload path.
- [ ] Production smoke on Trân's iPhone: open, play, seek, reopen.
- [ ] Confirm deletion cleanup so deleting the NaughtyShare original also deletes its Stream derivative.
- [ ] Decide derivative policy after the smoke: opt-in, automatic for new videos, or background preparation.
- [ ] Add TUS-based Stream preparation for videos > 200 MB if Stream becomes the canonical playback path.
- [ ] Retire the temporary iOS blob fallback after universal playback is proven.

## Phase 6 — NaughtyShare Together — PLANNED

Goal: turn the private gallery into a two-person synchronized watch room without sending the watched media through the call connection.

### Together Rooms

- [ ] `Regarder ensemble / Xem cùng nhau` entry point from the viewer.
- [ ] One Cloudflare Durable Object per active room.
- [ ] Authenticated WebSocket presence for the two allowed NaughtyShare users only.
- [ ] Authoritative room state: media ID, play/pause, target position, update timestamp and controller mode.
- [ ] Synchronize PLAY / PAUSE / SEEK / NEXT / PREVIOUS.
- [ ] Timestamp-aware sync so France/Vietnam latency does not shift playback start.
- [ ] Drift correction: ignore tiny drift, temporary playback-rate correction for small drift, seek for large drift.
- [ ] Buffer awareness and a clear `partner is catching up` state.
- [ ] Controller modes: Jerry controls / Trân controls / shared control.
- [ ] Room resume after a temporary network disconnect.

### NaughtyCall

- [ ] Separate WebRTC audio/video call from the watched media stream.
- [ ] Cloudflare Realtime/SFU integration for microphone and camera.
- [ ] Floating remote-camera tile over the NaughtyShare video.
- [ ] Draggable / resizable / hideable in-app PiP tile.
- [ ] Optional self-preview.
- [ ] Mute, camera toggle, audio-only mode and hang-up controls.
- [ ] Use system Picture in Picture where supported, with in-app PiP as the guaranteed fallback.
- [ ] No call recording by default.

### Couple polish

- [ ] One-tap private invitation to the currently authenticated partner.
- [ ] Presence (`online`, `in room`, `catching up`).
- [ ] Lightweight reactions such as ❤️ 🔥 😈 without interrupting playback.
- [ ] Rejoin the active Together session after app/PWA resume.
- [ ] Mobile-first layout for portrait and landscape iPhone use.

## Ordering rule

Do not start Together synchronization on top of an unreliable video player. Universal playback must pass on the iPhone first; then implement room synchronization; then add the call layer; then add cosmetic/reaction polish.
