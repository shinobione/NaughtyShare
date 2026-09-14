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

## Phase 6 — NaughtyShare Together — WINDOWS PRODUCTION SMOKE VALIDATED

Goal: turn the private gallery into a two-person synchronized watch room without sending the watched media through the later call connection.

### Together Rooms — production foundation validated

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
- [x] Hostname-based self-hosted Access application active for `naughtyshare.jerryquinet.workers.dev`, with the production `ACCESS_AUD` updated.
- [x] Production single-device smoke: ordinary video open/play/close stable after hotfix #34; Together joins successfully at `1/2`.
- [x] In-app Together invite/attention foundation: lightweight authenticated lobby socket, persistent short-lived invite, FR/VN popup, accept/decline, automatic opening of the invited video and automatic Together join.
- [x] Production two-device connection smoke: Jerry Windows ↔ Trân Windows reached `2/2` in production through the invite flow.
- [x] Production playback-sync smoke: bidirectional play → pause → seek works correctly, including leave/rejoin and presence cleanup.
- [ ] Synchronize NEXT / PREVIOUS as explicit room commands rather than relying on each device's local gallery sort/filter state.
- [ ] Controller modes: Jerry controls / Trân controls / shared control.
- [ ] Persist explicit Together intent across a fully killed/relaunched PWA session.
- [ ] System notification / Web Push when NaughtyShare is fully closed or not running.

### First production smoke with invite flow

1. [x] Both users authenticate normally on Windows; Trân can remain anywhere in NaughtyShare and does not need to find the same video.
2. [x] Jerry opens a working video and clicks `Regarder ensemble`.
3. [x] Trân receives the Together popup and clicks `Tham gia`.
4. [x] NaughtyShare opens the invited video automatically on Trân's device and joins Together automatically.
5. [x] Confirm `2/2` presence on both devices.
6. [x] Jerry tests play → pause → seek; Trân follows.
7. [x] Trân tests play → pause → seek; Jerry follows.
8. [x] Leave/rejoin once and confirm presence cleanup + reconnect.

## Phase 7 — NaughtyCall — MVP DEPLOYED / PRODUCTION SMOKE IN PROGRESS

Goal: add a private two-person audio/video call that stays completely separate from Together media playback. The watched NaughtyShare video still plays locally on each device; WebRTC carries only microphone/camera media.

### NaughtyCall P2P MVP

- [x] Dedicated authenticated `NaughtyCallRoom` Durable Object for call signaling; Together room and invite engines remain untouched.
- [x] Always-on authenticated signaling WebSocket while NaughtyShare is open.
- [x] Incoming call popup in FR/VN with accept/decline.
- [x] Outgoing `Appeler / Gọi` control in the global NaughtyShare top bar.
- [x] Browser WebRTC P2P audio/video with SDP + trickle ICE signaling through the Durable Object.
- [x] Cloudflare STUN (`stun.cloudflare.com:3478`) as the zero-config default.
- [x] Authenticated `/api/naughtycall/ice` endpoint prepared for optional short-lived Cloudflare TURN credentials via `TURN_KEY_ID` + `TURN_KEY_API_TOKEN`; STUN fallback remains automatic when TURN is not configured.
- [x] Floating remote-camera tile that sits independently over NaughtyShare / Together playback.
- [x] Local self-preview.
- [x] Mute, camera toggle, audio-only fallback and hang-up controls implemented.
- [x] No call recording.
- [x] Reliable browser media-permission preflight added before call setup, with audio-only fallback when camera acquisition fails.
- [x] Production security-header fix: `Permissions-Policy` now allows `camera=(self)` and `microphone=(self)` while keeping `geolocation=()` disabled; this removed the `NotAllowedError` / no-prompt failure.
- [x] Production Jerry Windows ↔ Trân Windows basic call smoke: call connects and both users can see and hear each other.
- [x] Draggable floating NaughtyCall overlay implemented with remembered position and viewport clamping.
- [x] Viewer top-layer integration implemented so NaughtyCall is re-parented into the modal media viewer instead of falling behind the `<dialog>`.
- [x] NaughtyShare-managed viewer fullscreen implemented so video + NaughtyCall can remain visible together; native video-only fullscreen is suppressed in Chromium and double-click routes to the managed fullscreen.
- [x] Floating-overlay/fullscreen polish deployed GREEN to production via PR #39.
- [x] Production floating-overlay smoke: during an active call, opening a NaughtyShare video keeps NaughtyCall visibly above the viewer.
- [x] Production drag smoke: after PR #40 global pointer tracking and PR #41 snapback fix, slow/normal dragging is smooth, position is stable, and the behavior is user-approved in production.
- [ ] Production control smoke: mute/unmute → camera off/on → hang-up on both sides.
- [ ] Production managed-fullscreen smoke: enter fullscreen, confirm NaughtyCall remains visible and draggable, exit fullscreen and confirm the call stays connected.
- [ ] Production combined smoke: NaughtyCall + Together at `2/2` simultaneously, with bidirectional play/pause/seek still working independently of the call.
- [ ] Add Cloudflare TURN production credentials only if the direct P2P smoke reveals NAT/firewall failures.
- [ ] Add resize / hide-collapse controls to the in-app floating tile if useful after real couple use.
- [ ] Use system Picture in Picture where supported, with in-app PiP as fallback.
- [ ] Optional call recovery after full page/PWA reload.
- [ ] Re-evaluate Cloudflare Realtime SFU only if future requirements go beyond the two-person P2P use case.

### NaughtyCall production smoke — resume later with Trân

Trân went to sleep after the first successful two-way audio/video call. Resume this smoke later; do not treat the remaining items as failed.

1. [x] Jerry and Trân both open NaughtyShare on Windows.
2. [x] Jerry clicks `Appeler`; camera/micro access succeeds after the production `Permissions-Policy` fix.
3. [x] Trân receives `NaughtyCall ❤️` and accepts.
4. [x] Confirm remote camera + two-way audio on both devices.
5. [ ] Test mute/unmute on both sides.
6. [ ] Test camera off/on on both sides; audio must continue while camera is off.
7. [x] Open a NaughtyShare video during the active call; NaughtyCall remains visible above the viewer.
8. [x] Drag the NaughtyCall tile slowly/continuously to another position and confirm it follows normally and the position remains stable.
9. [ ] Use the managed `⛶` viewer fullscreen; NaughtyCall must stay visible and draggable over the fullscreen viewer.
10. [ ] Exit fullscreen and close the viewer; the call must remain connected and return cleanly to the normal page overlay.
11. [ ] Start Together during the active call, reach `2/2`, and confirm bidirectional play/pause/seek still works while audio/video call remains live.
12. [ ] Hang up from each side once and confirm clean teardown.

## Phase 8 — couple polish

- [ ] One-tap private invitation to the authenticated partner when the app is closed, via system notification / Web Push.
- [ ] Presence (`online`, `in room`, `catching up`).
- [ ] Lightweight reactions such as ❤️ 🔥 😈 without interrupting playback.
- [ ] Rejoin the active Together session after app/PWA resume.
- [ ] Mobile-first polish for portrait/landscape while retaining desktop-first Together reliability.

## Ordering rule

**Finish NaughtyCall production smoke with Trân → validate managed fullscreen → validate NaughtyCall + Together simultaneous use → decide resize/hide/system-PiP polish → couple polish**, while iPhone universal playback proceeds in parallel and no longer blocks the main product roadmap.
