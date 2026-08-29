const FALLBACK_ATTR = 'data-ios-video-fallback';
const objectUrls = new Map();

function isAppleMobileWebKit() {
  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  const touchMac = platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return /iPhone|iPad|iPod/i.test(ua) || touchMac;
}

function currentLanguage() {
  return document.documentElement.lang?.toLowerCase().startsWith('vi') ? 'vi' : 'fr';
}

function copy() {
  return currentLanguage() === 'vi'
    ? {
        loading: 'Tương thích iPhone: đang tải bản video bảo mật…',
        ready: 'Đã bật chế độ phát tương thích iPhone.',
        failed: 'Không thể phát video trên iPhone.',
        detail: 'Mã lỗi',
      }
    : {
        loading: 'Compatibilité iPhone : chargement sécurisé de la vidéo…',
        ready: 'Lecture de secours iPhone activée.',
        failed: 'Impossible de lire cette vidéo sur iPhone.',
        detail: 'Code erreur',
      };
}

function ensureStatus(video) {
  const stage = video.closest('.viewer-stage') || video.parentElement;
  if (!stage) return null;
  let status = stage.querySelector('.ios-video-fallback-status');
  if (!status) {
    status = document.createElement('div');
    status.className = 'ios-video-fallback-status';
    status.setAttribute('role', 'status');
    Object.assign(status.style, {
      position: 'absolute',
      left: '50%',
      bottom: '1rem',
      transform: 'translateX(-50%)',
      zIndex: '5',
      maxWidth: 'min(92%, 38rem)',
      padding: '.65rem .85rem',
      borderRadius: '.8rem',
      background: 'rgba(11,11,16,.9)',
      border: '1px solid rgba(255,255,255,.16)',
      color: '#fff',
      fontSize: '.82rem',
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

function mediaErrorCode(video) {
  return Number(video.error?.code || 0);
}

function releaseObjectUrl(video) {
  const url = objectUrls.get(video);
  if (!url) return;
  URL.revokeObjectURL(url);
  objectUrls.delete(video);
}

function cleanupDetachedObjectUrls() {
  for (const [video] of objectUrls) {
    if (!video.isConnected) releaseObjectUrl(video);
  }
}

function compatibilityCheckPending(video) {
  return video.dataset.compatState === 'checking' || video.dataset.compatState === 'converting';
}

async function activateBlobFallback(video) {
  if (!video || video.getAttribute(FALLBACK_ATTR) === 'loading') return;

  if (compatibilityCheckPending(video)) {
    window.setTimeout(() => {
      if (video.isConnected) activateBlobFallback(video);
    }, 900);
    return;
  }

  if (video.getAttribute(FALLBACK_ATTR) === 'active') {
    const text = copy();
    const status = ensureStatus(video);
    const code = mediaErrorCode(video);
    video.setAttribute(FALLBACK_ATTR, 'failed');
    if (status) {
      status.textContent = `${text.failed} · ${text.detail} ${code || '?'} · blob-decode-failed`;
      status.dataset.videoDiagnostic = '1';
    }
    releaseObjectUrl(video);
    return;
  }

  const source = video.currentSrc || video.src;
  if (!source || source.startsWith('blob:')) return;

  video.setAttribute(FALLBACK_ATTR, 'loading');
  const text = copy();
  const status = ensureStatus(video);
  if (status) status.textContent = text.loading;

  const originalError = mediaErrorCode(video);
  try {
    const response = await fetch(source, {
      method: 'GET',
      headers: { Accept: 'video/*,*/*;q=0.8' },
      credentials: 'same-origin',
      cache: 'no-store',
    });

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (!response.ok || !contentType.startsWith('video/')) {
      throw new Error(`HTTP ${response.status} ${contentType || 'unknown-type'}`);
    }

    const blob = await response.blob();
    if (!blob.size || !blob.type.startsWith('video/')) throw new Error('invalid-video-blob');

    releaseObjectUrl(video);
    const blobUrl = URL.createObjectURL(blob);
    objectUrls.set(video, blobUrl);
    video.pause();
    video.removeAttribute('src');
    video.load();
    video.src = blobUrl;
    video.setAttribute(FALLBACK_ATTR, 'active');
    video.load();

    let done = false;
    const onPlayable = () => {
      if (done) return;
      done = true;
      if (status) status.textContent = text.ready;
      window.setTimeout(() => status?.remove(), 2200);
    };
    video.addEventListener('canplay', onPlayable, { once: true });
    video.addEventListener('loadeddata', onPlayable, { once: true });
  } catch (error) {
    video.setAttribute(FALLBACK_ATTR, 'failed');
    const afterError = mediaErrorCode(video) || originalError;
    if (status) {
      status.textContent = `${text.failed} · ${text.detail} ${afterError || '?'} · ${error?.message || 'fetch failed'}`;
      status.dataset.videoDiagnostic = '1';
    }
  }
}

function wireViewerVideo(video) {
  if (!(video instanceof HTMLVideoElement) || video.dataset.iosFallbackWired === '1') return;
  video.dataset.iosFallbackWired = '1';

  video.addEventListener('error', () => {
    activateBlobFallback(video);
  });

  video.addEventListener('stalled', () => {
    if (video.readyState <= HTMLMediaElement.HAVE_METADATA && !video.paused) {
      window.setTimeout(() => {
        if (!video.paused && video.readyState <= HTMLMediaElement.HAVE_METADATA) activateBlobFallback(video);
      }, 1800);
    }
  });
}

function scanViewer() {
  cleanupDetachedObjectUrls();
  document.querySelectorAll('.viewer-stage video.viewer-media').forEach(wireViewerVideo);
}

function init() {
  if (!isAppleMobileWebKit()) return;
  scanViewer();
  const stage = document.querySelector('.viewer-stage');
  if (stage) {
    const observer = new MutationObserver(scanViewer);
    observer.observe(stage, { childList: true, subtree: true });
  }
  window.addEventListener('beforeunload', () => {
    for (const [video] of objectUrls) releaseObjectUrl(video);
  }, { once: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();
