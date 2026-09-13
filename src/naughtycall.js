import './naughtycall.css';

const ROOM = 'shared';
const PING_INTERVAL_MS = 20000;
const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 12000];
const FALLBACK_ICE_SERVERS = [{ urls: ['stun:stun.cloudflare.com:3478'] }];

const copy = {
  fr: {
    call: 'Appeler',
    calling: 'Appel…',
    inCall: 'En appel',
    incomingTitle: 'NaughtyCall ❤️',
    incomingBody: 'Ton partenaire t’appelle.',
    accept: 'Accepter',
    decline: 'Refuser',
    requestingMedia: 'Autorisation caméra et micro…',
    waiting: 'Appel en attente…',
    connecting: 'Connexion de l’appel…',
    connected: 'NaughtyCall connecté',
    disconnected: 'Connexion instable…',
    failed: 'Connexion WebRTC impossible.',
    mediaFailed: 'Impossible d’accéder à la caméra ou au micro.',
    signalFailed: 'Connexion NaughtyCall indisponible.',
    declined: 'Appel refusé.',
    ended: 'Appel terminé.',
    enableSound: 'Clique la vidéo pour activer le son.',
    mute: 'Couper micro',
    unmute: 'Réactiver micro',
    cameraOff: 'Couper caméra',
    cameraOn: 'Réactiver caméra',
    hangup: 'Raccrocher',
    audioOnly: 'Mode audio uniquement',
  },
  vi: {
    call: 'Gọi',
    calling: 'Đang gọi…',
    inCall: 'Đang gọi',
    incomingTitle: 'NaughtyCall ❤️',
    incomingBody: 'Người ấy đang gọi cho bạn.',
    accept: 'Chấp nhận',
    decline: 'Từ chối',
    requestingMedia: 'Đang xin quyền camera và micro…',
    waiting: 'Đang chờ trả lời…',
    connecting: 'Đang kết nối cuộc gọi…',
    connected: 'NaughtyCall đã kết nối',
    disconnected: 'Kết nối không ổn định…',
    failed: 'Không thể kết nối WebRTC.',
    mediaFailed: 'Không thể truy cập camera hoặc micro.',
    signalFailed: 'Kết nối NaughtyCall không khả dụng.',
    declined: 'Cuộc gọi bị từ chối.',
    ended: 'Cuộc gọi đã kết thúc.',
    enableSound: 'Bấm vào video để bật âm thanh.',
    mute: 'Tắt micro',
    unmute: 'Bật micro',
    cameraOff: 'Tắt camera',
    cameraOn: 'Bật camera',
    hangup: 'Kết thúc',
    audioOnly: 'Chỉ âm thanh',
  },
};

let socket = null;
let participantId = null;
let reconnectTimer = null;
let reconnectAttempt = 0;
let pingTimer = null;
let presence = { participantCount: 0, sessionCount: 0 };
let currentCall = null;
let localStream = null;
let remoteStream = null;
let peer = null;
let pendingIce = [];
let iceServers = FALLBACK_ICE_SERVERS;
let iceLoaded = false;
let failTimer = null;

function lang() {
  return document.documentElement.lang?.toLowerCase().startsWith('vi') ? 'vi' : 'fr';
}

function tr(key) {
  return copy[lang()][key];
}

function send(payload) {
  if (socket?.readyState !== WebSocket.OPEN) return false;
  socket.send(JSON.stringify(payload));
  return true;
}

function socketUrl() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = new URL(`${protocol}//${location.host}/api/naughtycall/ws`);
  url.searchParams.set('room', ROOM);
  return url.toString();
}

