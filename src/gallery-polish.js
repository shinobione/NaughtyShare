import './gallery-polish.css';

const APP_VERSION = '0.7.0';
const VIEW_KEY = 'naughtyshare-gallery-view';
const VIEWS = new Set(['comfort', 'masonry', 'compact']);

const copy = {
  fr: {
    viewAria: 'Mode d’affichage de la galerie',
    comfort: 'Confort',
    masonry: 'Mosaïque',
    compact: 'Compact',
    select: 'Sélectionner',
    done: 'Terminer',
    selected: (count) => `${count} sélectionné${count > 1 ? 's' : ''}`,
    selectVisible: 'Tout visible',
    clear: 'Aucun',
    addTo: 'Ajouter à…',
    removeFrom: (name) => `Retirer de ${name}`,
    assignTitle: 'Ajouter la sélection aux Moments',
    assignHint: 'Choisis une ou plusieurs cartes. Les médias restent aussi dans le coffre principal.',
    noCollections: 'Crée d’abord un Moment, une Collection ou un Thème.',
    cancel: 'Annuler',
    apply: 'Ajouter',
    applying: (done, total) => `Classement · ${done}/${total}…`,
    added: (count, collections) => `${count} média${count > 1 ? 's' : ''} ajouté${count > 1 ? 's' : ''} à ${collections} carte${collections > 1 ? 's' : ''}.`,
    removed: (count, name) => `${count} média${count > 1 ? 's' : ''} retiré${count > 1 ? 's' : ''} de ${name}.`,
    selectMedia: 'Sélectionner ce média',
    close: 'Fermer',
  },
  vi: {
    viewAria: 'Chế độ hiển thị thư viện',
    comfort: 'Thoải mái',
    masonry: 'Khảm ảnh',
    compact: 'Gọn',
    select: 'Chọn',
    done: 'Xong',
    selected: (count) => `Đã chọn ${count} mục`,
    selectVisible: 'Chọn tất cả đang hiện',
    clear: 'Bỏ chọn',
    addTo: 'Thêm vào…',
    removeFrom: (name) => `Gỡ khỏi ${name}`,
    assignTitle: 'Thêm lựa chọn vào Khoảnh khắc',
    assignHint: 'Chọn một hoặc nhiều thẻ. Nội dung vẫn được giữ trong kho chính.',
    noCollections: 'Hãy tạo Khoảnh khắc, Bộ sưu tập hoặc Chủ đề trước.',
    cancel: 'Hủy',
    apply: 'Thêm',
    applying: (done, total) => `Đang sắp xếp · ${done}/${total}…`,
    added: (count, collections) => `Đã thêm ${count} mục vào ${collections} thẻ.`,
    removed: (count, name) => `Đã gỡ ${count} mục khỏi ${name}.`,
    selectMedia: 'Chọn nội dung này',
    close: 'Đóng',
  },
};

let state = { collections: [] };
let selected = new Set();
let selectMode = false;
let viewMode = loadView();
let decorating = false;
let masonryFrame = 0;
let galleryObserver = null;
let resizeObserver = null;
let busy = false;

function lang() {
  return document.documentElement.lang?.toLowerCase().startsWith('vi') ? 'vi' : 'fr';
}

function tr(key, ...args) {
  const value = copy[lang()][key];
  return typeof value === 'function' ? value(...args) : value;
}

function loadView() {
  try {
    const saved = localStorage.getItem(VIEW_KEY);
    if (VIEWS.has(saved)) return saved;
  } catch {
    // Session fallback below.
  }
  return 'comfort';
}

function saveView(value) {
  try {
    localStorage.setItem(VIEW_KEY, value);
  } catch {
    // View still changes for this session.
  }
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');
  if (typeof options.body === 'string' && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(path, { ...options, headers, cache: 'no-store' });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.error || `HTTP ${response.status}`);
  }
  return response.status === 204 ? null : response.json();
}

function setNotice(message, stateName = 'ok') {
  const note = document.querySelector('#upload-note');
  if (!note) return;
  note.dataset.state = stateName;
  note.textContent = message;
}

function ensureVersion() {
  const footer = document.querySelector('#footer-version');
  if (footer) footer.textContent = `NaughtyShare v${APP_VERSION}`;
}

