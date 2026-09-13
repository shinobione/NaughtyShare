import './together.css';

const ROOM = 'shared';
const SOFT_DRIFT_SECONDS = 0.15;
const HARD_DRIFT_SECONDS = 0.65;
const SYNC_INTERVAL_MS = 8000;
const PING_INTERVAL_MS = 20000;
const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 12000];

const copy = {
  fr: {
    join: 'Regarder ensemble',
    leave: 'Quitter Together',
    connecting: 'Connexion à Together…',
    reconnecting: 'Together · reconnexion…',
    waiting: 'Together · 1/2 · en attente de l’autre appareil',
    connected: 'Together · 2/2 connectés',
    synced: (drift) => `Synchronisés · dérive ${Math.abs(drift).toFixed(2)} s`,
    catchingUp: 'L’autre appareil charge la vidéo…',
    differentMedia: 'Together · l’autre appareil regarde une autre vidéo.',
    tapPlay: 'Synchronisation prête · clique Play une fois sur cet appareil.',
    socketError: 'Impossible de rejoindre Together.',
  },
  vi: {
    join: 'Xem cùng nhau',
    leave: 'Rời Together',
    connecting: 'Đang kết nối Together…',
    reconnecting: 'Together · đang kết nối lại…',
    waiting: 'Together · 1/2 · đang chờ thiết bị còn lại',
    connected: 'Together · 2/2 đã kết nối',
    synced: (drift) => `Đã đồng bộ · lệch ${Math.abs(drift).toFixed(2)} giây`,
    catchingUp: 'Thiết bị kia đang tải video…',
    differentMedia: 'Together · thiết bị kia đang xem video khác.',
    tapPlay: 'Đã sẵn sàng đồng bộ · bấm Play một lần trên thiết bị này.',
    socketError: 'Không thể tham gia Together.',
  },
};

let socket = null;
let desiredConnection = false;
let participantId = null;
let roomState = null;
let presence = { participantCount: 0, sessionCount: 0, bufferingParticipants: [] };
let currentVideo = null;
let currentMediaId = null;
let suppressLocalUntil = 0;
let lastRttMs = 0;
let pingTimer = null;
let syncTimer = null;
let reconnectTimer = null;
let reconnectAttempt = 0;
let playbackRateResetTimer = null;
let scanScheduled = false;

function lang() {
  return document.documentElement.lang?.toLowerCase().startsWith('vi') ? 'vi' : 'fr';
}

function tr(key, ...args) {
  const value = copy[lang()][key];
  return typeof value === 'function' ? value(...args) : value;
}

function setTextIfChanged(node, value) {
  if (node && node.textContent !== value) node.textContent = value;
}