function ensureUi() {
  let callButton = document.querySelector('#naughtycall-start');
  if (!callButton) {
    const tools = document.querySelector('.topbar-tools');
    if (tools) {
      callButton = document.createElement('button');
      callButton.type = 'button';
      callButton.id = 'naughtycall-start';
      callButton.className = 'naughtycall-start';
      callButton.innerHTML = '<span aria-hidden="true">◉</span><b></b>';
      callButton.addEventListener('click', startOutgoingCall);
      tools.prepend(callButton);
    }
  }

  if (!document.querySelector('#naughtycall-incoming')) {
    const overlay = document.createElement('div');
    overlay.id = 'naughtycall-incoming';
    overlay.className = 'naughtycall-incoming';
    overlay.hidden = true;
    overlay.innerHTML = `
      <section class="naughtycall-incoming-card" role="dialog" aria-modal="true" aria-labelledby="naughtycall-incoming-title">
        <div class="naughtycall-avatar" aria-hidden="true">♥</div>
        <h2 id="naughtycall-incoming-title"></h2>
        <p id="naughtycall-incoming-body"></p>
        <div class="naughtycall-incoming-actions">
          <button type="button" class="naughtycall-decline" id="naughtycall-decline"></button>
          <button type="button" class="naughtycall-accept" id="naughtycall-accept"></button>
        </div>
      </section>
    `;
    document.body.append(overlay);
    overlay.querySelector('#naughtycall-accept')?.addEventListener('click', acceptIncomingCall);
    overlay.querySelector('#naughtycall-decline')?.addEventListener('click', declineIncomingCall);
  }

  if (!document.querySelector('#naughtycall-shell')) {
    const shell = document.createElement('aside');
    shell.id = 'naughtycall-shell';
    shell.className = 'naughtycall-shell';
    shell.hidden = true;
    shell.innerHTML = `
      <div class="naughtycall-video-wrap">
        <video id="naughtycall-remote" class="naughtycall-remote" autoplay playsinline></video>
        <div class="naughtycall-audio-placeholder" id="naughtycall-audio-placeholder" hidden>
          <span>♥</span>
          <b id="naughtycall-audio-label"></b>
        </div>
        <video id="naughtycall-local" class="naughtycall-local" autoplay playsinline muted></video>
        <div class="naughtycall-status" id="naughtycall-status"></div>
      </div>
      <div class="naughtycall-controls">
        <button type="button" id="naughtycall-mute" class="naughtycall-control" aria-pressed="false"><span>🎙</span></button>
        <button type="button" id="naughtycall-camera" class="naughtycall-control" aria-pressed="false"><span>📹</span></button>
        <button type="button" id="naughtycall-hangup" class="naughtycall-control naughtycall-hangup"><span>☎</span></button>
      </div>
    `;
    document.body.append(shell);
    shell.querySelector('#naughtycall-mute')?.addEventListener('click', toggleMute);
    shell.querySelector('#naughtycall-camera')?.addEventListener('click', toggleCamera);
    shell.querySelector('#naughtycall-hangup')?.addEventListener('click', hangup);
    shell.querySelector('#naughtycall-remote')?.addEventListener('click', () => {
      shell.querySelector('#naughtycall-remote')?.play().catch(() => {});
    });
  }

  renderCopy();
  return callButton;
}

function renderCopy() {
  const callButton = document.querySelector('#naughtycall-start');
  if (callButton) {
    const label = currentCall ? (currentCall.status === 'ringing' ? tr('calling') : tr('inCall')) : tr('call');
    const b = callButton.querySelector('b');
    if (b && b.textContent !== label) b.textContent = label;
    callButton.disabled = Boolean(currentCall) || !navigator.mediaDevices?.getUserMedia;
  }

  const incoming = document.querySelector('#naughtycall-incoming');
  if (incoming) {
    incoming.querySelector('#naughtycall-incoming-title').textContent = tr('incomingTitle');
    incoming.querySelector('#naughtycall-incoming-body').textContent = tr('incomingBody');
    incoming.querySelector('#naughtycall-accept').textContent = tr('accept');
    incoming.querySelector('#naughtycall-decline').textContent = tr('decline');
  }

  const mute = document.querySelector('#naughtycall-mute');
  const camera = document.querySelector('#naughtycall-camera');
  const hangupButton = document.querySelector('#naughtycall-hangup');
  const muted = Boolean(localStream?.getAudioTracks().length) && localStream.getAudioTracks().every((track) => !track.enabled);
  const cameraOff = Boolean(localStream?.getVideoTracks().length) && localStream.getVideoTracks().every((track) => !track.enabled);
  if (mute) {
    mute.title = muted ? tr('unmute') : tr('mute');
    mute.setAttribute('aria-label', mute.title);
    mute.setAttribute('aria-pressed', String(muted));
  }
  if (camera) {
    camera.title = cameraOff ? tr('cameraOn') : tr('cameraOff');
    camera.setAttribute('aria-label', camera.title);
    camera.setAttribute('aria-pressed', String(cameraOff));
    camera.disabled = !localStream?.getVideoTracks().length;
  }
  if (hangupButton) {
    hangupButton.title = tr('hangup');
    hangupButton.setAttribute('aria-label', tr('hangup'));
  }
  const audioLabel = document.querySelector('#naughtycall-audio-label');
  if (audioLabel) audioLabel.textContent = tr('audioOnly');
}

