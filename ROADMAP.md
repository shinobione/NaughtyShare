# NaughtyShare — forward roadmap

This file extends the validated v0.9 / v1-candidate roadmap in `README.md` with the next product direction. The privacy rule remains unchanged: original media stays private, no media or secrets are committed to Git, and every server-side action remains behind NaughtyShare authentication.

## Phase 4.5 — Universal video playback — IN PROGRESS

Goal: make NaughtyShare video playback reliable on desktop, Android and iPhone before building synchronized viewing on top of it.

- [x] Strict authenticated HTTP byte-range delivery for `/media/:id`.
- [x] iPhone authenticated blob fallback as a transport-vs-codec diagnostic.
- [x] Cloudflare Media Transformations Workers-binding proof of concept creates a private H.264/AAC derivative for a short existing video.
- [x] Keep the original video unchanged in private R2; the compatibility MP4 is a private playback derivative only.
- [x] Store the optimized H.264/AAC MP4 under private R2 `app-data/`; never expose a permanent public media URL.
- [x] Serve the derivative through an authenticated NaughtyShare endpoint with strict GET/HEAD byte ranges.
- [x] First POC limited to a source smaller than 100 MB and a video no longer than 60 seconds, matching the current transformation output limit.
- [ ] Production smoke on Trân's iPhone: open, play, seek, close/reopen.
- [x] Confirm deletion cleanup so deleting the NaughtyShare original also deletes its compatibility derivative.
- [ ] Decide derivative policy after the smoke: opt-in, automatic for compatible new videos, or background preparation.
- [ ] If universal playback needs videos beyond the Media Transformations limits, re-evaluate paid Cloudflare Stream or another long-form transcoding path.
- [ ] Retire the temporary iOS blob fallback after universal playback is proven.

### POC implementation rule

The Media Transformations binding is deliberately isolated above the existing v1-compatible Worker. The R2 binding remains `env.MEDIA`; the transformation binding uses a separate `env.VIDEO_TRANSFORM` name so the private bucket binding is never shadowed. No Stream subscription, Stream video library, new API key or new D1 migration is required for this POC.

## Phase 6 — NaughtyShare Together — FOUNDATION IN PROGRESS

Goal: turn the private gallery into a two-person synchronized watch room without sending the watched media through the call connection.

The Together foundation is developed as a stacked branch/PR above the Universal Playback POC. It may compile and be reviewed before the iPhone smoke, but it must not replace the current production runtime until Universal Playback passes on Trân's iPhone.

### Together Rooms

- [x] `Regarder ensemble / Xem cùng nhau` entry point from the video viewer.
- [x] One Cloudflare Durable Object for the private shared room, using SQLite-backed Durable Object storage.
- [x] Authenticated same-origin WebSocket route, gated through the existing NaughtyShare Access/JWT chain before the Durable Object is reached.
- [x] WebSocket Hibernation API with serialized session identity and low-cost raw `ping`/`pong` support.
- [x] Presence based on unique authenticated participants (`1/2`, `2/2`) without exposing email addresses to the browser room protocol.
- [x] Authoritative room state: media ID, play/pause, target position, update timestamp, revision and shared controller mode.
- [x] Synchronize PLAY / PAUSE / SEEK for the currently viewed video.
- [x] Periodic state resync plus RTT estimation for France/Vietnam latency.
- [x] Drift correction foundation: ignore tiny drift, temporary `0.98/1.02` playback-rate correction for small drift, hard seek for larger drift.
- [x] Detect when the partner is on another media item and offer a local `Rejoindre / Xem cùng` action when that item is available in the rendered gallery.
- [ ] Synchronize NEXT / PREVIOUS as explicit room commands rather than relying on each device's local gallery sort/filter state.
- [x] Buffer awareness with per-participant transient state and a clear `partner is catching up` message; no forced global pause yet.
- [ ] Controller modes: Jerry controls / Trân controls / shared control.
- [x] Automatic WebSocket reconnect with bounded backoff after a temporary network disconnect, plus immediate reconnect attempts on network return and PWA/tab resume.
- [ ] Persist explicit room intent across a fully killed/relaunched PWA session.
- [ ] Invite/attention mechanism so the second participant does not need to discover the room manually.
- [ ] Production smoke with both authenticated devices after Universal Playback is validated.

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

Universal Playback must pass on the iPhone before a Together branch is allowed to become the production runtime. Development and CI for the room foundation can proceed in parallel; production activation remains gated. After room synchronization is stable, add the call layer, then reactions and cosmetic polish.
