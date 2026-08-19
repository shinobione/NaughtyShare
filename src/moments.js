import './moments.css';

const APP_VERSION = '0.6.0';
const BUILTIN_COLLECTIONS = new Set(['all', 'favorites']);

const copy = {
  fr: {
    cover: 'Couverture',
    chooseCover: 'Choisir la couverture',
    autoCover: 'Couverture automatique',
    autoCoverHint: 'Utilise le premier média disponible',
    noMedia: 'Ajoute d’abord des médias à cette carte pour choisir une couverture.',
    moveBefore: 'Déplacer avant',
    moveAfter: 'Déplacer après',
    previousCards: 'Cartes précédentes',
    nextCards: 'Cartes suivantes',
    edit: 'Modifier',
    showAll: 'Tout afficher',
    moment: 'Moment',
    collection: 'Collection',
    theme: 'Thème',
    media: 'média',
    medias: 'médias',
    coverSaved: 'Couverture enregistrée.',
    orderSaved: 'Ordre des cartes enregistré.',
    chooseCoverTitle: 'Choisir la couverture',
    close: 'Fermer',
  },
  vi: {
    cover: 'Ảnh bìa',
    chooseCover: 'Chọn ảnh bìa',
    autoCover: 'Ảnh bìa tự động',
    autoCoverHint: 'Dùng nội dung khả dụng đầu tiên',
    noMedia: 'Hãy thêm ảnh hoặc video vào thẻ này trước khi chọn ảnh bìa.',
    moveBefore: 'Chuyển sang trước',
    moveAfter: 'Chuyển sang sau',
    previousCards: 'Thẻ trước',
    nextCards: 'Thẻ tiếp theo',
    edit: 'Chỉnh sửa',
    showAll: 'Hiện tất cả',
    moment: 'Khoảnh khắc',
    collection: 'Bộ sưu tập',
    theme: 'Chủ đề',
    media: 'mục',
    medias: 'mục',
    coverSaved: 'Đã lưu ảnh bìa.',
    orderSaved: 'Đã lưu thứ tự thẻ.',
    chooseCoverTitle: 'Chọn ảnh bìa',
    close: 'Đóng',
  },
};

let state = { collections: [], mediaMeta: {}, momentsUi: {} };
let mediaIndex = [];
let editingCollectionId = null;
let busy = false;
let decorating = false;
let stripObserver = null;

function lang() {
  return document.documentElement.lang?.toLowerCase().startsWith('vi') ? 'vi' : 'fr';
}

function tr(key) {
  return copy[lang()][key];
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');
  if (typeof options.body === 'string' && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(path, { ...options, headers, cache: 'no-store' });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.error || `HTTP ${response.status}`);
  }
  return response.status === 204 ? null : response.json();
}

function collectionFor(id) {
  return state.collections.find((entry) => entry.id === id) || null;
}

function mediaFor(id) {
  return mediaIndex.find((entry) => entry.id === id) || null;
}