function setCallStatus(message) {
  const status = document.querySelector('#naughtycall-status');
  if (status && status.textContent !== message) status.textContent = message;
}

function showShell(message) {
  ensureUi();
  const shell = document.querySelector('#naughtycall-shell');
  if (shell) shell.hidden = false;
  setCallStatus(message);
  updateVideoPresentation();
}

function hideShell() {
  const shell = document.querySelector('#naughtycall-shell');
  if (shell) shell.hidden = true;
}

function showIncoming(call) {
  if (!call?.id || currentCall) return;
  currentCall = { id: call.id, role: 'callee', status: 'ringing' };
  ensureUi();
  const overlay = document.querySelector('#naughtycall-incoming');
  if (overlay) overlay.hidden = false;
  renderCopy();
  window.setTimeout(() => document.querySelector('#naughtycall-accept')?.focus(), 0);
}

function hideIncoming() {
  const overlay = document.querySelector('#naughtycall-incoming');
  if (overlay) overlay.hidden = true;
}

async function loadIceServers() {
  if (iceLoaded) return iceServers;
  iceLoaded = true;
  try {
    const response = await fetch('/api/naughtycall/ice', {
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (Array.isArray(data?.iceServers) && data.iceServers.length) iceServers = data.iceServers;
  } catch {
    iceServers = FALLBACK_ICE_SERVERS;
  }
  return iceServers;
}

async function requestLocalMedia() {
  if (localStream?.getTracks().some((track) => track.readyState === 'live')) return localStream;

  const audio = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  };

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio, video: { facingMode: 'user' } });
  } catch {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio, video: false });
    } catch {
      throw new Error(tr('mediaFailed'));
    }
  }

  const localVideo = document.querySelector('#naughtycall-local');
  if (localVideo) {
    localVideo.srcObject = localStream;
    localVideo.play().catch(() => {});
  }
  renderCopy();
  updateVideoPresentation();
  return localStream;
}

function stopLocalMedia() {
  if (localStream) {
    for (const track of localStream.getTracks()) track.stop();
  }
  localStream = null;
  const localVideo = document.querySelector('#naughtycall-local');
  if (localVideo) localVideo.srcObject = null;
}

function updateVideoPresentation() {
  const placeholder = document.querySelector('#naughtycall-audio-placeholder');
  const remoteVideo = document.querySelector('#naughtycall-remote');
  const hasRemoteVideo = Boolean(remoteStream?.getVideoTracks().some((track) => track.readyState === 'live'));
  if (placeholder) placeholder.hidden = hasRemoteVideo;
  if (remoteVideo) remoteVideo.hidden = !hasRemoteVideo;
}

function cleanupPeer() {
  if (failTimer) clearTimeout(failTimer);
  failTimer = null;
  pendingIce = [];
  if (peer) {
    peer.onicecandidate = null;
    peer.ontrack = null;
    peer.onconnectionstatechange = null;
    try { peer.close(); } catch { /* no-op */ }
  }
  peer = null;
  remoteStream = null;
  const remoteVideo = document.querySelector('#naughtycall-remote');
  if (remoteVideo) remoteVideo.srcObject = null;
  updateVideoPresentation();
}

async function ensurePeer() {
  if (peer) return peer;
  const servers = await loadIceServers();
  peer = new RTCPeerConnection({ iceServers: servers });
  remoteStream = new MediaStream();

  if (localStream) {
    for (const track of localStream.getTracks()) peer.addTrack(track, localStream);
  }

  peer.addEventListener('icecandidate', (event) => {
    if (!event.candidate || !currentCall?.id) return;
    send({ type: 'ICE', callId: currentCall.id, candidate: event.candidate.toJSON?.() || event.candidate });
  });

  peer.addEventListener('track', (event) => {
    const incomingStream = event.streams?.[0];
    if (incomingStream) {
      remoteStream = incomingStream;
    } else if (event.track && !remoteStream.getTracks().includes(event.track)) {
      remoteStream.addTrack(event.track);
    }
    const remoteVideo = document.querySelector('#naughtycall-remote');
    if (remoteVideo) {
      remoteVideo.srcObject = remoteStream;
      remoteVideo.play().catch(() => setCallStatus(tr('enableSound')));
    }
    updateVideoPresentation();
  });

  peer.addEventListener('connectionstatechange', () => {
    if (!peer) return;
    if (peer.connectionState === 'connected') {
      if (currentCall) currentCall.status = 'active';
      setCallStatus(tr('connected'));
      renderCopy();
      if (failTimer) clearTimeout(failTimer);
      failTimer = null;
    } else if (peer.connectionState === 'disconnected') {
      setCallStatus(tr('disconnected'));
    } else if (peer.connectionState === 'failed') {
      setCallStatus(tr('failed'));
      if (failTimer) clearTimeout(failTimer);
      failTimer = window.setTimeout(() => endLocally(), 5000);
    } else if (peer.connectionState === 'connecting') {
      setCallStatus(tr('connecting'));
    }
  });

  return peer;
}

