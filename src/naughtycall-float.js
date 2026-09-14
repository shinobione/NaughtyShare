import './naughtycall-float.css';

const POSITION_KEY = 'naughtycall-floating-position-v1';
const EDGE_GAP = 8;

let dragState = null;
let savedPosition = readSavedPosition();
let dragListenersBound = false;

function lang() {
  return document.documentElement.lang?.toLowerCase().startsWith('vi') ? 'vi' : 'fr';
}

function label(fr, vi) {
  return lang() === 'vi' ? vi : fr;
}

function shell() {
  return document.querySelector('#naughtycall-shell');
}

function mediaDialog() {
  return document.querySelector('#media-dialog');
}

function viewerShell() {
  return document.querySelector('.viewer-shell');
}

function viewerVideo() {
  return document.querySelector('#viewer-stage video.viewer-media');
}

function overlayNodes() {
  return [
    document.querySelector('#naughtycall-shell'),
    document.querySelector('#naughtycall-incoming'),
    document.querySelector('#naughtycall-permission-overlay'),
  ].filter(Boolean);
}

function desiredHost() {
  const fullscreen = document.fullscreenElement;
  const viewer = viewerShell();
  if (fullscreen && viewer && fullscreen === viewer) return viewer;

  const dialog = mediaDialog();
  if (dialog?.open) return dialog;
  return document.body;
}

function syncOverlayHost() {
  const host = desiredHost();
  for (const node of overlayNodes()) {
    if (node.parentElement !== host) host.append(node);
  }
  window.requestAnimationFrame(() => {
    applySavedPosition();
    clampCurrentPosition();
  });
}

function readSavedPosition() {
  try {
    const parsed = JSON.parse(localStorage.getItem(POSITION_KEY) || 'null');
    if (
      parsed &&
      Number.isFinite(parsed.x) &&
      Number.isFinite(parsed.y) &&
      parsed.x >= 0 && parsed.x <= 1 &&
      parsed.y >= 0 && parsed.y <= 1
    ) return parsed;
  } catch {
    // Keep the default bottom-right position.
  }
  return null;
}

function writeSavedPosition(value) {
  savedPosition = value;
  try {
    localStorage.setItem(POSITION_KEY, JSON.stringify(value));
  } catch {
    // Position persistence is a convenience only.
  }
}

function availableSpan(size, viewport) {
  return Math.max(0, viewport - size - EDGE_GAP * 2);
}

function positionShellAt(left, top) {
  const call = shell();
  if (!call || call.hidden) return;
  const rect = call.getBoundingClientRect();
  const maxLeft = Math.max(EDGE_GAP, window.innerWidth - rect.width - EDGE_GAP);
  const maxTop = Math.max(EDGE_GAP, window.innerHeight - rect.height - EDGE_GAP);
  const x = Math.min(maxLeft, Math.max(EDGE_GAP, left));
  const y = Math.min(maxTop, Math.max(EDGE_GAP, top));

  call.style.right = 'auto';
  call.style.bottom = 'auto';
  call.style.left = `${Math.round(x)}px`;
  call.style.top = `${Math.round(y)}px`;
}

function applySavedPosition() {
  const call = shell();
  if (!call || call.hidden || !savedPosition) return;
  const rect = call.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const spanX = availableSpan(rect.width, window.innerWidth);
  const spanY = availableSpan(rect.height, window.innerHeight);
  positionShellAt(
    EDGE_GAP + spanX * savedPosition.x,
    EDGE_GAP + spanY * savedPosition.y,
  );
}

function saveCurrentPosition() {
  const call = shell();
  if (!call || call.hidden) return;
  const rect = call.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const spanX = availableSpan(rect.width, window.innerWidth);
  const spanY = availableSpan(rect.height, window.innerHeight);
  writeSavedPosition({
    x: spanX > 0 ? Math.min(1, Math.max(0, (rect.left - EDGE_GAP) / spanX)) : 0,
    y: spanY > 0 ? Math.min(1, Math.max(0, (rect.top - EDGE_GAP) / spanY)) : 0,
  });
}

function clampCurrentPosition() {
  const call = shell();
  if (!call || call.hidden) return;
  const rect = call.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  if (!call.style.left && !call.style.top) return;
  positionShellAt(rect.left, rect.top);
}

function beginDrag(event) {
  if (event.pointerType === 'mouse' && event.button !== 0) return;

  const activeShell = shell();
  if (!activeShell || activeShell.hidden) return;

  const rect = activeShell.getBoundingClientRect();
  dragState = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    left: rect.left,
    top: rect.top,
  };

  positionShellAt(rect.left, rect.top);
  activeShell.classList.add('is-dragging');
  document.documentElement.classList.add('naughtycall-drag-active');

  event.preventDefault();
  event.stopPropagation();
}

function moveDrag(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) return;

  positionShellAt(
    dragState.left + event.clientX - dragState.startX,
    dragState.top + event.clientY - dragState.startY,
  );

  if (event.cancelable) event.preventDefault();
}

