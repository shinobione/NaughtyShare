const CAPTURE_SORT_KEY = 'naughtyshare-capture-sort-active';

function captureSortActive() {
  try {
    return localStorage.getItem(CAPTURE_SORT_KEY) === '1';
  } catch {
    return document.querySelector('#sort-field')?.value === 'capture';
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

function syncViewer() {
  // Capture-sort navigation is already owned by capture.js + viewer-order-fix.js.
  if (captureSortActive()) return;
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

function moveWithinVisible(delta) {
  if (captureSortActive()) return false;
  const dialog = document.querySelector('#media-dialog');
  if (!dialog?.open) return false;

  const current = currentViewerId();
  const ids = visibleIds();
  if (!current || !ids.includes(current)) return false;

  // Returning true here deliberately blocks the base viewer from escaping a
  // filtered set when only one item is visible.
  if (ids.length <= 1) {
    syncViewer();
    return true;
  }

  const index = ids.indexOf(current);
  const nextId = ids[(index + delta + ids.length) % ids.length];
  const open = document.querySelector(`#gallery .media-card[data-media-id="${CSS.escape(nextId)}"] .media-open`);
  if (!open) return false;
  open.click();
  window.setTimeout(syncViewer, 0);
  return true;
}

function setupNavigationGuard() {
  document.addEventListener('click', (event) => {
    const nav = event.target.closest?.('#viewer-prev, #viewer-next');
    if (!nav) return;
    const delta = nav.id === 'viewer-prev' ? -1 : 1;
    if (!moveWithinVisible(delta)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  window.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    if (!moveWithinVisible(event.key === 'ArrowLeft' ? -1 : 1)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
}

function setupObservers() {
  const gallery = document.querySelector('#gallery');
  if (gallery) {
    new MutationObserver(() => window.requestAnimationFrame(syncViewer))
      .observe(gallery, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'hidden'],
      });
  }

  const stage = document.querySelector('#viewer-stage');
  if (stage) {
    new MutationObserver(() => window.requestAnimationFrame(syncViewer))
      .observe(stage, { childList: true });
  }

  document.addEventListener('click', (event) => {
    if (event.target.closest?.(
      '.collection-open, .library-filter-clear, [data-timeline-quick], [data-timeline-month], [data-timeline-day], #timeline-reset',
    )) {
      window.setTimeout(syncViewer, 0);
    }
  });

  document.addEventListener('change', (event) => {
    if (event.target?.matches?.('#sort-field, #timeline-collection')) window.setTimeout(syncViewer, 0);
  });

  document.querySelector('#sort-direction')?.addEventListener('click', () => window.setTimeout(syncViewer, 0));
  document.querySelector('#library-search')?.addEventListener('input', () => window.requestAnimationFrame(syncViewer));
}

function init() {
  setupNavigationGuard();
  setupObservers();
  syncViewer();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