async function flushPendingIce() {
  if (!peer?.remoteDescription) return;
  const queue = pendingIce;
  pendingIce = [];
  for (const candidate of queue) {
    try { await peer.addIceCandidate(candidate); } catch { /* stale candidate */ }
  }
}

async function createOffer() {
  const pc = await ensurePeer();
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  send({
    type: 'OFFER',
    callId: currentCall.id,
    description: { type: pc.localDescription.type, sdp: pc.localDescription.sdp },
  });
}

async function handleOffer(message) {
  if (!currentCall || message.callId !== currentCall.id) return;
  const pc = await ensurePeer();
  await pc.setRemoteDescription(message.description);
  await flushPendingIce();
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  send({
    type: 'ANSWER',
    callId: currentCall.id,
    description: { type: pc.localDescription.type, sdp: pc.localDescription.sdp },
  });
}

async function handleAnswer(message) {
  if (!currentCall || message.callId !== currentCall.id || !peer) return;
  await peer.setRemoteDescription(message.description);
  await flushPendingIce();
}

async function handleIce(message) {
  if (!currentCall || message.callId !== currentCall.id || !message.candidate) return;
  if (!peer?.remoteDescription) {
    pendingIce.push(message.candidate);
    return;
  }
  try { await peer.addIceCandidate(message.candidate); } catch { /* ignore stale candidate */ }
}

async function startOutgoingCall() {
  if (currentCall) return;
  if (socket?.readyState !== WebSocket.OPEN) {
    showShell(tr('signalFailed'));
    window.setTimeout(() => { if (!currentCall) hideShell(); }, 2200);
    return;
  }

  ensureUi();
  showShell(tr('requestingMedia'));
  try {
    await requestLocalMedia();
  } catch {
    setCallStatus(tr('mediaFailed'));
    window.setTimeout(() => { if (!currentCall) hideShell(); }, 2500);
    stopLocalMedia();
    return;
  }

  currentCall = { id: null, role: 'caller', status: 'ringing' };
  renderCopy();
  setCallStatus(tr('waiting'));
  if (!send({ type: 'CALL' })) {
    currentCall = null;
    setCallStatus(tr('signalFailed'));
    stopLocalMedia();
    renderCopy();
  }
}

async function acceptIncomingCall() {
  if (!currentCall?.id || currentCall.role !== 'callee') return;
  hideIncoming();
  showShell(tr('requestingMedia'));
  try {
    await requestLocalMedia();
  } catch {
    send({ type: 'DECLINE', callId: currentCall.id });
    setCallStatus(tr('mediaFailed'));
    currentCall = null;
    stopLocalMedia();
    renderCopy();
    window.setTimeout(hideShell, 2500);
    return;
  }
  currentCall.status = 'connecting';
  setCallStatus(tr('connecting'));
  renderCopy();
  send({ type: 'ACCEPT', callId: currentCall.id });
}

function declineIncomingCall() {
  if (!currentCall?.id || currentCall.role !== 'callee') return;
  send({ type: 'DECLINE', callId: currentCall.id });
  hideIncoming();
  currentCall = null;
  renderCopy();
}

function endLocally(message = null) {
  hideIncoming();
  cleanupPeer();
  stopLocalMedia();
  currentCall = null;
  renderCopy();
  if (message) {
    showShell(message);
    window.setTimeout(() => { if (!currentCall) hideShell(); }, 1800);
  } else {
    hideShell();
  }
}

function hangup() {
  if (currentCall?.id) {
    const type = currentCall.status === 'ringing' && currentCall.role === 'caller' ? 'CANCEL' : 'HANGUP';
    send({ type, callId: currentCall.id });
  }
  endLocally();
}