function kindLabel(kind) {
  if (kind === 'moment') return tr('moment');
  if (kind === 'theme') return tr('theme');
  return tr('collection');
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(lang() === 'vi' ? 'vi-VN' : 'fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function itemCountLabel(count) {
  return `${count} ${count === 1 ? tr('media') : tr('medias')}`;
}

function createMediaPreview(media, className) {
  if (!media) return null;
  if (media.contentType?.startsWith('image/')) {
    const image = document.createElement('img');
    image.className = className;
    image.src = media.url;
    image.alt = '';
    image.loading = 'lazy';
    return image;
  }
  if (media.contentType?.startsWith('video/')) {
    const video = document.createElement('video');
    video.className = className;
    video.src = media.url;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    return video;
  }
  return null;
}

function ensureVersion() {
  const footer = document.querySelector('#footer-version');
  if (!footer) return;
  const wanted = `NaughtyShare v${APP_VERSION}`;
  if (footer.textContent !== wanted) footer.textContent = wanted;
  if (!footer.dataset.momentsVersionGuard) {
    footer.dataset.momentsVersionGuard = '1';
    const observer = new MutationObserver(() => {
      if (footer.textContent !== wanted) footer.textContent = wanted;
    });
    observer.observe(footer, { childList: true, characterData: true, subtree: true });
  }
}

function injectRail() {
  const strip = document.querySelector('#collection-strip');
  if (!strip || strip.closest('.moments-rail')) return;

  const rail = document.createElement('div');
  rail.className = 'moments-rail';
  strip.parentNode.insertBefore(rail, strip);

  const prev = document.createElement('button');
  prev.type = 'button';
  prev.className = 'moments-rail-nav moments-rail-prev';
  prev.textContent = '‹';
  prev.setAttribute('aria-label', tr('previousCards'));
  prev.addEventListener('click', () => strip.scrollBy({ left: -Math.max(220, strip.clientWidth * 0.82), behavior: 'smooth' }));

  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'moments-rail-nav moments-rail-next';
  next.textContent = '›';
  next.setAttribute('aria-label', tr('nextCards'));
  next.addEventListener('click', () => strip.scrollBy({ left: Math.max(220, strip.clientWidth * 0.82), behavior: 'smooth' }));

  rail.append(prev, strip, next);

  const focus = document.createElement('section');
  focus.id = 'moments-focus';
  focus.className = 'moments-focus';
  focus.hidden = true;
  rail.insertAdjacentElement('afterend', focus);
}

function injectCoverField() {
  const dialog = document.querySelector('#collection-dialog');
  if (!dialog || dialog.querySelector('#moments-cover-field')) return;
  const body = dialog.querySelector('.library-dialog-body');
  const descriptionField = document.querySelector('#collection-description')?.closest('.library-field');
  if (!body) return;

  const field = document.createElement('div');
  field.id = 'moments-cover-field';
  field.className = 'library-field moments-cover-field';
  field.hidden = true;
  field.innerHTML = `
    <span id="moments-cover-label"></span>
    <button id="moments-cover-button" class="moments-cover-button" type="button">
      <span class="moments-cover-thumb" aria-hidden="true"></span>
      <span class="moments-cover-copy"><strong></strong><small></small></span>
      <span class="moments-cover-chevron">›</span>
    </button>
  `;
  field.querySelector('#moments-cover-button')?.addEventListener('click', openCoverDialog);

  if (descriptionField) descriptionField.insertAdjacentElement('beforebegin', field);
  else body.append(field);
}

function injectCoverDialog() {
  if (document.querySelector('#moments-cover-dialog')) return;
  const dialog = document.createElement('dialog');
  dialog.id = 'moments-cover-dialog';
  dialog.className = 'library-dialog moments-cover-dialog';
  dialog.innerHTML = `
    <div class="library-dialog-shell">
      <header>
        <h3 id="moments-cover-title"></h3>
        <button id="moments-cover-close-x" class="library-dialog-close" type="button">×</button>
      </header>
      <div class="library-dialog-body moments-cover-grid" id="moments-cover-grid"></div>
      <footer>
        <button id="moments-cover-close" class="library-secondary" type="button"></button>
      </footer>
    </div>
  `;
  document.body.append(dialog);
  dialog.querySelector('#moments-cover-close-x')?.addEventListener('click', () => dialog.close());
  dialog.querySelector('#moments-cover-close')?.addEventListener('click', () => dialog.close());
}

function updateCoverField() {
  const field = document.querySelector('#moments-cover-field');
  const button = document.querySelector('#moments-cover-button');
  if (!field || !button) return;

  const collection = editingCollectionId ? collectionFor(editingCollectionId) : null;
  field.hidden = !collection;
  if (!collection) return;

  const label = document.querySelector('#moments-cover-label');
  if (label) label.textContent = tr('cover');
  const strong = button.querySelector('strong');
  const small = button.querySelector('small');
  const thumb = button.querySelector('.moments-cover-thumb');
  if (strong) strong.textContent = tr('chooseCover');

  const media = collection.coverMediaId ? mediaFor(collection.coverMediaId) : null;
  if (small) small.textContent = media?.originalName || tr('autoCoverHint');
  if (thumb) {
    thumb.replaceChildren();
    const preview = createMediaPreview(media, 'moments-cover-thumb-media');
    if (preview) thumb.append(preview);
    else thumb.textContent = collection.icon || '♡';
  }
  button.disabled = !(collection.mediaIds || []).length;
  button.title = button.disabled ? tr('noMedia') : tr('chooseCover');
}

function renderCoverDialog() {
  const dialog = document.querySelector('#moments-cover-dialog');
  const grid = document.querySelector('#moments-cover-grid');
  if (!dialog || !grid || !editingCollectionId) return;
  const collection = collectionFor(editingCollectionId);
  if (!collection) return;

  document.querySelector('#moments-cover-title').textContent = tr('chooseCoverTitle');
  document.querySelector('#moments-cover-close').textContent = tr('close');
  grid.replaceChildren();

  const automatic = document.createElement('button');
  automatic.type = 'button';
  automatic.className = `moments-cover-choice moments-cover-auto${collection.coverMediaId ? '' : ' is-selected'}`;
  automatic.innerHTML = '<span class="moments-cover-auto-icon">✦</span><span><strong></strong><small></small></span>';
  automatic.querySelector('strong').textContent = tr('autoCover');
  automatic.querySelector('small').textContent = tr('autoCoverHint');
  automatic.addEventListener('click', () => saveCover(null));
  grid.append(automatic);

  const members = (collection.mediaIds || []).map(mediaFor).filter(Boolean);
  if (!members.length) {
    const empty = document.createElement('p');
    empty.className = 'moments-cover-empty';
    empty.textContent = tr('noMedia');
    grid.append(empty);
    return;
  }

  for (const media of members) {
    const choice = document.createElement('button');
    choice.type = 'button';
    choice.className = `moments-cover-choice${collection.coverMediaId === media.id ? ' is-selected' : ''}`;
    choice.dataset.mediaId = media.id;
    const preview = createMediaPreview(media, 'moments-cover-choice-media');
    if (preview) choice.append(preview);
    const label = document.createElement('span');
    label.className = 'moments-cover-choice-label';
    label.textContent = media.originalName || media.id;
    choice.append(label);
    choice.addEventListener('click', () => saveCover(media.id));
    grid.append(choice);
  }
}

function openCoverDialog() {
  if (!editingCollectionId) return;
  const collection = collectionFor(editingCollectionId);
  if (!collection || !(collection.mediaIds || []).length) return;
  renderCoverDialog();
  document.querySelector('#moments-cover-dialog')?.showModal();
}

async function saveCover(mediaId) {
  if (!editingCollectionId || busy) return;
  busy = true;
  try {
    await api('/api/library/moments-ui', {
      method: 'PATCH',
      body: JSON.stringify({ covers: { [editingCollectionId]: mediaId } }),
    });
    document.querySelector('#moments-cover-dialog')?.close();
    await reloadState();
    updateCoverField();
    setMainNotice(tr('coverSaved'), 'ok');
  } finally {
    busy = false;
  }
}

function setMainNotice(message, stateName = 'ok') {
  const note = document.querySelector('#upload-note');
  if (!note) return;
  note.dataset.state = stateName;
  note.textContent = message;
}

function ensureDescription(card, collection) {
  const open = card.querySelector('.collection-open');
  if (!open) return;
  let description = open.querySelector('.moments-card-description');
  if (!description) {
    description = document.createElement('span');
    description.className = 'moments-card-description';
    const meta = open.querySelector('.collection-meta');
    if (meta) open.insertBefore(description, meta);
    else open.append(description);
  }
  description.textContent = collection.description || '';
  description.hidden = !collection.description;
}

function ensureOrderControls(card, collection) {
  if (BUILTIN_COLLECTIONS.has(collection.id)) return;
  let controls = card.querySelector('.moments-order-controls');
  if (!controls) {
    controls = document.createElement('div');
    controls.className = 'moments-order-controls';

    const before = document.createElement('button');
    before.type = 'button';
    before.className = 'moments-order-button moments-order-before';
    before.textContent = '‹';
    before.addEventListener('click', (event) => {
      event.stopPropagation();
      moveCollection(collection.id, -1);
    });

    const after = document.createElement('button');
    after.type = 'button';
    after.className = 'moments-order-button moments-order-after';
    after.textContent = '›';
    after.addEventListener('click', (event) => {
      event.stopPropagation();
      moveCollection(collection.id, 1);
    });

    controls.append(before, after);
    card.append(controls);
  }

  const before = controls.querySelector('.moments-order-before');
  const after = controls.querySelector('.moments-order-after');
  if (before) {
    before.title = tr('moveBefore');
    before.setAttribute('aria-label', `${tr('moveBefore')} · ${collection.name}`);
  }
  if (after) {
    after.title = tr('moveAfter');
    after.setAttribute('aria-label', `${tr('moveAfter')} · ${collection.name}`);
  }

  const index = state.collections.findIndex((entry) => entry.id === collection.id);
  if (before) before.disabled = index <= 0;
  if (after) after.disabled = index < 0 || index >= state.collections.length - 1;
}

function replaceCardCover(card, collection) {
  const desired = collection.coverMediaId ? mediaFor(collection.coverMediaId) : null;
  const current = card.querySelector('.collection-cover');
  const currentId = current?.dataset?.momentsMediaId || null;
  const desiredId = desired?.id || null;
  if (currentId === desiredId) return;
  if (current) current.remove();
  if (!desired) return;
  const preview = createMediaPreview(desired, 'collection-cover');
  if (!preview) return;
  preview.dataset.momentsMediaId = desired.id;
  card.insertBefore(preview, card.firstChild);
}

function applyCollectionOrder(strip) {
  const customCards = new Map(
    Array.from(strip.querySelectorAll('.collection-card[data-collection-id]'))
      .map((card) => [card.dataset.collectionId, card]),
  );
  const favorites = customCards.get('favorites');
  let anchor = favorites || customCards.get('all');
  for (const collection of state.collections) {
    const card = customCards.get(collection.id);
    if (!card) continue;
    if (anchor?.nextElementSibling !== card) anchor?.insertAdjacentElement('afterend', card);
    anchor = card;
  }
}

function decorateStrip() {
  const strip = document.querySelector('#collection-strip');
  if (!strip || decorating) return;
  decorating = true;
  try {
    applyCollectionOrder(strip);
    for (const collection of state.collections) {
      const card = strip.querySelector(`.collection-card[data-collection-id="${CSS.escape(collection.id)}"]`);
      if (!card) continue;
      replaceCardCover(card, collection);
      ensureDescription(card, collection);
      ensureOrderControls(card, collection);
    }
    syncFocusPanel();
  } finally {
    decorating = false;
  }
}

async function moveCollection(id, delta) {
  if (busy) return;
  const ids = state.collections.map((entry) => entry.id);
  const index = ids.indexOf(id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= ids.length) return;
  [ids[index], ids[target]] = [ids[target], ids[index]];

  busy = true;
  try {
    await api('/api/library/moments-ui', {
      method: 'PATCH',
      body: JSON.stringify({ collectionOrder: ids }),
    });
    await reloadState();
    setMainNotice(tr('orderSaved'), 'ok');
    document.querySelector(`.collection-card[data-collection-id="${CSS.escape(id)}"]`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    });
  } finally {
    busy = false;
  }
}

