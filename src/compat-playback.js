const MAX_COMPAT_SECONDS = 60;

function isAppleMobileWebKit() {
  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  const touchMac = platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return /iPhone|iPad|iPod/i.test(ua) || touchMac;
}

function language() {
  return document.documentElement.lang?.toLowerCase().startsWith('vi') ? 'vi' : 'fr';
}

function copy() {
  return language() === 'vi'
    ? {
        prepare: 'Chuẩn bị cho iPhone',
        checking: 'Đang kiểm tra bản tương thích iPhone…',
        none: 'Chưa có bản tương thích iPhone.',
        converting: 'Cloudflare đang tạo bản MP4 H.264 riêng tư…',
        ready: 'Bản iPhone đã sẵn sàng.',
        active: 'Đang phát bản MP4 H.264 tương thích iPhone.',
        tooLong: 'POC hiện chỉ hỗ trợ video tối đa 60 giây.',
        durationUnknown: 'Không thể xác định thời lượng video.',
        tooLarge: 'POC hiện yêu cầu video nguồn nhỏ hơn 100 MB.',
        failed: 'Không thể chuẩn bị bản iPhone.',
      }
    : {
        prepare: 'Préparer pour iPhone',
        checking: 'Vérification de la version iPhone…',
        none: 'Version iPhone non préparée.',
        converting: 'Cloudflare crée le MP4 H.264 privé…',
        ready: 'Version iPhone prête.',
        active: 'Lecture du MP4 H.264 compatible iPhone.',
        tooLong: 'Le POC est limité aux vidéos de 60 secondes maximum.',
        durationUnknown: 'Impossible de déterminer la durée de cette vidéo.',
        tooLarge: 'Le POC exige actuellement une vidéo source de moins de 100 Mo.',
        failed: 'Impossible de préparer la version iPhone.',
      };
}

