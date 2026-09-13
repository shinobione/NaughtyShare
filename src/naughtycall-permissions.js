// NaughtyCall media permission preflight.
// Runs before naughtycall.js and turns the first Appeler/Gọi click into the
// browser permission gesture. A successful stream is handed to the existing
// NaughtyCall client through a one-shot getUserMedia shim, so the call client
// does not have to prompt a second time.

const copy = {
  fr: {
    preparing: 'Caméra + micro…',
    title: 'NaughtyCall a besoin de ta caméra et de ton micro',
    denied: 'Chrome bloque l’accès. Autorise caméra et micro pour NaughtyShare, puis réessaie.',
    missingMic: 'Aucun micro utilisable n’a été détecté sur cet appareil.',
    busy: 'La caméra ou le micro est déjà utilisé par une autre application. Ferme-la puis réessaie.',
    unsupported: 'Ce navigateur ne permet pas l’accès caméra/micro ici.',
    generic: 'Impossible d’ouvrir la caméra ou le micro.',
    retry: 'Réessayer',
    close: 'Fermer',
    audioOnly: 'Caméra indisponible : l’appel démarrera en audio uniquement.',
  },
  vi: {
    preparing: 'Camera + micro…',
    title: 'NaughtyCall cần quyền camera và micro',
    denied: 'Chrome đang chặn quyền truy cập. Hãy cho phép camera và micro cho NaughtyShare rồi thử lại.',
    missingMic: 'Không tìm thấy micro có thể sử dụng trên thiết bị này.',
    busy: 'Camera hoặc micro đang được ứng dụng khác sử dụng. Hãy đóng ứng dụng đó rồi thử lại.',
    unsupported: 'Trình duyệt này không cho phép dùng camera/micro ở đây.',
    generic: 'Không thể mở camera hoặc micro.',
    retry: 'Thử lại',
    close: 'Đóng',
    audioOnly: 'Camera không khả dụng: cuộc gọi sẽ bắt đầu chỉ với âm thanh.',
  },
};

let busy = false;
let bypassNextClick = false;
let originalGetUserMedia = null;
let primedStream = null;
let retryButton = null;

function lang() {
  return document.documentElement.lang?.toLowerCase().startsWith('vi') ? 'vi' : 'fr';
}

function tr(key) {
  return copy[lang()][key];
}

function ensureStyles() {
  if (document.querySelector('#naughtycall-permission-style')) return;
  const style = document.createElement('style');
  style.id = 'naughtycall-permission-style';
  style.textContent = `
    .naughtycall-permission-overlay{position:fixed;inset:0;z-index:100000;display:grid;place-items:center;padding:24px;background:rgba(5,5,10,.78);backdrop-filter:blur(10px)}
    .naughtycall-permission-overlay[hidden]{display:none!important}
    .naughtycall-permission-card{width:min(460px,100%);padding:28px;border:1px solid rgba(255,255,255,.13);border-radius:24px;background:#17131d;color:#fff;box-shadow:0 28px 80px rgba(0,0,0,.5);text-align:center}
    .naughtycall-permission-icon{font-size:42px;margin-bottom:10px}
    .naughtycall-permission-card h2{margin:0 0 10px;font-size:22px}
    .naughtycall-permission-card p{margin:0;color:#c9c0cf;line-height:1.5}
    .naughtycall-permission-actions{display:flex;gap:10px;justify-content:center;margin-top:22px}
    .naughtycall-permission-actions button{border:1px solid rgba(255,255,255,.14);border-radius:999px;padding:11px 18px;color:#fff;background:#292231;font:inherit;font-weight:700;cursor:pointer}
    .naughtycall-permission-actions .primary{background:linear-gradient(135deg,#a72c74,#7540b9)}
  `;
  document.head.append(style);
}