function activeCollectionId() {
  const active = document.querySelector('#collection-strip .collection-card.is-active');
  return active?.dataset.collectionId || 'all';
}

function syncFocusPanel() {
  const panel = document.querySelector('#moments-focus');
  if (!panel) return;
  const id = activeCollectionId();
  const collection = collectionFor(id);
  if (!collection) {
    panel.hidden = true;
    panel.replaceChildren();
    return;
  }

  panel.hidden = false;
  panel.replaceChildren();
  panel.className = `moments-focus tone-${Number(collection.tone) || 0}`;

  const media = collection.coverMediaId ? mediaFor(collection.coverMediaId) : null;
  const preview = createMediaPreview(media, 'moments-focus-cover');
  if (preview) panel.append(preview);

  const shade = document.createElement('span');
  shade.className = 'moments-focus-shade';
  panel.append(shade);

  const content = document.createElement('div');
  content.className = 'moments-focus-content';
  const kind = document.createElement('span');
  kind.className = 'moments-focus-kind';
  kind.textContent = kindLabel(collection.kind);
  const name = document.createElement('strong');
  name.className = 'moments-focus-name';
  name.textContent = collection.name;
  const description = document.createElement('span');
  description.className = 'moments-focus-description';
  description.textContent = collection.description || '';
  description.hidden = !collection.description;
  const meta = document.createElement('span');
  meta.className = 'moments-focus-meta';
  meta.textContent = [itemCountLabel(collection.mediaIds?.length || 0), formatDate(collection.eventDate)].filter(Boolean).join(' · ');
  content.append(kind, name, description, meta);
  panel.append(content);

  const actions = document.createElement('div');
  actions.className = 'moments-focus-actions';
  const cover = document.createElement('button');
  cover.type = 'button';
  cover.className = 'moments-focus-button';
  cover.textContent = tr('cover');
  cover.addEventListener('click', () => {
    editingCollectionId = collection.id;
    openCoverDialog();
  });
  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'moments-focus-button';
  edit.textContent = tr('edit');
  edit.addEventListener('click', () => {
    document.querySelector(`.collection-card[data-collection-id="${CSS.escape(collection.id)}"] .collection-edit`)?.click();
  });
  const all = document.createElement('button');
  all.type = 'button';
  all.className = 'moments-focus-button moments-focus-button-soft';
  all.textContent = tr('showAll');
  all.addEventListener('click', () => document.querySelector('.collection-card[data-collection-id="all"] .collection-open')?.click());
  actions.append(cover, edit, all);
  panel.append(actions);
}

