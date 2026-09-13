# NaughtyShare — forward roadmap

This file extends the validated v0.9 / v1-candidate roadmap in `README.md` with the next product direction. The privacy rule remains unchanged: original media stays private, no media or secrets are committed to Git, and every server-side action remains behind NaughtyShare authentication.

## Phase 4.5 — Universal video playback — PARALLEL COMPATIBILITY TRACK

Goal: improve cross-device video compatibility without blocking the core couple experience.

- [x] Strict authenticated HTTP byte-range delivery for `/media/:id`.
- [x] iPhone authenticated blob fallback as a transport-vs-codec diagnostic.
- [x] Cloudflare Media Transformations POC creates a private H.264/AAC derivative for a short existing video.
- [x] Original video stays unchanged in private R2; compatibility MP4 is a private playback derivative only.
- [x] Compatibility derivative is stored privately under `app-data/` and served only through authenticated NaughtyShare endpoints.
- [x] Best-effort derivative cleanup when the original NaughtyShare media is deleted.
- [ ] Complete the iPhone production smoke: open, play, seek, close/reopen.
- [ ] Decide derivative policy: opt-in, automatic for compatible new videos, or background preparation.
- [ ] Re-evaluate paid Cloudflare Stream or another long-form transcoding path if needed for videos beyond Media Transformations limits.
- [ ] Retire the temporary iOS blob fallback after universal iPhone playback is proven.

### Priority rule

The iPhone issue is useful to solve but is **not a blocker for Together**. Trân may use Windows as her primary NaughtyShare device, so the first Together production target is Windows/desktop ↔ Windows/desktop. iPhone compatibility continues in parallel.

## Phase 6 — NaughtyShare Together — NEXT PRODUCTION SLICE

Goal: turn the private gallery into a two-person synchronized watch room without sending the watched media through the later call connection.

### Together Rooms — foundation implemented

- [x] `Regarder ensemble / Xem cùng nhau` entry point from the video viewer.
- [x] One Cloudflare Durable Object for the private shared room, using SQLite-backed Durable Object storage.
- [x] Authenticated same-origin WebSocket route, gated through the existing NaughtyShare Access/JWT chain before the Durable Object is reached.
- [x] WebSocket Hibernation API with serialized session identity and low-cost ping/pong support.
- [x] Presence based on unique authenticated participants (`1/2`, `2/2`) without exposing email addresses in the browser room protocol.
- [x] Authoritative room state: media ID, play/pause, target position, update timestamp, revision and shared controller mode.
- [x] Synchronize PLAY / PAUSE / SEEK for the currently viewed video.
- [x] Periodic state resync plus RTT estimation for France/Vietnam latency.
- [x] Drift correction foundation: ignore tiny drift, temporary `0.98/1.02` playback-rate correction for small drift, hard seek for larger drift.
- [x] Detect when the partner is on another media item and offer `Rejoindre / Xem cùng` when that item is visible locally.
- [x] Buffer awareness with per-participant transient state and a clear partner-catching-up state.
- [x] Automatic WebSocket reconnect with bounded backoff after a temporary network disconnect, plus immediate reconnect attempts on network return and tab/PWA resume.
- [ ] Production smoke: Jerry Windows ↔ Trân Windows.
- [ ] Synchronize NEXT / PREVIOUS as explicit room commands rather than relying on each device's local gallery sort/filter state.
- [ ] Controller modes: Jerry controls / Trân controls / shared control.
- [ ] Persist explicit Together intent across a fully killed/relaunched PWA session.
- [ ] Invite/attention mechanism so the second participant does not need to discover the room manually.

### First production smoke

1. Both users authenticate normally on Windows.
2. Open the same video on both devices.
3. Both join Together and confirm `2/2` presence.
4. Jerry tests play → pause → seek; Trân follows.
5. Trân tests play → pause → seek; Jerry follows.
6. Leave/rejoin once and confirm presence cleanup + reconnect.

## Phase 7 — NaughtyCall — AFTER TOGETHER SMOKE

- [ ] Separate WebRTC audio/video call from the watched media stream.
- [ ] Cloudflare Realtime/SFU integration for microphone and camera.
- [ ] Floating remote-camera tile over the NaughtyShare video.
- [ ] Draggable / resizable / hideable in-app PiP tile.
- [ ] Optional self-preview.
- [ ] Mute, camera toggle, audio-only mode and hang-up controls.
- [ ] Use system Picture in Picture where supported, with in-app PiP as fallback.
- [ ] No call recording by default.

## Phase 8 — couple polish

- [ ] One-tap private invitation to the authenticated partner.
- [ ] Presence (`online`, `in room`, `catching up`).
- [ ] Lightweight reactions such as ❤️ 🔥 😈 without interrupting playback.
- [ ] Rejoin the active Together session after app/PWA resume.
- [ ] Mobile-first polish for portrait/landscape while retaining desktop-first Together reliability.

## Ordering rule

**Together Rooms Windows smoke → NaughtyCall → couple polish**, while iPhone universal playback proceeds in parallel and no longer blocks the main product roadmap.