function injectToolbar() {
  const toolbar = document.querySelector('#gallery-toolbar');
  if (!toolbar || document.querySelector('#gallery-polish-toolbar')) return;

  const polish = document.createElement('div');
  polish.id = 'gallery-polish-toolbar';
  polish.className = 'gallery-polish-toolbar';
  polish.innerHTML = `
    <div class="gallery-view-switch" id="gallery-view-switch" role="group">
      <button type="button" data-gallery-view="comfort"><span>▦</span><b></b></button>
      <button type="button" data-gallery-view="masonry"><span>▥</span><b></b></button>
      <button type="button" data-gallery-view="compact"><span>▦</span><b></b></button>
    </div>
    <button class="gallery-select-mode" id="gallery-select-mode" type="button"><span>✓</span><b></b></button>
  `;
  toolbar.insertAdjacentElement('afterend', polish);

  polish.querySelectorAll('[data-gallery-view]').forEach((button) => {
    button.addEventListener('click', () => setViewMode(button.dataset.galleryView));
  });
  polish.querySelector('#gallery-select-mode')?.addEventListener('click', () => setSelectMode(!selectMode));
}

function injectBulkBar() {
  if (document.querySelector('#bulk-selection-bar')) return;
  const bar = document.createElement('aside');
  bar.id = 'bulk-selection-bar';
  bar.className = 'bulk-selection-bar';
  bar.hidden = true;
  bar.innerHTML = `
    <div class="bulk-selection-count"><strong></strong><small></small></div>
    <div class="bulk-selection-actions">
      <button id="bulk-select-visible" type="button"></button>
      <button id="bulk-clear" type="button"></button>
      <button id="bulk-remove-current" class="bulk-soft-danger" type="button" hidden></button>
      <button id="bulk-add" class="bulk-primary" type="button"></button>
    </div>
  `;
  document.body.append(bar);
  bar.querySelector('#bulk-select-visible')?.addEventListener('click', selectAllVisible);
  bar.querySelector('#bulk-clear')?.addEventListener('click', clearSelection);
  bar.querySelector('#bulk-add')?.addEventListener('click', openAssignDialog);
  bar.querySelector('#bulk-remove-current')?.addEventListener('click', removeFromCurrentCollection);
}

function injectAssignDialog() {
  if (document.querySelector('#bulk-assign-dialog')) return;
  const dialog = document.createElement('dialog');
  dialog.id = 'bulk-assign-dialog';
  dialog.className = 'library-dialog bulk-assign-dialog';
  dialog.innerHTML = `
    <form class="library-dialog-shell" id="bulk-assign-form" method="dialog">
      <header>
        <div><h3 id="bulk-assign-title"></h3><p id="bulk-assign-hint"></p></div>
        <button class="library-dialog-close" id="bulk-assign-close-x" type="button">×</button>
      </header>
      <div class="library-dialog-body"><div class="bulk-collection-list" id="bulk-collection-list"></div></div>
      <footer>
        <button class="library-secondary" id="bulk-assign-cancel" type="button"></button>
        <button class="library-save" id="bulk-assign-save" type="submit"></button>
      </footer>
    </form>
  `;
  document.body.append(dialog);
  dialog.querySelector('#bulk-assign-close-x')?.addEventListener('click', () => dialog.close());
  dialog.querySelector('#bulk-assign-cancel')?.addEventListener('click', () => dialog.close());
  dialog.querySelector('#bulk-assign-form')?.addEventListener('submit', saveAssignments);
}

function visibleCards() {
  return Array.from(document.querySelectorAll('#gallery .media-card')).filter((card) => {
    return !card.hidden && !card.classList.contains('is-library-hidden') && getComputedStyle(card).display !== 'none';
  });
}

function activeCollection() {
  const id = document.querySelector('#collection-strip .collection-card.is-active')?.dataset.collectionId;
  if (!id || id === 'all' || id === 'favorites') return null;
  return state.collections.find((entry) => entry.id === id) || null;
}

function decorateCard(card) {
  const id = card.dataset.mediaId;
  if (!id) return;

  let toggle = card.querySelector('.bulk-card-toggle');
  if (!toggle) {
    toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'bulk-card-toggle';
    toggle.innerHTML = '<span>✓</span>';
    toggle.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      setSelectMode(true);
      toggleSelected(id);
    });
    card.append(toggle);
  }

  toggle.title = tr('selectMedia');
  toggle.setAttribute('aria-label', tr('selectMedia'));
  toggle.setAttribute('aria-pressed', String(selected.has(id)));
  card.classList.toggle('is-bulk-selected', selected.has(id));
}

function decorateCards() {
  if (decorating) return;
  decorating = true;
  try {
    document.querySelectorAll('#gallery .media-card').forEach(decorateCard);
    updateSelectionUi();
    scheduleMasonry();
  } finally {
    decorating = false;
  }
}

function toggleSelected(id) {
  if (selected.has(id)) selected.delete(id);
  else selected.add(id);
  decorateCards();
}

function clearSelection() {
  selected.clear();
  decorateCards();
}

function selectAllVisible() {
  for (const card of visibleCards()) {
    if (card.dataset.mediaId) selected.add(card.dataset.mediaId);
  }
  decorateCards();
}