function finishDrag(event = null) {
  if (!dragState) return;
  if (event?.pointerId != null && event.pointerId !== dragState.pointerId) return;

  shell()?.classList.remove('is-dragging');
  document.documentElement.classList.remove('naughtycall-drag-active');
  dragState = null;
  saveCurrentPosition();
}

function bindGlobalDragEvents() {
  if (dragListenersBound) return;
  dragListenersBound = true;

  // Track the pointer at window level. The handle is intentionally small, and
  // browser top-layer dialogs/fullscreen can otherwise stop dispatching moves
  // to the handle as soon as the cursor leaves its bounds.
  window.addEventListener('pointermove', moveDrag, { capture: true, passive: false });
  window.addEventListener('pointerup', finishDrag, true);
  window.addEventListener('pointercancel', finishDrag, true);
  window.addEventListener('blur', () => finishDrag());
}

function ensureDragHandle() {
  const call = shell();
  if (!call || call.querySelector('.naughtycall-drag-handle')) return;

  const handle = document.createElement('button');
  handle.type = 'button';
  handle.className = 'naughtycall-drag-handle';
  handle.textContent = '⠿';
  handle.title = label('Déplacer NaughtyCall', 'Di chuyển NaughtyCall');
  handle.setAttribute('aria-label', handle.title);
  call.prepend(handle);

  handle.addEventListener('pointerdown', beginDrag);
  handle.addEventListener('dragstart', (event) => event.preventDefault());
}

function prepareViewerVideo() {
  const video = viewerVideo();
  const button = ensureFullscreenButton();
  if (!video) {
    if (button) button.hidden = true;
    return;
  }

  if (video.controlsList?.add) {
    if (!video.controlsList.contains('nofullscreen')) video.controlsList.add('nofullscreen');
  } else {
    const tokens = new Set((video.getAttribute('controlsList') || '').split(/\s+/).filter(Boolean));
    tokens.add('nofullscreen');
    video.setAttribute('controlsList', Array.from(tokens).join(' '));
  }
  if (button) button.hidden = false;
}

function ensureFullscreenButton() {
  const actions = document.querySelector('.viewer-actions');
  if (!actions) return null;

  let button = actions.querySelector('#naughtycall-viewer-fullscreen');
  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.id = 'naughtycall-viewer-fullscreen';
    button.className = 'naughtycall-fullscreen-action';
    button.textContent = '⛶';
    const close = actions.querySelector('#viewer-close');
    actions.insertBefore(button, close || null);
    button.addEventListener('click', toggleManagedFullscreen);
  }

  const fullscreen = document.fullscreenElement === viewerShell();
  button.title = fullscreen
    ? label('Quitter le plein écran', 'Thoát toàn màn hình')
    : label('Plein écran', 'Toàn màn hình');
  button.setAttribute('aria-label', button.title);
  return button;
}

async function toggleManagedFullscreen() {
  const viewer = viewerShell();
  if (!viewer || !viewerVideo()) return;

  try {
    if (document.fullscreenElement === viewer) {
      await document.exitFullscreen();
      return;
    }

    if (document.fullscreenElement) await document.exitFullscreen();
    for (const node of overlayNodes()) {
      if (node.parentElement !== viewer) viewer.append(node);
    }
    await viewer.requestFullscreen({ navigationUI: 'hide' });
  } catch (error) {
    console.warn('[NaughtyCall] viewer fullscreen failed', error);
    syncOverlayHost();
  }
}

function interceptVideoDoubleClick(event) {
  const video = event.target instanceof Element ? event.target.closest('#viewer-stage video.viewer-media') : null;
  if (!video) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  toggleManagedFullscreen();
}

function observeUi() {
  const rootObserver = new MutationObserver(() => {
    ensureDragHandle();
    prepareViewerVideo();
    syncOverlayHost();
  });
  rootObserver.observe(document.body, { childList: true, subtree: true });

  const dialog = mediaDialog();
  if (dialog) {
    const dialogObserver = new MutationObserver(syncOverlayHost);
    dialogObserver.observe(dialog, { attributes: true, attributeFilter: ['open'] });
    dialog.addEventListener('close', syncOverlayHost);
  }
}

function refreshLanguageLabels() {
  const handle = document.querySelector('.naughtycall-drag-handle');
  if (handle) {
    handle.title = label('Déplacer NaughtyCall', 'Di chuyển NaughtyCall');
    handle.setAttribute('aria-label', handle.title);
  }
  ensureFullscreenButton();
}

function init() {
  bindGlobalDragEvents();
  ensureDragHandle();
  prepareViewerVideo();
  syncOverlayHost();
  observeUi();

  document.addEventListener('fullscreenchange', () => {
    finishDrag();
    syncOverlayHost();
    ensureFullscreenButton();
  });
  document.addEventListener('dblclick', interceptVideoDoubleClick, true);
  window.addEventListener('resize', () => {
    if (savedPosition) applySavedPosition();
    else clampCurrentPosition();
  });

  const languageObserver = new MutationObserver(refreshLanguageLabels);
  languageObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();
