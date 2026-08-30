import './together.css';

const ROOM = 'shared';
const SYNC_INTERVAL_MS = 8000;
const PING_INTERVAL_MS = 20000;
const SOFT_DRIFT_SECONDS = 0.15;
const HARD_DRIFT_SECONDS = 0.65;

const copy = {
  fr: {
    together: 'Regarder ensemble',
    leave: 'Quitter Together',
    connecting: 'Connexion à Together…',
    waiting: 'Together · 1/2 · en attente de l’autre appareil',
    connected: 'Together · 2/2 connectés',
    synced: (drift) => `Synchronisés · dérive ${drift.toFixed(2)} s`,
    different: 'L’autre appareil regarde un autre média.',
    join: 'Rejoindre',
    hiddenMedia: 'L’autre média est masqué par les filtres actuels.',
    tapPlay: 'Synchronisation prête · touche Play une fois sur cet appareil.',
    closed: 'Together déconnecté.',
    socketError: 'Impossible de rejoindre Together.',
    serverError: 'Together a refusé une commande.',
  },
  vi: {
    together: 'Xem cùng nhau',
    leave: 'Rời Together',
    connecting: 'Đang kết nối Together…',
    waiting: 'Together · 1/2 · đang chờ thiết bị còn lại',
    connected: 'Together · 2/2 đã kết nối',
    synced: (drift) => `Đã đồng bộ · lệch ${drift.toFixed(2)} giây`,
    different: 'Thiết bị kia đang xem nội dung khác.',
    join: 'Xem cùng',
    hiddenMedia: 'Nội dung kia đang bị ẩn bởi bộ lọc hiện tại.',
    tapPlay: 'Đã sẵn sàng đồng bộ · chạm Play một lần trên thiết bị này.',
    closed: 'Đã ngắt Together.',
    socketError: 'Không thể tham gia Together.',
    serverError: 'Together đã từ chối một lệnh.',
  },
};

let socket = null;
let participantId = null;
let roomState = null;
let presence = { participantCount: 0, sessionCount: 0, participants: [] };
let currentVideo = null;
let currentMediaId = null;
let pendingRemoteJoinId = null;
let remoteSwitchInProgress = false;
let suppressLocalUntil = 0;
let pingTimer = null;
let syncTimer = null;
let playbackRateResetTimer = null;
let lastRttMs = 0;
let lastPingAt = null;
let desiredConnection = false;

function lang() {
  return document.documentElement.lang?.toLowerCase().startsWith('vi') ? 'vi' : 'fr';
}

function tr(key, ...args) {
  const value = copy[lang()][key];
  return typeof value === 'function' ? value(...args) : value;
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

function togetherButton() {
  const actions = document.querySelector('.viewer-actions');
  if (!actions) return null;
  let button = actions.querySelector('#viewer-together');
  if (!currentVideo || !currentMediaId) {
    button?.remove();
    return null;
  }
  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.id = 'viewer-together';
    button.className = 'viewer-action together-action';
    button.innerHTML = '<span>♥</span><b></b>';
    actions.prepend(button);
    button.addEventListener('click', () => {
      if (socket && socket.readyState <= WebSocket.OPEN) disconnectTogether();
      else connectTogether();
    });
  }
  button.querySelector('b').textContent = socket && socket.readyState === WebSocket.OPEN ? tr('leave') : tr('together');
  button.dataset.state = socket && socket.readyState === WebSocket.OPEN ? 'connected' : 'idle';
  return button;
}

function togetherPanel() {
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

function setPanel(message, state = 'connected', action = null) {
  const panel = togetherPanel();
  if (!panel) return;
  panel.hidden = false;
  panel.dataset.state = state;
  const text = panel.querySelector('.together-text');
  if (text) text.textContent = message;
  panel.querySelector('.together-join')?.remove();
  if (action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'together-join';
    button.textContent = action.label;
    button.addEventListener('click', action.run);
    panel.append(button);
  }
}

function hidePanel() {
  const panel = document.querySelector('.together-panel');
  if (panel) panel.hidden = true;
}

function updateButton() {
  const button = togetherButton();
  if (!button) return;
  const connected = socket && socket.readyState === WebSocket.OPEN;
  button.querySelector('b').textContent = connected ? tr('leave') : tr('together');
  button.dataset.state = connected ? 'connected' : 'idle';
}

function send(payload) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false;
  socket.send(JSON.stringify(payload));
  return true;
}

function sendCurrentMedia() {
  if (!currentMediaId || !currentVideo) return;
  send({
    type: 'MEDIA',
    mediaId: currentMediaId,
    position: Number.isFinite(currentVideo.currentTime) ? currentVideo.currentTime : 0,
  });
}

function localEventsSuppressed() {
  return performance.now() < suppressLocalUntil;
}