function setSelectMode(enabled) {
  selectMode = Boolean(enabled);
  if (!selectMode) selected.clear();
  document.body.classList.toggle('bulk-select-mode', selectMode);
  updateSelectionUi();
  decorateCards();
}

function updateSelectionUi() {
  const bar = document.querySelector('#bulk-selection-bar');
  const mode = document.querySelector('#gallery-select-mode');
  if (bar) bar.hidden = !selectMode;
  if (mode) {
    mode.classList.toggle('is-active', selectMode);
    mode.setAttribute('aria-pressed', String(selectMode));
    const label = mode.querySelector('b');
    if (label) label.textContent = selectMode ? tr('done') : tr('select');
  }
  document.querySelectorAll('.bulk-card-toggle').forEach((button) => {
    button.hidden = !selectMode;
  });
  const count = document.querySelector('.bulk-selection-count strong');
  if (count) count.textContent = tr('selected', selected.size);
  const hint = document.querySelector('.bulk-selection-count small');
  if (hint) hint.textContent = selectMode ? tr('selectVisible') : '';
  const selectVisible = document.querySelector('#bulk-select-visible');
  if (selectVisible) selectVisible.textContent = tr('selectVisible');
  const clear = document.querySelector('#bulk-clear');
  if (clear) clear.textContent = tr('clear');
  const add = document.querySelector('#bulk-add');
  if (add) {
    add.textContent = tr('addTo');
    add.disabled = selected.size === 0 || !state.collections.length || busy;
  }
  const current = activeCollection();
  const remove = document.querySelector('#bulk-remove-current');
  if (remove) {
    remove.hidden = !current;
    remove.disabled = selected.size === 0 || busy;
    if (current) remove.textContent = tr('removeFrom', current.name);
  }
}

function renderAssignDialog() {
  const root = document.querySelector('#bulk-collection-list');
  if (!root) return;
  root.replaceChildren();

  if (!state.collections.length) {
    const empty = document.createElement('p');
    empty.className = 'bulk-assign-empty';
    empty.textContent = tr('noCollections');
    root.append(empty);
    return;
  }

  for (const collection of state.collections) {
    const label = document.createElement('label');
    label.className = 'bulk-collection-choice';
    label.innerHTML = `
      <input type="checkbox" value="${collection.id}" />
      <span class="bulk-collection-icon">${collection.icon || '♡'}</span>
      <span><strong></strong><small></small></span>
    `;
    label.querySelector('strong').textContent = collection.name;
    label.querySelector('small').textContent = `${collection.itemCount ?? collection.mediaIds?.length ?? 0}`;
    root.append(label);
  }
}

async function openAssignDialog() {
  if (!selected.size || busy) return;
  await reloadState().catch(() => {});
  renderAssignDialog();
  applyLanguage();
  document.querySelector('#bulk-assign-dialog')?.showModal();
}

async function runPool(tasks, concurrency = 5, onProgress = () => {}) {
  let cursor = 0;
  let done = 0;
  async function worker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= tasks.length) return;
      await tasks[index]();
      done += 1;
      onProgress(done, tasks.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()));
}

async function saveAssignments(event) {
  event.preventDefault();
  if (!selected.size || busy) return;
  const collectionIds = Array.from(document.querySelectorAll('#bulk-collection-list input:checked')).map((input) => input.value);
  if (!collectionIds.length) return;

  const mediaIds = [...selected];
  const tasks = [];
  for (const collectionId of collectionIds) {
    for (const mediaId of mediaIds) {
      tasks.push(() => api(`/api/library/collections/${encodeURIComponent(collectionId)}/items/${encodeURIComponent(mediaId)}`, { method: 'PUT' }));
    }
  }

  busy = true;
  updateSelectionUi();
  try {
    await runPool(tasks, 5, (done, total) => setNotice(tr('applying', done, total), 'working'));
    document.querySelector('#bulk-assign-dialog')?.close();
    setNotice(tr('added', mediaIds.length, collectionIds.length), 'ok');
    setSelectMode(false);
    window.setTimeout(() => window.location.reload(), 450);
  } catch (error) {
    setNotice(error instanceof Error ? error.message : 'Bulk assignment failed', 'error');
  } finally {
    busy = false;
    updateSelectionUi();
  }
}

async function removeFromCurrentCollection() {
  const collection = activeCollection();
  if (!collection || !selected.size || busy) return;
  const mediaIds = [...selected];
  const tasks = mediaIds.map((mediaId) => () => api(
    `/api/library/collections/${encodeURIComponent(collection.id)}/items/${encodeURIComponent(mediaId)}`,
    { method: 'DELETE' },
  ));

  busy = true;
  updateSelectionUi();
  try {
    await runPool(tasks, 5, (done, total) => setNotice(tr('applying', done, total), 'working'));
    setNotice(tr('removed', mediaIds.length, collection.name), 'ok');
    setSelectMode(false);
    window.setTimeout(() => window.location.reload(), 450);
  } catch (error) {
    setNotice(error instanceof Error ? error.message : 'Bulk removal failed', 'error');
  } finally {
    busy = false;
    updateSelectionUi();
  }
}

