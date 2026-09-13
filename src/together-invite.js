import './together.css';

const ROOM = 'shared';
const PING_INTERVAL_MS = 20000;
const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 12000];

const copy = {
  fr: {
    title: 'Invitation Together ❤️',
    body: 'Une vidéo t’attend. Tu veux rejoindre maintenant ?',
    accept: 'Rejoindre',
    decline: 'Pas maintenant',
    opening: 'Ouverture de la vidéo…',
    openFailed: 'Impossible d’ouvrir automatiquement cette vidéo.',
    close: 'Fermer',
  },
  vi: {
    title: 'Lời mời Together ❤️',
    body: 'Có một video đang chờ bạn. Tham gia xem cùng ngay không?',
    accept: 'Tham gia',
    decline: 'Để sau',
    opening: 'Đang mở video…',
    openFailed: 'Không thể tự động mở video này.',
    close: 'Đóng',
  },
};

let lobbySocket = null;
let participantId = null;
let reconnectAttempt = 0;
let reconnectTimer = null;
let pingTimer = null;
let pendingInvite = null;
let inviteExpiryTimer = null;
let outgoingInviteId = null;
let outgoingMediaId = null;
let cancelPending = false;
let suppressNextTogetherClick = false;
let originalTitle = document.title;

function lang() {
  return document.documentElement.lang?.toLowerCase().startsWith('vi') ? 'vi' : 'fr';
}

function tr(key) {
  return copy[lang()][key];
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

function inviteSocketUrl() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = new URL(`${protocol}//${location.host}/api/together/invite/ws`);
  url.searchParams.set('room', ROOM);
  return url.toString();
}

function send(payload) {
  if (lobbySocket?.readyState !== WebSocket.OPEN) return false;
  lobbySocket.send(JSON.stringify(payload));
  return true;
}

