const CAPTURE_SORT_KEY = 'naughtyshare-capture-sort-active';

function captureSortActive() {
  try {
    return localStorage.getItem(CAPTURE_SORT_KEY) === '1';
  } catch {
    return false;
  }
}

function currentViewerId() {
  const media = document.querySelector('#viewer-stage .viewer-media');
  if (!media?.src) return null;
  try {
    const path = new URL(media.src, window.location.href).pathname;
    if (!path.startsWith('/media/')) return null;
    return decodeURIComponent(path.slice('/media/'.length));
  } catch {
    return null;
  }
}

function visibleIds() {
  return Array.from(document.querySelectorAll('#gallery .media-card'))
    .filter((card) => {
      if (card.hidden || card.classList.contains('is-library-hidden')) return false;
      return getComputedStyle(card).display !== 'none';
    })
    .map((card) => card.dataset.mediaId)
    .filter(Boolean);
}

function syncCaptureViewer() {
  if (!captureSortActive()) return;
  const dialog = document.querySelector('#media-dialog');
  if (!dialog?.open) return;

  const current = currentViewerId();
  const ids = visibleIds();
  const index = current ? ids.indexOf(current) : -1;
  if (index < 0) return;

  const position = document.querySelector('#viewer-position');
  if (position) position.textContent = `${index + 1} / ${ids.length}`;

  const disabled = ids.length <= 1;
  const prev = document.querySelector('#viewer-prev');
  const next = document.querySelector('#viewer-next');
  if (prev) prev.disabled = disabled;
  if (next) next.disabled = disabled;
}

function shouldBlockBaseNavigation() {
  if (!captureSortActive()) return false;
  const dialog = document.querySelector('#media-dialog');
  if (!dialog?.open) return false;
  const current = currentViewerId();
  if (!current) return false;
  const ids = visibleIds();
  return ids.includes(current) && ids.length <= 1;
}

function setupNavigationGuard() {
  document.addEventListener('click', (event) => {
    const navigation = event.target.closest?.('#viewer-prev, #viewer-next');
    if (!navigation || !shouldBlockBaseNavigation()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    syncCaptureViewer();
  }, true);

  window.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    if (!shouldBlockBaseNavigation()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    syncCaptureViewer();
  }, true);
}

function setupObservers() {
  const gallery = document.querySelector('#gallery');
  if (gallery) {
    new MutationObserver(() => window.requestAnimationFrame(syncCaptureViewer))
      .observe(gallery, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'hidden'],
      });
  }

  const stage = document.querySelector('#viewer-stage');
  if (stage) {
    new MutationObserver(() => window.requestAnimationFrame(syncCaptureViewer))
      .observe(stage, { childList: true });
  }

  document.querySelector('#sort-field')?.addEventListener('change', () => {
    window.requestAnimationFrame(syncCaptureViewer);
  });
  document.querySelector('#sort-direction')?.addEventListener('click', () => {
    window.requestAnimationFrame(syncCaptureViewer);
  });

  document.addEventListener('click', (event) => {
    if (event.target.closest?.('.collection-open, .library-filter-clear')) {
      window.setTimeout(syncCaptureViewer, 0);
    }
  });

  document.querySelector('#library-search')?.addEventListener('input', () => {
    window.requestAnimationFrame(syncCaptureViewer);
  });
}

function init() {
  setupNavigationGuard();
  setupObservers();
  syncCaptureViewer();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