function suppressLocalEvents(ms = 1200) {
  suppressLocalUntil = Math.max(suppressLocalUntil, performance.now() + ms);
}

function resetPlaybackRate(video) {
  if (!video) return;
  if (playbackRateResetTimer) clearTimeout(playbackRateResetTimer);
  playbackRateResetTimer = window.setTimeout(() => {
    playbackRateResetTimer = null;
    if (video.isConnected && Math.abs(video.playbackRate - 1) > 0.001) video.playbackRate = 1;
  }, 2400);
}

function estimatedTargetPosition(state) {
  const base = Number(state?.position) || 0;
  if (!state?.playing) return Math.max(0, base);
  return Math.max(0, base + Math.max(0, lastRttMs) / 2000);
}

function cardForMedia(mediaId) {
  const escaped = globalThis.CSS?.escape ? CSS.escape(mediaId) : mediaId.replace(/[^A-Za-z0-9_-]/g, '');
  const button = document.querySelector(`.media-card[data-media-id="${escaped}"] .media-open`);
  const card = button?.closest('.media-card');
  if (!button || card?.hidden) return null;
  if (card && getComputedStyle(card).display === 'none') return null;
  return button;
}

function openRemoteMedia(card, mediaId) {
  pendingRemoteJoinId = mediaId;
  const dialog = document.querySelector('#media-dialog');

  const openCard = () => {
    card.click();
    remoteSwitchInProgress = false;
    window.setTimeout(() => {
      const video = document.querySelector('.viewer-stage video.viewer-media');
      if (video) wireVideo(video);
      if (roomState) applyRoomState(roomState, { force: true });
    }, 0);
  };

  if (dialog?.open) {
    remoteSwitchInProgress = true;
    dialog.close();
    window.requestAnimationFrame(openCard);
  } else {
    openCard();
  }
}

function offerRemoteMedia(mediaId) {
  const card = cardForMedia(mediaId);
  if (!card) {
    setPanel(tr('hiddenMedia'), 'warning');
    return;
  }
  setPanel(tr('different'), 'warning', {
    label: tr('join'),
    run: () => openRemoteMedia(card, mediaId),
  });
}

async function applyRoomState(state, { force = false } = {}) {
  roomState = state || roomState;
  if (!roomState?.mediaId || !currentVideo || !currentMediaId) return;

  if (roomState.mediaId !== currentMediaId) {
    offerRemoteMedia(roomState.mediaId);
    return;
  }

  if (currentVideo.readyState < HTMLMediaElement.HAVE_METADATA && !force) {
    currentVideo.addEventListener('loadedmetadata', () => applyRoomState(roomState, { force: true }), { once: true });
    return;
  }

  const target = estimatedTargetPosition(roomState);
  const duration = Number(currentVideo.duration);
  const boundedTarget = Number.isFinite(duration) && duration > 0
    ? Math.min(target, Math.max(0, duration - 0.05))
    : target;
  const drift = boundedTarget - (Number(currentVideo.currentTime) || 0);

  suppressLocalEvents();

  if (Math.abs(drift) >= HARD_DRIFT_SECONDS) {
    try { currentVideo.currentTime = boundedTarget; } catch { /* best effort */ }
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
      setPanel(tr('tapPlay'), 'warning');
      return;
    }
  } else if (!roomState.playing && !currentVideo.paused) {
    currentVideo.pause();
  }

  if (presence.participantCount >= 2) setPanel(tr('synced', Math.abs(drift)), 'synced');
  else setPanel(tr('waiting'), 'connected');
}

function updatePresence(next) {
  presence = {
    participantCount: Number(next?.participantCount) || 0,
    sessionCount: Number(next?.sessionCount) || 0,
    participants: Array.isArray(next?.participants) ? next.participants : [],
  };
  if (!desiredConnection) return;
  if (presence.participantCount >= 2 && roomState?.mediaId && currentMediaId && roomState.mediaId !== currentMediaId) {
    offerRemoteMedia(roomState.mediaId);
    return;
  }
  if (presence.participantCount >= 2) setPanel(tr('connected'), 'connected');
  else setPanel(tr('waiting'), 'connected');
}

function handleStateMessage(message) {
  roomState = message?.state || roomState;
  if (!roomState) return;
  if (message?.actor && message.actor === participantId && message.reason !== 'sync') return;
  applyRoomState(roomState);
}