function mediaIdFromVideo(video) {
  if (video?.dataset?.compatMediaId) return video.dataset.compatMediaId;
  const raw = video.getAttribute('src') || video.currentSrc || video.src || '';
  try {
    const url = new URL(raw, location.href);
    const match = /^\/media\/([^/]+)$/.exec(url.pathname);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

function viewerStatus() {
  const stage = document.querySelector('.viewer-stage');
  if (!stage) return null;
  let status = stage.querySelector('.compat-video-status');
  if (!status) {
    status = document.createElement('div');
    status.className = 'compat-video-status';
    status.setAttribute('role', 'status');
    Object.assign(status.style, {
      position: 'absolute',
      left: '50%',
      bottom: '1rem',
      transform: 'translateX(-50%)',
      zIndex: '7',
      maxWidth: 'min(92%, 42rem)',
      padding: '.6rem .8rem',
      borderRadius: '.8rem',
      background: 'rgba(11,11,16,.92)',
      border: '1px solid rgba(255,255,255,.16)',
      color: '#fff',
      fontSize: '.8rem',
      lineHeight: '1.35',
      textAlign: 'center',
      backdropFilter: 'blur(10px)',
      pointerEvents: 'none',
    });
    if (getComputedStyle(stage).position === 'static') stage.style.position = 'relative';
    stage.append(status);
  }
  return status;
}

function ensureButton() {
  const actions = document.querySelector('.viewer-actions');
  if (!actions) return null;
  let button = actions.querySelector('#viewer-compat-video');
  if (!button) {
    button = document.createElement('button');
    button.id = 'viewer-compat-video';
    button.type = 'button';
    button.className = 'viewer-action';
    button.innerHTML = '<span></span><b></b>';
    actions.prepend(button);
  }
  button.querySelector('b').textContent = copy().prepare;
  return button;
}

function clearUi() {
  document.querySelector('#viewer-compat-video')?.remove();
  document.querySelector('.compat-video-status')?.remove();
}

async function requestJson(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(path, {
    ...options,
    headers,
    cache: 'no-store',
    credentials: 'same-origin',
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

function activateCompatPlayback(video, url) {
  if (!video || !url || video.dataset.compatPlayback === 'active') return;
  const resumeAt = Number.isFinite(video.currentTime) ? video.currentTime : 0;
  video.dataset.compatPlayback = 'active';
  video.dataset.compatState = 'active';
  video.dataset.compatOriginalSrc = video.getAttribute('src') || '';
  video.pause();
  video.src = url;
  video.load();
  if (resumeAt > 0) {
    video.addEventListener('loadedmetadata', () => {
      try {
        video.currentTime = Math.min(resumeAt, Math.max(0, (video.duration || resumeAt) - 0.1));
      } catch {
        // Resume is best-effort.
      }
    }, { once: true });
  }
  const status = viewerStatus();
  if (status) status.textContent = copy().active;
}

async function checkDerivative(video, mediaId) {
  video.dataset.compatState = 'checking';
  const { response, data } = await requestJson(`/api/v1/compat-video/${encodeURIComponent(mediaId)}`);
  const status = viewerStatus();
  if (response.status === 404) {
    video.dataset.compatState = 'none';
    if (status) status.textContent = copy().none;
    return { state: 'none' };
  }
  if (!response.ok) {
    video.dataset.compatState = 'error';
    if (status) status.textContent = `${copy().failed} · ${data?.error || `HTTP ${response.status}`}`;
    return { state: 'error' };
  }
  if (data.state === 'ready' && data.url) {
    video.dataset.compatState = 'ready';
    if (status) status.textContent = copy().ready;
    if (isAppleMobileWebKit()) activateCompatPlayback(video, data.url);
  }
  return data;
}

function waitForMetadata(video, timeoutMs = 4000) {
  if (Number.isFinite(video.duration) && video.duration > 0) return Promise.resolve(video.duration);
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeEventListener('loadedmetadata', finish);
      resolve(Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null);
    };
    const timer = window.setTimeout(finish, timeoutMs);
    video.addEventListener('loadedmetadata', finish, { once: true });
    try { video.load(); } catch { finish(); }
  });
}

async function prepareDerivative(video, mediaId, button) {
  const text = copy();
  const status = viewerStatus();
  button.disabled = true;
  try {
    const durationSeconds = await waitForMetadata(video);
    if (!Number.isFinite(durationSeconds)) throw new Error(text.durationUnknown);
    if (durationSeconds > MAX_COMPAT_SECONDS) throw new Error(text.tooLong);

    video.dataset.compatState = 'converting';
    if (status) status.textContent = text.converting;
    const { response, data } = await requestJson(`/api/v1/compat-video/${encodeURIComponent(mediaId)}`, {
      method: 'POST',
      body: JSON.stringify({ durationSeconds }),
    });
    if (!response.ok) {
      if (response.status === 413) throw new Error(text.tooLarge);
      if (response.status === 422) throw new Error(text.tooLong);
      throw new Error(data?.error || `HTTP ${response.status}`);
    }

    video.dataset.compatState = 'ready';
    if (status) status.textContent = text.ready;
    if (isAppleMobileWebKit() && data.url) activateCompatPlayback(video, data.url);
  } catch (error) {
    video.dataset.compatState = 'error';
    if (status) status.textContent = `${text.failed} · ${error?.message || 'unknown error'}`;
  } finally {
    button.disabled = false;
  }
}

async function wireVideo(video) {
  if (!(video instanceof HTMLVideoElement)) return;
  const mediaId = mediaIdFromVideo(video);
  if (!mediaId) return;
  video.dataset.compatMediaId = mediaId;

  const button = ensureButton();
  const status = viewerStatus();
  if (!button || !status) return;
  button.onclick = () => prepareDerivative(video, mediaId, button);
  status.textContent = copy().checking;
  await checkDerivative(video, mediaId);
}

function scanViewer() {
  const stage = document.querySelector('.viewer-stage');
  if (!stage) return;
  const video = stage.querySelector('video.viewer-media');
  if (!video) {
    clearUi();
    return;
  }
  if (video.dataset.compatWired === '1') {
    const label = ensureButton()?.querySelector('b');
    if (label) label.textContent = copy().prepare;
    return;
  }
  video.dataset.compatWired = '1';
  wireVideo(video);
}

function init() {
  scanViewer();
  const stage = document.querySelector('.viewer-stage');
  if (stage) {
    const observer = new MutationObserver(scanViewer);
    observer.observe(stage, { childList: true, subtree: true });
  }
  const languageObserver = new MutationObserver(scanViewer);
  languageObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();