function scrollActiveCardIntoView() {
  window.setTimeout(() => {
    const active = document.querySelector('#collection-strip .collection-card.is-active');
    active?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    syncFocusPanel();
  }, 80);
}

function watchInteractions() {
  document.addEventListener('click', (event) => {
    const edit = event.target.closest?.('.collection-edit');
    if (edit) {
      editingCollectionId = edit.closest('.collection-card')?.dataset.collectionId || null;
      window.setTimeout(updateCoverField, 0);
      return;
    }

    if (event.target.closest?.('#library-new')) {
      editingCollectionId = null;
      window.setTimeout(updateCoverField, 0);
      return;
    }

    if (event.target.closest?.('.collection-open')) scrollActiveCardIntoView();
  }, true);

  const collectionDialog = document.querySelector('#collection-dialog');
  collectionDialog?.addEventListener('close', () => {
    editingCollectionId = null;
    updateCoverField();
    window.setTimeout(reloadState, 50);
  });
}

function observeStrip() {
  const strip = document.querySelector('#collection-strip');
  if (!strip || stripObserver) return;
  stripObserver = new MutationObserver(() => window.requestAnimationFrame(decorateStrip));
  stripObserver.observe(strip, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
}

function applyLanguage() {
  ensureVersion();
  const prev = document.querySelector('.moments-rail-prev');
  const next = document.querySelector('.moments-rail-next');
  if (prev) prev.setAttribute('aria-label', tr('previousCards'));
  if (next) next.setAttribute('aria-label', tr('nextCards'));
  updateCoverField();
  if (document.querySelector('#moments-cover-dialog')?.open) renderCoverDialog();
  decorateStrip();
}

async function reloadState() {
  const [library, media] = await Promise.all([
    api('/api/library/state'),
    api('/api/media'),
  ]);
  state = {
    collections: Array.isArray(library?.collections) ? library.collections : [],
    mediaMeta: library?.mediaMeta && typeof library.mediaMeta === 'object' ? library.mediaMeta : {},
    momentsUi: library?.momentsUi && typeof library.momentsUi === 'object' ? library.momentsUi : {},
  };
  mediaIndex = Array.isArray(media?.items) ? media.items : [];
  decorateStrip();
  updateCoverField();
}

async function init() {
  injectRail();
  injectCoverField();
  injectCoverDialog();
  watchInteractions();
  observeStrip();
  ensureVersion();

  const langObserver = new MutationObserver(() => window.queueMicrotask(applyLanguage));
  langObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });

  try {
    await reloadState();
  } catch {
    // Core gallery remains usable if the optional presentation layer is unavailable.
  }
  applyLanguage();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