function handleSocketMessage(event) {
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
    if (presence.sessionCount <= 1 && currentMediaId) {
      sendCurrentMedia();
    } else if (!roomState?.mediaId && currentMediaId) {
      sendCurrentMedia();
    } else if (roomState) {
      applyRoomState(roomState);
    }
    return;
  }

  if (message.type === 'PRESENCE') {
    updatePresence(message);
    return;
  }

  if (message.type === 'STATE') {
    handleStateMessage(message);
    return;
  }

  if (message.type === 'PONG') {
    if (Number.isFinite(Number(message.clientTimeMs))) {
      lastRttMs = Math.max(0, Date.now() - Number(message.clientTimeMs));
    }
    return;
  }

  if (message.type === 'ERROR') {
    setPanel(`${tr('serverError')} · ${message.code || '?'}`, 'error');
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
    lastPingAt = Date.now();
    send({ type: 'PING', clientTimeMs: lastPingAt });
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

function connectTogether() {
  if (!currentVideo || !currentMediaId) return;
  if (socket && socket.readyState <= WebSocket.OPEN) return;

  desiredConnection = true;
  setPanel(tr('connecting'), 'connecting');
  updateButton();

  let nextSocket;
  try {
    nextSocket = new WebSocket(websocketUrl());
  } catch {
    setPanel(tr('socketError'), 'error');
    desiredConnection = false;
    return;
  }
  socket = nextSocket;

  socket.addEventListener('open', () => {
    updateButton();
    setPanel(tr('waiting'), 'connected');
    startTimers();
  });
  socket.addEventListener('message', handleSocketMessage);
  socket.addEventListener('error', () => {
    if (desiredConnection) setPanel(tr('socketError'), 'error');
  });
  socket.addEventListener('close', () => {
    stopTimers();
    socket = null;
    participantId = null;
    roomState = null;
    presence = { participantCount: 0, sessionCount: 0, participants: [] };
    updateButton();
    if (desiredConnection) setPanel(tr('closed'), 'error');
    else hidePanel();
  });
}

function disconnectTogether() {
  desiredConnection = false;
  stopTimers();
  if (playbackRateResetTimer) {
    clearTimeout(playbackRateResetTimer);
    playbackRateResetTimer = null;
  }
  if (currentVideo && Math.abs(currentVideo.playbackRate - 1) > 0.001) currentVideo.playbackRate = 1;
  if (socket) {
    try { socket.close(1000, 'User left Together'); } catch { /* no-op */ }
  }
  socket = null;
  participantId = null;
  roomState = null;
  presence = { participantCount: 0, sessionCount: 0, participants: [] };
  updateButton();
  hidePanel();
}

function onLocalPlay(video, mediaId) {
  if (localEventsSuppressed() || socket?.readyState !== WebSocket.OPEN) return;
  send({ type: 'PLAY', mediaId, position: video.currentTime || 0 });
}

function onLocalPause(video, mediaId) {
  if (localEventsSuppressed() || socket?.readyState !== WebSocket.OPEN) return;
  send({ type: 'PAUSE', mediaId, position: video.currentTime || 0 });
}

function onLocalSeek(video, mediaId) {
  if (localEventsSuppressed() || socket?.readyState !== WebSocket.OPEN) return;
  send({ type: 'SEEK', mediaId, position: video.currentTime || 0 });
}

function wireVideo(video) {
  if (!(video instanceof HTMLVideoElement)) return;
  const mediaId = mediaIdFromVideo(video);
  if (!mediaId) return;

  const changed = currentVideo !== video || currentMediaId !== mediaId;
  currentVideo = video;
  currentMediaId = mediaId;
  togetherButton();

  if (video.dataset.togetherWired !== '1') {
    video.dataset.togetherWired = '1';
    video.addEventListener('play', () => onLocalPlay(video, mediaId));
    video.addEventListener('pause', () => onLocalPause(video, mediaId));
    video.addEventListener('seeked', () => onLocalSeek(video, mediaId));
  }

  if (!changed || socket?.readyState !== WebSocket.OPEN) return;

  if (pendingRemoteJoinId === mediaId) {
    pendingRemoteJoinId = null;
    if (roomState) applyRoomState(roomState, { force: true });
    return;
  }

  if (roomState?.mediaId !== mediaId) sendCurrentMedia();
  else applyRoomState(roomState, { force: true });
}

function scanViewer() {
  const stage = document.querySelector('.viewer-stage');
  if (!stage) return;
  const video = stage.querySelector('video.viewer-media');
  if (!video) {
    document.querySelector('#viewer-together')?.remove();
    hidePanel();
    currentVideo = null;
    currentMediaId = null;
    return;
  }
  wireVideo(video);
}

function init() {
  scanViewer();
  const dialog = document.querySelector('#media-dialog');
  dialog?.addEventListener('close', () => {
    if (remoteSwitchInProgress) return;
    disconnectTogether();
  });

  const observer = new MutationObserver(scanViewer);
  const root = document.querySelector('#app') || document.body;
  observer.observe(root, { childList: true, subtree: true });

  const languageObserver = new MutationObserver(() => {
    updateButton();
    if (desiredConnection) updatePresence(presence);
  });
  languageObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });

  window.addEventListener('beforeunload', () => disconnectTogether(), { once: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();