function toggleMute() {
  const tracks = localStream?.getAudioTracks() || [];
  if (!tracks.length) return;
  const enable = tracks.every((track) => !track.enabled);
  for (const track of tracks) track.enabled = enable;
  renderCopy();
}

function toggleCamera() {
  const tracks = localStream?.getVideoTracks() || [];
  if (!tracks.length) return;
  const enable = tracks.every((track) => !track.enabled);
  for (const track of tracks) track.enabled = enable;
  renderCopy();
}

function handleMessage(event) {
  if (event.data === 'pong') return;
  let message;
  try {
    message = JSON.parse(String(event.data || ''));
  } catch {
    return;
  }

  if (message.type === 'WELCOME') {
    participantId = message.participantId || null;
    presence = message.presence || presence;
    if (message.incomingCall) showIncoming(message.incomingCall);
    return;
  }

  if (message.type === 'PRESENCE') {
    presence = message;
    return;
  }

  if (message.type === 'CALLING') {
    if (currentCall?.role === 'caller') {
      currentCall.id = message.call?.id || currentCall.id;
      currentCall.status = 'ringing';
      setCallStatus(tr('waiting'));
      renderCopy();
    }
    return;
  }

  if (message.type === 'INCOMING_CALL') {
    showIncoming(message.call);
    return;
  }

  if (message.type === 'CALL_ACCEPTED') {
    if (!currentCall || message.call?.id !== currentCall.id) return;
    hideIncoming();
    currentCall.status = 'connecting';
    showShell(tr('connecting'));
    renderCopy();
    if (currentCall.role === 'caller') {
      createOffer().catch(() => {
        setCallStatus(tr('failed'));
        window.setTimeout(() => hangup(), 1800);
      });
    }
    return;
  }

  if (message.type === 'CALL_DECLINED') {
    if (!currentCall || message.callId !== currentCall.id) return;
    endLocally(tr('declined'));
    return;
  }

  if (message.type === 'CALL_ENDED') {
    if (!currentCall || message.callId !== currentCall.id) return;
    endLocally(tr('ended'));
    return;
  }

  if (message.type === 'OFFER') {
    handleOffer(message).catch(() => {
      setCallStatus(tr('failed'));
      window.setTimeout(() => hangup(), 1800);
    });
    return;
  }

  if (message.type === 'ANSWER') {
    handleAnswer(message).catch(() => {
      setCallStatus(tr('failed'));
      window.setTimeout(() => hangup(), 1800);
    });
    return;
  }

  if (message.type === 'ICE') {
    handleIce(message);
    return;
  }

  if (message.type === 'ERROR') {
    if (message.code === 'CALL_BUSY') {
      endLocally(message.message || tr('signalFailed'));
    }
  }
}

function stopPing() {
  if (pingTimer) clearInterval(pingTimer);
  pingTimer = null;
}

function startPing() {
  stopPing();
  pingTimer = window.setInterval(() => send({ type: 'PING', clientTimeMs: Date.now() }), PING_INTERVAL_MS);
}

function clearReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
}

function scheduleReconnect(immediate = false) {
  if (socket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(socket.readyState)) return;
  clearReconnect();
  const delay = immediate ? 0 : RECONNECT_DELAYS_MS[Math.min(reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)];
  reconnectAttempt += 1;
  reconnectTimer = window.setTimeout(connectSignalSocket, delay);
}

function connectSignalSocket() {
  clearReconnect();
  if (socket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(socket.readyState)) return;

  try {
    socket = new WebSocket(socketUrl());
  } catch {
    socket = null;
    scheduleReconnect();
    return;
  }

  socket.addEventListener('open', () => {
    reconnectAttempt = 0;
    startPing();
  });
  socket.addEventListener('message', handleMessage);
  socket.addEventListener('error', () => {});
  socket.addEventListener('close', () => {
    stopPing();
    socket = null;
    participantId = null;
    scheduleReconnect();
  });
}

function init() {
  ensureUi();
  loadIceServers();
  connectSignalSocket();

  const languageObserver = new MutationObserver(renderCopy);
  languageObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });

  window.addEventListener('online', () => scheduleReconnect(true));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleReconnect(true);
  });
  window.addEventListener('beforeunload', () => {
    if (currentCall?.id) send({ type: 'HANGUP', callId: currentCall.id });
    stopLocalMedia();
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();
