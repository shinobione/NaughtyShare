const PENDING_UPLOAD_KEY = 'naughtyshare-v1-pending-upload';
let checking = false;
let timer = null;

function readPending() {
  try {
    const value = JSON.parse(localStorage.getItem(PENDING_UPLOAD_KEY) || 'null');
    return value?.id ? value : null;
  } catch {
    return null;
  }
}

function clearPending() {
  try {
    localStorage.removeItem(PENDING_UPLOAD_KEY);
  } catch {
    // Best effort only.
  }
}

function message() {
  return document.documentElement.lang?.toLowerCase().startsWith('vi')
    ? 'Tệp tải trước đã được hoàn tất trong kho.'
    : 'Le gros envoi précédent était déjà finalisé dans le coffre.';
}

function idleMessage() {
  return document.documentElement.lang?.toLowerCase().startsWith('vi')
    ? 'Tệp >95 MB dùng nhiều phần song song và có thể tiếp tục sau khi tải lại trang.'
    : 'Les fichiers >95 Mo utilisent des blocs parallèles et peuvent reprendre après un rechargement.';
}

function syncPanel() {
  const status = document.querySelector('#v1-upload-status');
  const resume = document.querySelector('#v1-resume');
  const abandon = document.querySelector('#v1-abandon');
  if (status) status.textContent = idleMessage();
  if (resume) resume.hidden = true;
  if (abandon) abandon.hidden = true;
}

async function reconcile() {
  if (checking) return;
  const pending = readPending();
  if (!pending) return;
  checking = true;
  try {
    const response = await fetch('/api/media', {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) return;
    const data = await response.json();
    const committed = Array.isArray(data?.items) && data.items.some((item) => item.id === pending.id);
    if (!committed) return;

    clearPending();
    syncPanel();
    const note = document.querySelector('#upload-note');
    if (note) {
      note.dataset.state = 'ok';
      note.textContent = message();
    }
    window.dispatchEvent(new CustomEvent('naughtyshare:v1-upload-reconciled', { detail: { id: pending.id } }));
  } catch {
    // Retry later. A lost completion response must never cause an automatic re-upload.
  } finally {
    checking = false;
  }
}

function init() {
  reconcile();
  timer = window.setInterval(reconcile, 5000);
  window.addEventListener('online', reconcile);
  window.addEventListener('beforeunload', () => {
    if (timer) window.clearInterval(timer);
  }, { once: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