function setViewMode(mode) {
  if (!VIEWS.has(mode)) return;
  viewMode = mode;
  saveView(mode);
  const gallery = document.querySelector('#gallery');
  if (gallery) gallery.dataset.galleryView = mode;
  document.querySelectorAll('[data-gallery-view]').forEach((button) => {
    const active = button.dataset.galleryView === mode;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  if (mode !== 'masonry') {
    document.querySelectorAll('#gallery .media-card').forEach((card) => card.style.removeProperty('grid-row-end'));
  }
  scheduleMasonry();
}

function scheduleMasonry() {
  if (viewMode !== 'masonry') return;
  if (masonryFrame) cancelAnimationFrame(masonryFrame);
  masonryFrame = requestAnimationFrame(() => {
    masonryFrame = 0;
    layoutMasonry();
  });
}

function layoutMasonry() {
  const gallery = document.querySelector('#gallery');
  if (!gallery || viewMode !== 'masonry') return;
  const style = getComputedStyle(gallery);
  const row = Number.parseFloat(style.gridAutoRows) || 8;
  const gap = Number.parseFloat(style.rowGap) || 10;
  for (const card of Array.from(gallery.querySelectorAll('.media-card'))) {
    if (card.hidden || card.classList.contains('is-library-hidden')) continue;
    card.style.gridRowEnd = 'auto';
    const height = card.getBoundingClientRect().height;
    const span = Math.max(1, Math.ceil((height + gap) / (row + gap)));
    card.style.gridRowEnd = `span ${span}`;
  }
}

async function reloadState() {
  const data = await api('/api/library/state');
  state = { collections: Array.isArray(data?.collections) ? data.collections : [] };
  updateSelectionUi();
}

function applyLanguage() {
  ensureVersion();
  const view = document.querySelector('#gallery-view-switch');
  if (view) view.setAttribute('aria-label', tr('viewAria'));
  const labels = {
    comfort: tr('comfort'),
    masonry: tr('masonry'),
    compact: tr('compact'),
  };
  document.querySelectorAll('[data-gallery-view]').forEach((button) => {
    const label = labels[button.dataset.galleryView] || '';
    const text = button.querySelector('b');
    if (text) text.textContent = label;
    button.title = label;
  });
  const title = document.querySelector('#bulk-assign-title');
  if (title) title.textContent = tr('assignTitle');
  const hint = document.querySelector('#bulk-assign-hint');
  if (hint) hint.textContent = tr('assignHint');
  const cancel = document.querySelector('#bulk-assign-cancel');
  if (cancel) cancel.textContent = tr('cancel');
  const apply = document.querySelector('#bulk-assign-save');
  if (apply) apply.textContent = tr('apply');
  const close = document.querySelector('#bulk-assign-close-x');
  if (close) close.setAttribute('aria-label', tr('close'));
  updateSelectionUi();
  decorateCards();
}

function watchGallery() {
  const gallery = document.querySelector('#gallery');
  if (!gallery || galleryObserver) return;
  galleryObserver = new MutationObserver((mutations) => {
    if (mutations.some((mutation) => mutation.type === 'childList')) decorateCards();
    if (mutations.some((mutation) => mutation.type === 'attributes')) scheduleMasonry();
  });
  galleryObserver.observe(gallery, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] });

  if ('ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(scheduleMasonry);
    resizeObserver.observe(gallery);
  }

  gallery.addEventListener('load', scheduleMasonry, true);
}

function watchInteractions() {
  document.addEventListener('click', (event) => {
    if (!selectMode) return;
    const open = event.target.closest?.('.media-open');
    if (!open) return;
    const card = open.closest('.media-card');
    const id = card?.dataset.mediaId;
    if (!id) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    toggleSelected(id);
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && selectMode && !document.querySelector('#bulk-assign-dialog')?.open) {
      setSelectMode(false);
    }
  });

  document.addEventListener('click', (event) => {
    if (event.target.closest?.('.collection-open')) window.setTimeout(updateSelectionUi, 60);
  });
}

async function init() {
  injectToolbar();
  injectBulkBar();
  injectAssignDialog();
  watchGallery();
  watchInteractions();
  setViewMode(viewMode);
  decorateCards();
  ensureVersion();

  const languageObserver = new MutationObserver(() => window.queueMicrotask(applyLanguage));
  languageObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });

  try {
    await reloadState();
  } catch {
    // Core gallery remains available if optional bulk organization state cannot load.
  }
  applyLanguage();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