function ensureModal() {
  let overlay = document.querySelector('#together-invite-overlay');
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = 'together-invite-overlay';
  overlay.className = 'together-invite-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `
    <section class="together-invite-card" role="dialog" aria-modal="true" aria-labelledby="together-invite-title" aria-describedby="together-invite-body">
      <div class="together-invite-heart" aria-hidden="true">♥</div>
      <h2 id="together-invite-title"></h2>
      <p id="together-invite-body"></p>
      <div class="together-invite-actions">
        <button type="button" class="together-invite-secondary" id="together-invite-decline"></button>
        <button type="button" class="together-invite-primary" id="together-invite-accept"></button>
      </div>
    </section>
  `;

  document.body.append(overlay);
  overlay.querySelector('#together-invite-accept')?.addEventListener('click', acceptInvite);
  overlay.querySelector('#together-invite-decline')?.addEventListener('click', declineInvite);
  return overlay;
}

function renderModalCopy({ failure = false } = {}) {
  const overlay = ensureModal();
  const title = overlay.querySelector('#together-invite-title');
  const body = overlay.querySelector('#together-invite-body');
  const accept = overlay.querySelector('#together-invite-accept');
  const decline = overlay.querySelector('#together-invite-decline');

  if (title) title.textContent = tr('title');
  if (body) body.textContent = failure ? tr('openFailed') : tr('body');
  if (accept) accept.textContent = failure ? tr('close') : tr('accept');
  if (decline) {
    decline.textContent = tr('decline');
    decline.hidden = failure;
  }
}

function showInvite(invite) {
  const expiresAt = Number(invite?.expiresAt) || 0;
  if (!invite?.id || !invite?.mediaId || expiresAt <= Date.now()) return;

  pendingInvite = invite;
  renderModalCopy();
  const overlay = ensureModal();
  overlay.hidden = false;
  originalTitle = document.title || 'NaughtyShare';
  document.title = `❤️ ${tr('title')} · NaughtyShare`;

  if (inviteExpiryTimer) clearTimeout(inviteExpiryTimer);
  inviteExpiryTimer = window.setTimeout(() => {
    if (pendingInvite?.id === invite.id) hideInvite();
  }, Math.max(1000, expiresAt - Date.now()));

  window.setTimeout(() => overlay.querySelector('#together-invite-accept')?.focus(), 0);
}

function hideInvite() {
  const overlay = document.querySelector('#together-invite-overlay');
  if (overlay) overlay.hidden = true;
  if (inviteExpiryTimer) clearTimeout(inviteExpiryTimer);
  inviteExpiryTimer = null;
  pendingInvite = null;
  if (document.title.startsWith('❤️ ')) document.title = originalTitle || 'NaughtyShare';
}

function showOpenFailure() {
  renderModalCopy({ failure: true });
  const overlay = ensureModal();
  overlay.hidden = false;
  const accept = overlay.querySelector('#together-invite-accept');
  if (accept) {
    const close = () => {
      accept.removeEventListener('click', close);
      hideInvite();
    };
    accept.addEventListener('click', close, { once: true });
  }
}

function cardButtonFor(mediaId) {
  const escaped = globalThis.CSS?.escape ? CSS.escape(mediaId) : mediaId.replace(/[^A-Za-z0-9_-]/g, '');
  return document.querySelector(`.media-card[data-media-id="${escaped}"] .media-open`);
}

function waitForTogetherJoin(mediaId, deadline) {
  const video = document.querySelector('.viewer-stage video.viewer-media');
  const button = document.querySelector('#viewer-together');
  if (video && button && mediaIdFromVideo(video) === mediaId) {
    suppressNextTogetherClick = true;
    button.click();
    return;
  }
  if (Date.now() >= deadline) {
    showOpenFailure();
    return;
  }
  window.setTimeout(() => waitForTogetherJoin(mediaId, deadline), 100);
}

function openInvitedMedia(mediaId) {
  const deadline = Date.now() + 6000;

  const tryOpen = () => {
    const button = cardButtonFor(mediaId);
    if (button) {
      button.click();
      window.setTimeout(() => waitForTogetherJoin(mediaId, deadline), 0);
      return;
    }
    if (Date.now() >= deadline) {
      showOpenFailure();
      return;
    }
    window.setTimeout(tryOpen, 120);
  };

  tryOpen();
}

function acceptInvite() {
  const invite = pendingInvite;
  if (!invite) {
    hideInvite();
    return;
  }

  send({ type: 'ACCEPT', inviteId: invite.id });
  const mediaId = invite.mediaId;
  hideInvite();
  openInvitedMedia(mediaId);
}

function declineInvite() {
  const invite = pendingInvite;
  if (invite) send({ type: 'DECLINE', inviteId: invite.id });
  hideInvite();
}

function flushOutgoingInvite() {
  if (!outgoingMediaId || lobbySocket?.readyState !== WebSocket.OPEN) return;
  send({ type: 'INVITE', mediaId: outgoingMediaId });
}

function requestInvite(mediaId) {
  outgoingMediaId = mediaId;
  outgoingInviteId = null;
  cancelPending = false;
  flushOutgoingInvite();
}

function cancelOutgoingInvite() {
  if (!outgoingMediaId && !outgoingInviteId) return;
  if (outgoingInviteId) {
    send({ type: 'CANCEL_INVITE', inviteId: outgoingInviteId });
    outgoingInviteId = null;
    outgoingMediaId = null;
    cancelPending = false;
    return;
  }

  cancelPending = true;
  outgoingMediaId = null;
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
    if (message.invite) showInvite(message.invite);
    flushOutgoingInvite();
    return;
  }

  if (message.type === 'INVITE') {
    if (message.invite?.actor && message.invite.actor === participantId) return;
    showInvite(message.invite);
    return;
  }

  if (message.type === 'INVITE_SENT') {
    const inviteId = message.invite?.id || null;
    if (cancelPending && inviteId) {
      send({ type: 'CANCEL_INVITE', inviteId });
      cancelPending = false;
      outgoingInviteId = null;
      outgoingMediaId = null;
      return;
    }
    outgoingInviteId = inviteId;
    return;
  }

  if (['INVITE_ACCEPTED', 'INVITE_DECLINED', 'INVITE_CLEARED'].includes(message.type)) {
    if (!message.inviteId || message.inviteId === outgoingInviteId) {
      outgoingInviteId = null;
      outgoingMediaId = null;
      cancelPending = false;
    }
    if (!message.inviteId || message.inviteId === pendingInvite?.id) hideInvite();
  }
}

function stopPing() {
  if (pingTimer) clearInterval(pingTimer);
  pingTimer = null;
}

function startPing() {
  stopPing();
  pingTimer = window.setInterval(() => {
    send({ type: 'PING', clientTimeMs: Date.now() });
  }, PING_INTERVAL_MS);
}

function clearReconnectTimer() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
}

function scheduleReconnect(immediate = false) {
  if (lobbySocket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(lobbySocket.readyState)) return;
  clearReconnectTimer();
  const delay = immediate ? 0 : RECONNECT_DELAYS_MS[Math.min(reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)];
  reconnectAttempt += 1;
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    connectLobby();
  }, delay);
}

function connectLobby() {
  if (lobbySocket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(lobbySocket.readyState)) return;

  try {
    lobbySocket = new WebSocket(inviteSocketUrl());
  } catch {
    lobbySocket = null;
    scheduleReconnect();
    return;
  }

  lobbySocket.addEventListener('open', () => {
    reconnectAttempt = 0;
    clearReconnectTimer();
    startPing();
  });
  lobbySocket.addEventListener('message', handleMessage);
  lobbySocket.addEventListener('error', () => {});
  lobbySocket.addEventListener('close', () => {
    stopPing();
    lobbySocket = null;
    participantId = null;
    scheduleReconnect();
  });
}

function handleTogetherClick(event) {
  const button = event.target instanceof Element ? event.target.closest('#viewer-together') : null;
  if (!button) return;

  if (suppressNextTogetherClick) {
    suppressNextTogetherClick = false;
    return;
  }

  const label = button.querySelector('b')?.textContent || '';
  const leaving = label.includes('Quitter') || label.includes('Rời');
  if (leaving) {
    cancelOutgoingInvite();
    return;
  }

  const video = document.querySelector('.viewer-stage video.viewer-media');
  const mediaId = mediaIdFromVideo(video);
  if (mediaId) requestInvite(mediaId);
}

function init() {
  ensureModal();
  connectLobby();

  document.addEventListener('click', handleTogetherClick, true);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && pendingInvite) declineInvite();
  });

  document.querySelector('#media-dialog')?.addEventListener('close', () => {
    cancelOutgoingInvite();
  });

  const languageObserver = new MutationObserver(() => {
    if (pendingInvite) renderModalCopy();
  });
  languageObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });

  window.addEventListener('online', () => scheduleReconnect(true));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleReconnect(true);
  });
  window.addEventListener('beforeunload', () => {
    cancelOutgoingInvite();
    stopPing();
  }, { once: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();
