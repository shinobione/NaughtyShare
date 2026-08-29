const STREAM_POC_MAX_BYTES = 200 * 1024 * 1024;
const POLL_INTERVAL_MS = 3500;
const POLL_ATTEMPTS = 36;

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
        downloading: 'Đang lấy video gốc từ kho riêng…',
        uploading: 'Đang gửi bản phát tới Cloudflare Stream…',
        encoding: 'Cloudflare Stream đang mã hóa H.264…',
        ready: 'Bản iPhone đã sẵn sàng.',
        active: 'Đang phát bản H.264 tương thích iPhone.',
        tooLarge: 'POC Stream hiện giới hạn ở video tối đa 200 MB.',
        failed: 'Không thể chuẩn bị bản iPhone.',
        later: 'Đang mã hóa. Có thể đóng rồi mở lại video sau.',
      }
    : {
        prepare: 'Préparer pour iPhone',
        checking: 'Vérification de la version iPhone…',
        none: 'Version iPhone non préparée.',
        downloading: 'Récupération de la vidéo originale depuis le coffre…',
        uploading: 'Envoi de la copie de lecture vers Cloudflare Stream…',
        encoding: 'Cloudflare Stream encode la copie H.264…',
        ready: 'Version iPhone prête.',
        active: 'Lecture H.264 compatible iPhone activée.',
        tooLarge: 'Le POC Stream est limité aux vidéos de 200 Mo maximum.',
        failed: 'Impossible de préparer la version iPhone.',
        later: 'Encodage en cours. Tu peux fermer puis rouvrir la vidéo plus tard.',
      };
}

function mediaIdFromVideo(video) {
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
  let status = stage.querySelector('.stream-poc-status');
  if (!status) {
    status = document.createElement('div');
    status.className = 'stream-poc-status';
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
  let button = actions.querySelector('#viewer-stream-poc');
  if (!button) {
    button = document.createElement('button');
    button.id = 'viewer-stream-poc';
    button.type = 'button';
    button.className = 'viewer-action';
    button.innerHTML = '<span></span><b></b>';
    actions.prepend(button);
  }
  button.querySelector('b').textContent = copy().prepare;
  return button;
}

function clearUi() {
  document.querySelector('#viewer-stream-poc')?.remove();
  document.querySelector('.stream-poc-status')?.remove();
}

async function requestJson(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { Accept: 'application/json', ...(options.headers || {}) },
    cache: 'no-store',
    credentials: 'same-origin',
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

function activateStreamPlayback(video, hlsUrl) {
  if (!video || !hlsUrl || video.dataset.streamPlayback === 'active') return;
  const resumeAt = Number.isFinite(video.currentTime) ? video.currentTime : 0;
  video.dataset.streamPlayback = 'active';
  video.dataset.streamOriginalSrc = video.getAttribute('src') || '';
  video.pause();
  video.src = hlsUrl;
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

async function checkDerivative(video, mediaId, { quiet404 = false } = {}) {
  const { response, data } = await requestJson(`/api/v1/stream/${encodeURIComponent(mediaId)}`);
  const status = viewerStatus();
  if (response.status === 404) {
    if (!quiet404 && status) status.textContent = copy().none;
    return { state: 'none' };
  }
  if (!response.ok) {
    if (status) status.textContent = `${copy().failed} ${data?.error || ''}`.trim();
    return { state: 'error' };
  }
  if (data.state === 'ready' && data.hlsUrl) {
    if (status) status.textContent = copy().ready;
    if (isAppleMobileWebKit()) activateStreamPlayback(video, data.hlsUrl);
    return data;
  }
  if (status) status.textContent = data.state === 'processing' ? copy().encoding : copy().checking;
  return data;
}

async function pollReady(video, mediaId) {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    const result = await checkDerivative(video, mediaId, { quiet404: true });
    if (result.state === 'ready' || result.state === 'error') return result;
    await new Promise((resolve) => window.setTimeout(resolve, POLL_INTERVAL_MS));
  }
  const status = viewerStatus();
  if (status) status.textContent = copy().later;
  return { state: 'processing' };
}

async function prepareDerivative(video, mediaId, button) {
  const text = copy();
  const status = viewerStatus();
  button.disabled = true;
  try {
    if (status) status.textContent = text.checking;
    const provision = await requestJson(`/api/v1/stream/${encodeURIComponent(mediaId)}/provision`, { method: 'POST' });
    if (!provision.response.ok) {
      if (provision.response.status === 413) throw new Error(text.tooLarge);
      throw new Error(provision.data?.error || text.failed);
    }

    if (!provision.data.uploadRequired) {
      await checkDerivative(video, mediaId);
      return;
    }

    if (status) status.textContent = text.downloading;
    const source = await fetch(`/media/${encodeURIComponent(mediaId)}`, {
      method: 'GET',
      headers: { Accept: 'video/*,*/*;q=0.8' },
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (!source.ok) throw new Error(`HTTP ${source.status}`);
    const blob = await source.blob();
    if (!blob.size || blob.size > STREAM_POC_MAX_BYTES) throw new Error(text.tooLarge);

    if (status) status.textContent = text.uploading;
    const form = new FormData();
    const title = document.querySelector('#viewer-name')?.textContent?.trim() || 'naughtyshare-video';
    form.append('file', blob, title);
    const uploaded = await fetch(provision.data.uploadUrl, {
      method: 'POST',
      body: form,
      credentials: 'omit',
    });
    if (!uploaded.ok) throw new Error(`Stream upload HTTP ${uploaded.status}`);

    if (status) status.textContent = text.encoding;
    await pollReady(video, mediaId);
  } catch (error) {
    if (status) status.textContent = `${text.failed} · ${error?.message || 'unknown error'}`;
  } finally {
    button.disabled = false;
  }
}

async function wireVideo(video) {
  if (!(video instanceof HTMLVideoElement)) return;
  const mediaId = mediaIdFromVideo(video);
  if (!mediaId) return;
  video.dataset.streamMediaId = mediaId;

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
  if (video.dataset.streamCompatWired === '1') {
    ensureButton()?.querySelector('b')?.replaceChildren(copy().prepare);
    return;
  }
  video.dataset.streamCompatWired = '1';
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