function mediaIdFromVideo(video) {
  if (video?.dataset?.compatMediaId) return video.dataset.compatMediaId;
  const raw = video?.getAttribute('src') || video?.currentSrc || video?.src || '';
  try {
    const url = new URL(raw, location.href);
    const match = /^\/media\/([^/]+)$/.exec(url.pathname);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

function ensureButton() {
  const actions = document.querySelector('.viewer-actions');
  if (!actions) return null;

  let button = actions.querySelector('#viewer-together');
  if (!currentVideo || !currentMediaId) {
    if (button) button.remove();
    return null;
  }

  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.id = 'viewer-together';
    button.className = 'viewer-action together-action';
    button.innerHTML = '<span>♥</span><b></b>';
    button.addEventListener('click', () => {
      if (desiredConnection) disconnectTogether();
      else connectTogether();
    });
    actions.prepend(button);
  }

  setTextIfChanged(button.querySelector('b'), desiredConnection ? tr('leave') : tr('join'));
  const state = socket?.readyState === WebSocket.OPEN ? 'connected' : 'idle';
  if (button.dataset.state !== state) button.dataset.state = state;
  return button;
}

function ensurePanel() {
  const stage = document.querySelector('.viewer-stage');
  if (!stage) return null;
  let panel = stage.querySelector('.together-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.className = 'together-panel';
    panel.hidden = true;
    panel.innerHTML = '<span class="together-dot"></span><span class="together-text"></span>';
    if (getComputedStyle(stage).position === 'static') stage.style.position = 'relative';
    stage.append(panel);
  }
  return panel;
}

function setStatus(message, state = 'connected') {
  const panel = ensurePanel();
  if (!panel) return;
  if (panel.hidden) panel.hidden = false;
  if (panel.dataset.state !== state) panel.dataset.state = state;
  setTextIfChanged(panel.querySelector('.together-text'), message);
}

function hideStatus() {
  const panel = document.querySelector('.together-panel');
  if (panel && !panel.hidden) panel.hidden = true;
}

function send(payload) {
  if (socket?.readyState !== WebSocket.OPEN) return false;
  socket.send(JSON.stringify(payload));
  return true;
}

function sendCurrentMedia() {
  if (!currentVideo || !currentMediaId) return;
  send({
    type: 'MEDIA',
    mediaId: currentMediaId,
    position: Number.isFinite(currentVideo.currentTime) ? currentVideo.currentTime : 0,
  });
}

function suppressLocalEvents(ms = 1000) {
  suppressLocalUntil = Math.max(suppressLocalUntil, performance.now() + ms);
}

function localEventsSuppressed() {
  return performance.now() < suppressLocalUntil;
}

function resetPlaybackRate(video) {
  if (playbackRateResetTimer) clearTimeout(playbackRateResetTimer);
  playbackRateResetTimer = window.setTimeout(() => {
    playbackRateResetTimer = null;
    if (video?.isConnected && Math.abs(video.playbackRate - 1) > 0.001) video.playbackRate = 1;
  }, 2200);
}

function partnerBuffering() {
  return presence.bufferingParticipants.some((id) => id && id !== participantId);
}

function showPresence(drift = null) {
  if (!desiredConnection) return;
  if (presence.participantCount >= 2 && partnerBuffering()) {
    setStatus(tr('catchingUp'), 'warning');
  } else if (presence.participantCount >= 2 && Number.isFinite(drift)) {
    setStatus(tr('synced', drift), 'synced');
  } else if (presence.participantCount >= 2) {
    setStatus(tr('connected'), 'connected');
  } else {
    setStatus(tr('waiting'), 'connected');
  }
}

async function applyRoomState(state) {
  roomState = state || roomState;
  if (!roomState?.mediaId || !currentVideo || !currentMediaId) return;

  if (roomState.mediaId !== currentMediaId) {
    setStatus(tr('differentMedia'), 'warning');
    return;
  }

  if (currentVideo.readyState < HTMLMediaElement.HAVE_METADATA) {
    currentVideo.addEventListener('loadedmetadata', () => applyRoomState(roomState), { once: true });
    return;
  }

  const base = Number(roomState.position) || 0;
  const target = roomState.playing ? base + Math.max(0, lastRttMs) / 2000 : base;
  const duration = Number(currentVideo.duration);
  const bounded = Number.isFinite(duration) && duration > 0
    ? Math.min(target, Math.max(0, duration - 0.05))
    : Math.max(0, target);
  const drift = bounded - (Number(currentVideo.currentTime) || 0);

  suppressLocalEvents();

  if (Math.abs(drift) >= HARD_DRIFT_SECONDS) {
    try { currentVideo.currentTime = bounded; } catch { /* best effort */ }
  } else if (roomState.playing && Math.abs(drift) >= SOFT_DRIFT_SECONDS) {
    currentVideo.playbackRate = drift > 0 ? 1.02 : 0.98;
    resetPlaybackRate(currentVideo);
  } else if (Math.abs(currentVideo.playbackRate - 1) > 0.001) {
    currentVideo.playbackRate = 1;
  }

  if (roomState.playing && currentVideo.paused) {
    try {
      await currentVideo.play();
    } catch {
      setStatus(tr('tapPlay'), 'warning');
      return;
    }
  } else if (!roomState.playing && !currentVideo.paused) {
    currentVideo.pause();
  }

  showPresence(drift);
}

function updatePresence(next) {
  presence = {
    participantCount: Number(next?.participantCount) || 0,
    sessionCount: Number(next?.sessionCount) || 0,
    bufferingParticipants: Array.isArray(next?.bufferingParticipants) ? next.bufferingParticipants : [],
  };
  showPresence();
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
    roomState = message.state || null;
    updatePresence(message.presence || {});
    if (presence.sessionCount <= 1 || !roomState?.mediaId) sendCurrentMedia();
    else applyRoomState(roomState);
    return;
  }

  if (message.type === 'PRESENCE') {
    updatePresence(message);
    return;
  }

  if (message.type === 'STATE') {
    roomState = message.state || roomState;
    if (!message.actor || message.actor !== participantId || message.reason === 'sync') applyRoomState(roomState);
    return;
  }

  if (message.type === 'PONG' && Number.isFinite(Number(message.clientTimeMs))) {
    lastRttMs = Math.max(0, Date.now() - Number(message.clientTimeMs));
    return;
  }

  if (message.type === 'ERROR') {
    setStatus(`${tr('socketError')} · ${message.code || '?'}`, 'error');
  }
}

function stopTimers() {
  if (pingTimer) clearInterval(pingTimer);
  if (syncTimer) clearInterval(syncTimer);
  pingTimer = null;
  syncTimer = null;
}

function startTimers() {
  stopTimers();
  pingTimer = window.setInterval(() => {
    send({ type: 'PING', clientTimeMs: Date.now() });
  }, PING_INTERVAL_MS);
  syncTimer = window.setInterval(() => {
    if (roomState?.playing) send({ type: 'SYNC' });
  }, SYNC_INTERVAL_MS);
}

function websocketUrl() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = new URL(`${protocol}//${location.host}/api/together/ws`);
  url.searchParams.set('room', ROOM);
  return url.toString();
}

function clearReconnectTimer() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
}

function scheduleReconnect(immediate = false) {
  if (!desiredConnection || !currentVideo || !currentMediaId) return;
  if (socket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(socket.readyState)) return;
  clearReconnectTimer();
  const delay = immediate ? 0 : RECONNECT_DELAYS_MS[Math.min(reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)];
  reconnectAttempt += 1;
  setStatus(tr('reconnecting'), 'connecting');
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    connectTogether(true);
  }, delay);
}