function ensureModal() {
  ensureStyles();
  let overlay = document.querySelector('#naughtycall-permission-overlay');
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = 'naughtycall-permission-overlay';
  overlay.className = 'naughtycall-permission-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `
    <section class="naughtycall-permission-card" role="dialog" aria-modal="true">
      <div class="naughtycall-permission-icon">🎥</div>
      <h2 id="naughtycall-permission-title"></h2>
      <p id="naughtycall-permission-message"></p>
      <div class="naughtycall-permission-actions">
        <button type="button" id="naughtycall-permission-close"></button>
        <button type="button" id="naughtycall-permission-retry" class="primary"></button>
      </div>
    </section>`;
  document.body.append(overlay);
  overlay.querySelector('#naughtycall-permission-close')?.addEventListener('click', () => { overlay.hidden = true; });
  retryButton = overlay.querySelector('#naughtycall-permission-retry');
  retryButton?.addEventListener('click', async () => {
    overlay.hidden = true;
    await primeAndReplay();
  });
  return overlay;
}

function showError(message) {
  const overlay = ensureModal();
  overlay.querySelector('#naughtycall-permission-title').textContent = tr('title');
  overlay.querySelector('#naughtycall-permission-message').textContent = message;
  overlay.querySelector('#naughtycall-permission-close').textContent = tr('close');
  overlay.querySelector('#naughtycall-permission-retry').textContent = tr('retry');
  overlay.hidden = false;
  window.setTimeout(() => retryButton?.focus(), 0);
}

function errorMessage(error) {
  const name = String(error?.name || '');
  if (name === 'NotAllowedError' || name === 'SecurityError') return tr('denied');
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return tr('missingMic');
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') return tr('busy');
  if (name === 'TypeError') return tr('unsupported');
  return tr('generic');
}

function setButtonLabel(label) {
  const button = document.querySelector('#naughtycall-start');
  const target = button?.querySelector('b');
  if (target) target.textContent = label;
}

function installOneShotStream(stream) {
  const mediaDevices = navigator.mediaDevices;
  if (!mediaDevices?.getUserMedia) return false;
  if (!originalGetUserMedia) originalGetUserMedia = mediaDevices.getUserMedia.bind(mediaDevices);
  primedStream = stream;

  mediaDevices.getUserMedia = async function naughtyCallPrimedGetUserMedia(constraints) {
    if (primedStream?.getTracks().some((track) => track.readyState === 'live')) {
      const ready = primedStream;
      primedStream = null;
      mediaDevices.getUserMedia = originalGetUserMedia;
      return ready;
    }
    mediaDevices.getUserMedia = originalGetUserMedia;
    return originalGetUserMedia(constraints);
  };
  return true;
}

async function openPreferredMedia() {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    const error = new Error('MediaDevices unavailable');
    error.name = 'TypeError';
    throw error;
  }

  if (!originalGetUserMedia) originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  const audio = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };

  try {
    return await originalGetUserMedia({ audio, video: true });
  } catch (videoError) {
    // A missing/busy camera must not kill a call when the microphone works.
    try {
      const audioStream = await originalGetUserMedia({ audio, video: false });
      audioStream.__naughtyCallAudioOnly = true;
      return audioStream;
    } catch (audioError) {
      // Preserve the most useful error: permission denial wins, otherwise the
      // microphone error is more important because audio is the minimum call mode.
      if (String(videoError?.name) === 'NotAllowedError') throw videoError;
      throw audioError;
    }
  }
}

async function primeAndReplay() {
  if (busy) return;
  busy = true;
  setButtonLabel(tr('preparing'));
  try {
    const stream = await openPreferredMedia();
    if (!stream.getAudioTracks().length) {
      for (const track of stream.getTracks()) track.stop();
      showError(tr('missingMic'));
      return;
    }

    if (!installOneShotStream(stream)) {
      for (const track of stream.getTracks()) track.stop();
      showError(tr('unsupported'));
      return;
    }

    if (stream.__naughtyCallAudioOnly) {
      // Keep the message visible briefly inside the existing call shell later;
      // the important part is that we do not block the call.
      console.info('[NaughtyCall] camera unavailable; continuing audio-only');
    }

    bypassNextClick = true;
    document.querySelector('#naughtycall-start')?.click();
  } catch (error) {
    console.warn('[NaughtyCall] media preflight failed', error?.name, error?.message);
    showError(errorMessage(error));
  } finally {
    busy = false;
  }
}

document.addEventListener('click', (event) => {
  const button = event.target instanceof Element ? event.target.closest('#naughtycall-start') : null;
  if (!button) return;
  if (bypassNextClick) {
    bypassNextClick = false;
    return;
  }
  if (button.disabled) return;

  // Stop the original NaughtyCall click handler for this first pass. We replay
  // the click after the browser grants media and the live stream is primed.
  event.preventDefault();
  event.stopImmediatePropagation();
  primeAndReplay();
}, true);