function connectTogether(reconnect = false) {
  if (!currentVideo || !currentMediaId) return;
  if (socket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(socket.readyState)) return;

  if (!reconnect) {
    desiredConnection = true;
    reconnectAttempt = 0;
  }
  if (!desiredConnection) return;

  clearReconnectTimer();
  setStatus(reconnect ? tr('reconnecting') : tr('connecting'), 'connecting');
  ensureButton();

  try {
    socket = new WebSocket(websocketUrl());
  } catch {
    socket = null;
    setStatus(tr('socketError'), 'error');
    scheduleReconnect();
    return;
  }

  socket.addEventListener('open', () => {
    reconnectAttempt = 0;
    ensureButton();
    setStatus(tr('waiting'), 'connected');
    startTimers();
  });
  socket.addEventListener('message', handleMessage);
  socket.addEventListener('error', () => {
    if (desiredConnection) setStatus(tr('socketError'), 'error');
  });
  socket.addEventListener('close', () => {
    stopTimers();
    socket = null;
    participantId = null;
    roomState = null;
    presence = { participantCount: 0, sessionCount: 0, bufferingParticipants: [] };
    ensureButton();
    if (desiredConnection && currentVideo && currentMediaId) scheduleReconnect();
    else hideStatus();
  });
}

function disconnectTogether() {
  desiredConnection = false;
  reconnectAttempt = 0;
  clearReconnectTimer();
  stopTimers();
  if (playbackRateResetTimer) clearTimeout(playbackRateResetTimer);
  playbackRateResetTimer = null;
  if (currentVideo && Math.abs(currentVideo.playbackRate - 1) > 0.001) currentVideo.playbackRate = 1;
  if (socket) {
    try { socket.close(1000, 'User left Together'); } catch { /* no-op */ }
  }
  socket = null;
  participantId = null;
  roomState = null;
  presence = { participantCount: 0, sessionCount: 0, bufferingParticipants: [] };
  ensureButton();
  hideStatus();
}

function setBuffering(video, mediaId, buffering) {
  const next = buffering ? '1' : '0';
  if (video.dataset.togetherBuffering === next) return;
  video.dataset.togetherBuffering = next;
  send({ type: 'BUFFER', mediaId, buffering });
}

function wireVideo(video) {
  if (!(video instanceof HTMLVideoElement)) return;
  const mediaId = mediaIdFromVideo(video);
  if (!mediaId) return;

  const changed = currentVideo !== video || currentMediaId !== mediaId;
  currentVideo = video;
  currentMediaId = mediaId;
  ensureButton();

  if (video.dataset.togetherSafeWired !== '1') {
    video.dataset.togetherSafeWired = '1';
    video.addEventListener('play', () => {
      setBuffering(video, mediaId, false);
      if (!localEventsSuppressed()) send({ type: 'PLAY', mediaId, position: video.currentTime || 0 });
    });
    video.addEventListener('pause', () => {
      setBuffering(video, mediaId, false);
      if (!localEventsSuppressed()) send({ type: 'PAUSE', mediaId, position: video.currentTime || 0 });
    });
    video.addEventListener('seeked', () => {
      if (!localEventsSuppressed()) send({ type: 'SEEK', mediaId, position: video.currentTime || 0 });
    });
    video.addEventListener('waiting', () => setBuffering(video, mediaId, true));
    video.addEventListener('stalled', () => setBuffering(video, mediaId, true));
    video.addEventListener('playing', () => setBuffering(video, mediaId, false));
    video.addEventListener('canplay', () => setBuffering(video, mediaId, false));
    video.addEventListener('ended', () => setBuffering(video, mediaId, false));
  }

  if (changed && socket?.readyState === WebSocket.OPEN) {
    if (roomState?.mediaId === mediaId) applyRoomState(roomState);
    else sendCurrentMedia();
  }
}

function scanViewer() {
  scanScheduled = false;
  const stage = document.querySelector('.viewer-stage');
  const video = stage?.querySelector('video.viewer-media') || null;

  if (!video) {
    currentVideo = null;
    currentMediaId = null;
    const button = document.querySelector('#viewer-together');
    if (button) button.remove();
    hideStatus();
    return;
  }

  wireVideo(video);
}

function scheduleScan() {
  if (scanScheduled) return;
  scanScheduled = true;
  window.requestAnimationFrame(scanViewer);
}

function init() {
  scheduleScan();

  const root = document.querySelector('#app') || document.body;
  const observer = new MutationObserver(() => scheduleScan());
  observer.observe(root, { childList: true, subtree: true });

  const dialog = document.querySelector('#media-dialog');
  dialog?.addEventListener('close', () => disconnectTogether());

  const languageObserver = new MutationObserver(() => {
    ensureButton();
    if (desiredConnection) showPresence();
  });
  languageObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });

  window.addEventListener('online', () => {
    if (desiredConnection) scheduleReconnect(true);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && desiredConnection) scheduleReconnect(true);
  });
  window.addEventListener('beforeunload', () => disconnectTogether(), { once: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();
