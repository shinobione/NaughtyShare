import './library.css';

const APP_VERSION = '0.5.0';
const MAX_DIRECT_BYTES = 95 * 1024 * 1024;
const MAX_LARGE_BYTES = 5 * 1024 * 1024 * 1024;
const ICONS = ['♡', '✦', '☾', '⚡', '✿', '∞'];

const copy = {
  fr: {
    organize: 'ORGANISER',
    title: 'Moments & collections',
    intro: 'Rangez vos médias dans de jolies cartes : Moments, thèmes libres, favoris et collections privées.',
    newCollection: '+ Nouveau moment',
    search: 'Rechercher nom ou légende…',
    all: 'Tout',
    allKind: 'Galerie',
    favorites: 'Favoris',
    favoritesKind: 'Automatique',
    item: 'média',
    items: 'médias',
    clearFilter: 'Tout afficher',
    noResults: 'Aucun média ne correspond à ce filtre.',
    createTitle: 'Créer un moment',
    editTitle: 'Modifier la carte',
    name: 'Nom',
    namePlaceholder: 'Ex. NuNu, LuLu, KuKu, PuPu…',
    kind: 'Type',
    moment: 'Moment',
    collection: 'Collection',
    theme: 'Thème',
    date: 'Date',
    description: 'Description',
    descriptionPlaceholder: 'Une note pour vous deux…',
    icon: 'Icône',
    tone: 'Ambiance',
    cancel: 'Annuler',
    save: 'Enregistrer',
    delete: 'Supprimer',
    deleteCollectionConfirm: 'Supprimer cette carte ? Les médias resteront dans le coffre.',
    captionTitle: 'Légende & date',
    caption: 'Légende',
    captionPlaceholder: 'Votre petite note privée…',
    mediaDate: 'Date du moment',
    organizeMedia: 'Ajouter aux collections',
    organizeTitle: 'Classer ce média',
    noCollections: 'Aucune collection personnalisée pour le moment.',
    favorite: 'Favori',
    captionAction: 'Légende',
    collectionsAction: 'Collections',
    filterPrefix: 'Affichage',
    shown: 'affichés',
    largeReady: 'Photos & vidéos · jusqu’à 5 Go/fichier',
    uploadPreparing: 'Préparation du gros envoi…',
    uploadPart: (name, percent, part, total) => `${name} · ${percent}% · bloc ${part}/${total}`,
    uploadFinishing: 'Finalisation dans le coffre…',
    uploadDone: (count) => `${count} fichier${count > 1 ? 's' : ''} ajouté${count > 1 ? 's' : ''} au coffre.`,
    uploadTooLarge: (name) => `${name} dépasse la limite NaughtyShare de 5 Go.`,
    uploadUnsupported: (name) => `${name} n’est pas une image ou une vidéo reconnue.`,
    uploadFailed: 'Échec de l’envoi. Tu peux réessayer sans créer de doublon.',
    version: `NaughtyShare v${APP_VERSION}`,
  },
  vi: {
    organize: 'SẮP XẾP',
    title: 'Khoảnh khắc & bộ sưu tập',
    intro: 'Sắp xếp ảnh và video vào các thẻ đẹp: khoảnh khắc, chủ đề, mục yêu thích và bộ sưu tập riêng.',
    newCollection: '+ Khoảnh khắc mới',
    search: 'Tìm theo tên hoặc chú thích…',
    all: 'Tất cả',
    allKind: 'Thư viện',
    favorites: 'Yêu thích',
    favoritesKind: 'Tự động',
    item: 'mục',
    items: 'mục',
    clearFilter: 'Hiện tất cả',
    noResults: 'Không có nội dung phù hợp với bộ lọc này.',
    createTitle: 'Tạo khoảnh khắc',
    editTitle: 'Chỉnh sửa thẻ',
    name: 'Tên',
    namePlaceholder: 'Ví dụ NuNu, LuLu, KuKu, PuPu…',
    kind: 'Loại',
    moment: 'Khoảnh khắc',
    collection: 'Bộ sưu tập',
    theme: 'Chủ đề',
    date: 'Ngày',
    description: 'Mô tả',
    descriptionPlaceholder: 'Một ghi chú riêng cho hai người…',
    icon: 'Biểu tượng',
    tone: 'Phong cách',
    cancel: 'Hủy',
    save: 'Lưu',
    delete: 'Xóa',
    deleteCollectionConfirm: 'Xóa thẻ này? Ảnh và video vẫn được giữ trong kho.',
    captionTitle: 'Chú thích & ngày',
    caption: 'Chú thích',
    captionPlaceholder: 'Ghi chú riêng của hai người…',
    mediaDate: 'Ngày của khoảnh khắc',
    organizeMedia: 'Thêm vào bộ sưu tập',
    organizeTitle: 'Sắp xếp nội dung này',
    noCollections: 'Chưa có bộ sưu tập tùy chỉnh.',
    favorite: 'Yêu thích',
    captionAction: 'Chú thích',
    collectionsAction: 'Bộ sưu tập',
    filterPrefix: 'Hiển thị',
    shown: 'đang hiển thị',
    largeReady: 'Ảnh & video · tối đa 5 GB/tệp',
    uploadPreparing: 'Đang chuẩn bị tải tệp lớn…',
    uploadPart: (name, percent, part, total) => `${name} · ${percent}% · phần ${part}/${total}`,
    uploadFinishing: 'Đang hoàn tất trong kho…',
    uploadDone: (count) => `Đã thêm ${count} tệp vào kho.`,
    uploadTooLarge: (name) => `${name} vượt quá giới hạn 5 GB của NaughtyShare.`,
    uploadUnsupported: (name) => `${name} không phải ảnh hoặc video được hỗ trợ.`,
    uploadFailed: 'Tải lên thất bại. Có thể thử lại mà không tạo bản sao trùng.',
    version: `NaughtyShare v${APP_VERSION}`,
  },
};

let libraryState = { collections: [], mediaMeta: {} };
let mediaIndex = [];
let activeFilter = 'all';
let editingCollectionId = null;
let editingMediaId = null;
let assigningMediaId = null;
let selectedIcon = '♡';
let selectedTone = 0;

function lang() {
  return document.documentElement.lang?.toLowerCase().startsWith('vi') ? 'vi' : 'fr';
}

function tr(key, ...args) {
  const value = copy[lang()][key];
  return typeof value === 'function' ? value(...args) : value;
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');
  if (options.body && typeof options.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(path, { ...options, headers, cache: 'no-store' });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.error || `HTTP ${response.status}`);
  }
  return response.status === 204 ? null : response.json();
}

function safeMediaById(id) {
  return mediaIndex.find((item) => item.id === id) || null;
}

function metaFor(id) {
  return libraryState.mediaMeta[id] || { favorite: false, caption: '', eventDate: null };
}

function collectionFor(id) {
  return libraryState.collections.find((entry) => entry.id === id) || null;
}

function kindLabel(kind) {
  if (kind === 'moment') return tr('moment');
  if (kind === 'theme') return tr('theme');
  return tr('collection');
}

function itemCountLabel(count) {
  return `${count} ${count === 1 ? tr('item') : tr('items')}`;
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

function injectLibraryUi() {
  const gallerySection = document.querySelector('.gallery-section');
  if (!gallerySection || document.querySelector('#library-section')) return;

  gallerySection.insertAdjacentHTML('beforebegin', `
    <section class="library-section" id="library-section">
      <div class="library-head">
        <div class="library-title-wrap">
          <p class="eyebrow" id="library-eyebrow"></p>
          <h2 id="library-title"></h2>
          <p id="library-intro"></p>
        </div>
        <div class="library-tools">
          <button class="library-new" id="library-new" type="button"></button>
          <label class="library-search">
            <input id="library-search" type="search" autocomplete="off" />
            <span>⌕</span>
          </label>
        </div>
      </div>
      <div class="collection-strip" id="collection-strip" aria-label="Moments et collections"></div>
      <div class="library-filter-status" id="library-filter-status"></div>
    </section>
  `);

  const gallery = document.querySelector('#gallery');
  if (gallery) {
    gallery.insertAdjacentHTML('beforebegin', '<p class="library-filter-status" id="library-no-results" hidden></p>');
  }

  document.querySelector('#library-new')?.addEventListener('click', () => openCollectionDialog());
  document.querySelector('#library-search')?.addEventListener('input', applyFilters);
}

function injectDialogs() {
  if (document.querySelector('#collection-dialog')) return;
  document.body.insertAdjacentHTML('beforeend', `
    <dialog class="library-dialog" id="collection-dialog">
      <form class="library-dialog-shell" id="collection-form" method="dialog">
        <header>
          <h3 id="collection-dialog-title"></h3>
          <button class="library-dialog-close" type="button" data-close="collection-dialog">×</button>
        </header>
        <div class="library-dialog-body">
          <div class="library-field">
            <label for="collection-name" id="collection-name-label"></label>
            <input id="collection-name" maxlength="80" required />
          </div>
          <div class="library-grid-2">
            <div class="library-field">
              <label for="collection-kind" id="collection-kind-label"></label>
              <select id="collection-kind">
                <option value="moment"></option>
                <option value="collection"></option>
                <option value="theme"></option>
              </select>
            </div>
            <div class="library-field">
              <label for="collection-date" id="collection-date-label"></label>
              <input id="collection-date" type="date" />
            </div>
          </div>
          <div class="library-field">
            <span id="collection-icon-label"></span>
            <div class="library-icon-picker" id="collection-icons"></div>
          </div>
          <div class="library-field">
            <span id="collection-tone-label"></span>
            <div class="library-tone-picker" id="collection-tones"></div>
          </div>
          <div class="library-field">
            <label for="collection-description" id="collection-description-label"></label>
            <textarea id="collection-description" maxlength="500"></textarea>
          </div>
        </div>
        <footer>
          <button class="library-danger" id="collection-delete" type="button" hidden></button>
          <button class="library-secondary" type="button" data-close="collection-dialog" id="collection-cancel"></button>
          <button class="library-save" id="collection-save" type="submit"></button>
        </footer>
      </form>
    </dialog>

    <dialog class="library-dialog" id="caption-dialog">
      <form class="library-dialog-shell" id="caption-form" method="dialog">
        <header>
          <h3 id="caption-dialog-title"></h3>
          <button class="library-dialog-close" type="button" data-close="caption-dialog">×</button>
        </header>
        <div class="library-dialog-body">
          <div class="library-field">
            <label for="caption-text" id="caption-label"></label>
            <textarea id="caption-text" maxlength="1200"></textarea>
          </div>
          <div class="library-field">
            <label for="caption-date" id="caption-date-label"></label>
            <input id="caption-date" type="date" />
          </div>
        </div>
        <footer>
          <button class="library-secondary" type="button" data-close="caption-dialog" id="caption-cancel"></button>
          <button class="library-save" type="submit" id="caption-save"></button>
        </footer>
      </form>
    </dialog>

    <dialog class="library-dialog" id="assign-dialog">
      <form class="library-dialog-shell" id="assign-form" method="dialog">
        <header>
          <h3 id="assign-dialog-title"></h3>
          <button class="library-dialog-close" type="button" data-close="assign-dialog">×</button>
        </header>
        <div class="library-dialog-body">
          <div class="collection-check-list" id="assign-list"></div>
        </div>
        <footer>
          <button class="library-secondary" type="button" data-close="assign-dialog" id="assign-cancel"></button>
          <button class="library-save" type="submit" id="assign-save"></button>
        </footer>
      </form>
    </dialog>
  `);

  document.querySelectorAll('[data-close]').forEach((button) => {
    button.addEventListener('click', () => document.querySelector(`#${button.dataset.close}`)?.close());
  });

  document.querySelector('#collection-form')?.addEventListener('submit', saveCollection);
  document.querySelector('#collection-delete')?.addEventListener('click', deleteEditingCollection);
  document.querySelector('#caption-form')?.addEventListener('submit', saveCaption);
  document.querySelector('#assign-form')?.addEventListener('submit', saveAssignments);
}

function renderPickers() {
  const iconRoot = document.querySelector('#collection-icons');
  const toneRoot = document.querySelector('#collection-tones');
  if (!iconRoot || !toneRoot) return;

  iconRoot.replaceChildren();
  ICONS.forEach((icon) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `library-chip${selectedIcon === icon ? ' is-active' : ''}`;
    button.textContent = icon;
    button.addEventListener('click', () => {
      selectedIcon = icon;
      renderPickers();
    });
    iconRoot.append(button);
  });

  toneRoot.replaceChildren();
  for (let tone = 0; tone < 6; tone += 1) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `library-chip${selectedTone === tone ? ' is-active' : ''}`;
    button.innerHTML = `<span class="library-tone-swatch tone-${tone}"></span>`;
    button.addEventListener('click', () => {
      selectedTone = tone;
      renderPickers();
    });
    toneRoot.append(button);
  }
}

function renderCollectionCard({ id, name, kind, icon, tone = 0, itemCount = 0, coverMediaId = null, eventDate = null, editable = true }) {
  const card = document.createElement('article');
  card.className = `collection-card tone-${Number(tone) || 0}${activeFilter === id ? ' is-active' : ''}`;
  card.dataset.collectionId = id;

  if (coverMediaId) {
    const media = safeMediaById(coverMediaId);
    if (media?.contentType?.startsWith('image/')) {
      const cover = document.createElement('img');
      cover.className = 'collection-cover';
      cover.src = media.url;
      cover.alt = '';
      cover.loading = 'lazy';
      card.append(cover);
    } else if (media?.contentType?.startsWith('video/')) {
      const cover = document.createElement('video');
      cover.className = 'collection-cover';
      cover.src = media.url;
      cover.muted = true;
      cover.playsInline = true;
      cover.preload = 'metadata';
      card.append(cover);
    }
  }

  const shade = document.createElement('span');
  shade.className = 'collection-shade';
  card.append(shade);

  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'collection-open';
  open.innerHTML = `
    <span class="collection-icon">${icon || '♡'}</span>
    <span class="collection-kind"></span>
    <span class="collection-name"></span>
    <span class="collection-meta"></span>
  `;
  open.querySelector('.collection-kind').textContent = kind;
  open.querySelector('.collection-name').textContent = name;
  open.querySelector('.collection-meta').textContent = [itemCountLabel(itemCount), formatDate(eventDate)].filter(Boolean).join(' · ');
  open.addEventListener('click', () => {
    activeFilter = id;
    renderCollections();
    applyFilters();
  });
  card.append(open);

  if (editable) {
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'collection-edit';
    edit.textContent = '•••';
    edit.setAttribute('aria-label', `${tr('editTitle')} · ${name}`);
    edit.addEventListener('click', () => openCollectionDialog(id));
    card.append(edit);
  }

  return card;
}

function renderCollections() {
  const root = document.querySelector('#collection-strip');
  if (!root) return;
  root.replaceChildren();

  const allCover = mediaIndex[0]?.id || null;
  root.append(renderCollectionCard({
    id: 'all',
    name: tr('all'),
    kind: tr('allKind'),
    icon: '∞',
    tone: 5,
    itemCount: mediaIndex.length,
    coverMediaId: allCover,
    editable: false,
  }));

  const favoriteIds = Object.entries(libraryState.mediaMeta)
    .filter(([, meta]) => meta?.favorite === true)
    .map(([id]) => id);
  root.append(renderCollectionCard({
    id: 'favorites',
    name: tr('favorites'),
    kind: tr('favoritesKind'),
    icon: '♡',
    tone: 0,
    itemCount: favoriteIds.length,
    coverMediaId: favoriteIds[0] || null,
    editable: false,
  }));

  for (const collection of libraryState.collections) {
    root.append(renderCollectionCard({
      ...collection,
      kind: kindLabel(collection.kind),
      itemCount: collection.mediaIds?.length || 0,
      coverMediaId: collection.coverMediaId || collection.mediaIds?.[0] || null,
      editable: true,
    }));
  }
}

function currentFilterLabel() {
  if (activeFilter === 'favorites') return tr('favorites');
  if (activeFilter === 'all') return tr('all');
  return collectionFor(activeFilter)?.name || tr('all');
}

function applyFilters() {
  const query = document.querySelector('#library-search')?.value?.trim().toLocaleLowerCase(lang() === 'vi' ? 'vi-VN' : 'fr-FR') || '';
  const cards = Array.from(document.querySelectorAll('#gallery .media-card'));
  const activeCollection = collectionFor(activeFilter);
  let visible = 0;

  for (const card of cards) {
    const id = card.dataset.mediaId;
    const meta = metaFor(id);
    const name = card.querySelector('.media-name')?.textContent || safeMediaById(id)?.originalName || '';
    const haystack = `${name}\n${meta.caption || ''}`.toLocaleLowerCase(lang() === 'vi' ? 'vi-VN' : 'fr-FR');

    let included = true;
    if (activeFilter === 'favorites') included = meta.favorite === true;
    else if (activeCollection) included = (activeCollection.mediaIds || []).includes(id);
    if (query) included = included && haystack.includes(query);

    card.classList.toggle('is-library-hidden', !included);
    if (included) visible += 1;
  }

  const status = document.querySelector('#library-filter-status');
  if (status) {
    const hasFilter = activeFilter !== 'all' || Boolean(query);
    status.innerHTML = `<span>${tr('filterPrefix')} · <strong></strong> · ${visible}/${cards.length} ${tr('shown')}</span>`;
    status.querySelector('strong').textContent = currentFilterLabel();
    if (hasFilter) {
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.className = 'library-filter-clear';
      clear.textContent = tr('clearFilter');
      clear.addEventListener('click', () => {
        activeFilter = 'all';
        const input = document.querySelector('#library-search');
        if (input) input.value = '';
        renderCollections();
        applyFilters();
      });
      status.append(clear);
    }
  }

  const noResults = document.querySelector('#library-no-results');
  if (noResults) {
    noResults.hidden = !(cards.length > 0 && visible === 0);
    noResults.textContent = tr('noResults');
  }

  const count = document.querySelector('#media-count');
  if (count && cards.length) count.textContent = `${visible} / ${cards.length}`;
}

function decorateCard(card) {
  const id = card.dataset.mediaId;
  if (!id) return;
  const meta = metaFor(id);

  if (!card.classList.contains('library-decorated')) {
    card.classList.add('library-decorated');

    const favorite = document.createElement('button');
    favorite.type = 'button';
    favorite.className = 'favorite-toggle';
    favorite.dataset.libraryFavorite = id;
    favorite.addEventListener('click', async () => {
      favorite.disabled = true;
      try {
        const next = !(metaFor(id).favorite === true);
        const data = await api(`/api/library/media/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ favorite: next }),
        });
        libraryState.mediaMeta[id] = data.meta;
        decorateAllCards();
        renderCollections();
        applyFilters();
      } finally {
        favorite.disabled = false;
      }
    });
    card.append(favorite);

    const actions = card.querySelector('.media-card-actions');
    if (actions) {
      const caption = document.createElement('button');
      caption.type = 'button';
      caption.className = 'meta-action';
      caption.textContent = '✎';
      caption.dataset.captionAction = id;
      caption.addEventListener('click', () => openCaptionDialog(id));

      const folders = document.createElement('button');
      folders.type = 'button';
      folders.className = 'meta-action';
      folders.textContent = '▣';
      folders.dataset.collectionAction = id;
      folders.addEventListener('click', () => openAssignDialog(id));

      actions.prepend(folders);
      actions.prepend(caption);
    }

    const name = card.querySelector('.media-name');
    if (name) {
      const captionLine = document.createElement('span');
      captionLine.className = 'media-caption';
      captionLine.dataset.libraryCaption = id;
      name.insertAdjacentElement('afterend', captionLine);

      const dateLine = document.createElement('span');
      dateLine.className = 'media-event-date';
      dateLine.dataset.libraryDate = id;
      captionLine.insertAdjacentElement('afterend', dateLine);
    }
  }

  card.classList.toggle('is-favorite', meta.favorite === true);
  const favorite = card.querySelector(`[data-library-favorite="${CSS.escape(id)}"]`);
  if (favorite) {
    favorite.textContent = meta.favorite ? '♥' : '♡';
    favorite.classList.toggle('is-active', meta.favorite === true);
    favorite.title = tr('favorite');
    favorite.setAttribute('aria-label', tr('favorite'));
  }

  const captionAction = card.querySelector(`[data-caption-action="${CSS.escape(id)}"]`);
  if (captionAction) captionAction.title = tr('captionAction');
  const collectionAction = card.querySelector(`[data-collection-action="${CSS.escape(id)}"]`);
  if (collectionAction) collectionAction.title = tr('collectionsAction');

  const captionLine = card.querySelector(`[data-library-caption="${CSS.escape(id)}"]`);
  if (captionLine) {
    captionLine.textContent = meta.caption || '';
    captionLine.hidden = !meta.caption;
  }
  const dateLine = card.querySelector(`[data-library-date="${CSS.escape(id)}"]`);
  if (dateLine) {
    dateLine.textContent = formatDate(meta.eventDate);
    dateLine.hidden = !meta.eventDate;
  }
}

function decorateAllCards() {
  document.querySelectorAll('#gallery .media-card').forEach(decorateCard);
  applyFilters();
}

function watchGallery() {
  const gallery = document.querySelector('#gallery');
  if (!gallery) return;
  const observer = new MutationObserver(() => {
    window.requestAnimationFrame(() => decorateAllCards());
  });
  observer.observe(gallery, { childList: true });
  decorateAllCards();
}

function openCollectionDialog(id = null) {
  editingCollectionId = id;
  const collection = id ? collectionFor(id) : null;
  selectedIcon = collection?.icon || '♡';
  selectedTone = Number(collection?.tone || 0);

  document.querySelector('#collection-name').value = collection?.name || '';
  document.querySelector('#collection-kind').value = collection?.kind || 'moment';
  document.querySelector('#collection-date').value = collection?.eventDate || '';
  document.querySelector('#collection-description').value = collection?.description || '';
  document.querySelector('#collection-delete').hidden = !collection;
  renderPickers();
  applyLibraryLanguage();
  document.querySelector('#collection-dialog')?.showModal();
  window.setTimeout(() => document.querySelector('#collection-name')?.focus(), 0);
}

async function saveCollection(event) {
  event.preventDefault();
  const payload = {
    name: document.querySelector('#collection-name').value,
    kind: document.querySelector('#collection-kind').value,
    eventDate: document.querySelector('#collection-date').value || null,
    description: document.querySelector('#collection-description').value,
    icon: selectedIcon,
    tone: selectedTone,
  };

  const data = editingCollectionId
    ? await api(`/api/library/collections/${encodeURIComponent(editingCollectionId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
    : await api('/api/library/collections', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

  if (editingCollectionId) {
    const index = libraryState.collections.findIndex((entry) => entry.id === editingCollectionId);
    const previous = index >= 0 ? libraryState.collections[index] : null;
    if (index >= 0) libraryState.collections[index] = { ...previous, ...data.collection };
  } else {
    libraryState.collections.unshift({ ...data.collection, mediaIds: [] });
  }

  document.querySelector('#collection-dialog')?.close();
  renderCollections();
  applyFilters();
}

async function deleteEditingCollection() {
  if (!editingCollectionId) return;
  if (!window.confirm(tr('deleteCollectionConfirm'))) return;
  await api(`/api/library/collections/${encodeURIComponent(editingCollectionId)}`, { method: 'DELETE' });
  libraryState.collections = libraryState.collections.filter((entry) => entry.id !== editingCollectionId);
  if (activeFilter === editingCollectionId) activeFilter = 'all';
  document.querySelector('#collection-dialog')?.close();
  renderCollections();
  applyFilters();
}

function openCaptionDialog(id) {
  editingMediaId = id;
  const meta = metaFor(id);
  document.querySelector('#caption-text').value = meta.caption || '';
  document.querySelector('#caption-date').value = meta.eventDate || '';
  applyLibraryLanguage();
  document.querySelector('#caption-dialog')?.showModal();
}

async function saveCaption(event) {
  event.preventDefault();
  if (!editingMediaId) return;
  const data = await api(`/api/library/media/${encodeURIComponent(editingMediaId)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      caption: document.querySelector('#caption-text').value,
      eventDate: document.querySelector('#caption-date').value || null,
    }),
  });
  libraryState.mediaMeta[editingMediaId] = data.meta;
  document.querySelector('#caption-dialog')?.close();
  decorateAllCards();
}

function openAssignDialog(id) {
  assigningMediaId = id;
  const root = document.querySelector('#assign-list');
  root.replaceChildren();

  if (!libraryState.collections.length) {
    const empty = document.createElement('p');
    empty.textContent = tr('noCollections');
    empty.style.color = 'var(--muted)';
    root.append(empty);
  } else {
    for (const collection of libraryState.collections) {
      const label = document.createElement('label');
      label.className = 'collection-check';
      const checked = (collection.mediaIds || []).includes(id);
      label.innerHTML = `
        <input type="checkbox" value="${collection.id}" ${checked ? 'checked' : ''} />
        <span><strong></strong><small></small></span>
      `;
      label.querySelector('strong').textContent = collection.name;
      label.querySelector('small').textContent = kindLabel(collection.kind);
      root.append(label);
    }
  }

  applyLibraryLanguage();
  document.querySelector('#assign-dialog')?.showModal();
}

async function saveAssignments(event) {
  event.preventDefault();
  if (!assigningMediaId) return;
  const selected = new Set(Array.from(document.querySelectorAll('#assign-list input:checked')).map((input) => input.value));

  for (const collection of libraryState.collections) {
    const has = (collection.mediaIds || []).includes(assigningMediaId);
    const wants = selected.has(collection.id);
    if (has === wants) continue;

    await api(`/api/library/collections/${encodeURIComponent(collection.id)}/items/${encodeURIComponent(assigningMediaId)}`, {
      method: wants ? 'PUT' : 'DELETE',
    });

    if (wants) collection.mediaIds = [...(collection.mediaIds || []), assigningMediaId];
    else collection.mediaIds = (collection.mediaIds || []).filter((id) => id !== assigningMediaId);
    collection.itemCount = collection.mediaIds.length;
    collection.coverMediaId = collection.mediaIds[0] || null;
  }

  document.querySelector('#assign-dialog')?.close();
  renderCollections();
  applyFilters();
}

function enableViewerSwipe() {
  const stage = document.querySelector('#viewer-stage');
  if (!stage) return;
  let startX = 0;
  let startY = 0;
  let startedOnVideo = false;

  stage.addEventListener('touchstart', (event) => {
    const touch = event.changedTouches[0];
    if (!touch) return;
    startX = touch.clientX;
    startY = touch.clientY;
    startedOnVideo = event.target instanceof HTMLVideoElement;
  }, { passive: true });

  stage.addEventListener('touchend', (event) => {
    if (startedOnVideo) return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 1.25) return;
    if (dx < 0) document.querySelector('#viewer-next')?.click();
    else document.querySelector('#viewer-prev')?.click();
  }, { passive: true });
}

function setUploadProgress(name, percent, detail) {
  let panel = document.querySelector('#large-upload-progress');
  if (!panel) {
    panel = document.createElement('div');
    panel.className = 'large-upload-progress';
    panel.id = 'large-upload-progress';
    panel.innerHTML = '<strong></strong><small></small><div class="large-upload-bar"><span></span></div>';
    document.body.append(panel);
  }
  panel.querySelector('strong').textContent = name;
  panel.querySelector('small').textContent = detail;
  panel.querySelector('.large-upload-bar > span').style.width = `${Math.max(0, Math.min(100, percent))}%`;
}

function clearUploadProgress() {
  document.querySelector('#large-upload-progress')?.remove();
}

function setMainNotice(message, state = 'working') {
  const note = document.querySelector('#upload-note');
  if (!note) return;
  note.dataset.state = state;
  note.textContent = message;
}

function validLocalFile(file) {
  return file.type?.startsWith('image/') || file.type?.startsWith('video/');
}

async function uploadDirectFile(file, index, total) {
  setMainNotice(`${index}/${total} · ${file.name}…`, 'working');
  const response = await fetch('/api/media', {
    method: 'POST',
    headers: {
      'Content-Type': file.type,
      'X-File-Name': encodeURIComponent(file.name),
      Accept: 'application/json',
    },
    body: file,
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
}

async function uploadLargeFile(file) {
  const start = await api('/api/library/uploads', {
    method: 'POST',
    body: JSON.stringify({
      name: file.name,
      contentType: file.type,
      sizeBytes: file.size,
    }),
  });

  const partSize = Number(start.partSizeBytes);
  const totalParts = Math.ceil(file.size / partSize);
  const parts = [];
  setUploadProgress(file.name, 0, tr('uploadPreparing'));

  try {
    for (let index = 0; index < totalParts; index += 1) {
      const partNumber = index + 1;
      const begin = index * partSize;
      const end = Math.min(file.size, begin + partSize);
      const blob = file.slice(begin, end);
      const response = await api(`/api/library/uploads/${encodeURIComponent(start.id)}/parts/${partNumber}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Part-Size': String(blob.size),
        },
        body: blob,
      });
      parts.push(response);
      const percent = Math.round((end / file.size) * 100);
      setUploadProgress(file.name, percent, tr('uploadPart', file.name, percent, partNumber, totalParts));
    }

    setUploadProgress(file.name, 100, tr('uploadFinishing'));
    await api(`/api/library/uploads/${encodeURIComponent(start.id)}/complete`, {
      method: 'POST',
      body: JSON.stringify({ parts }),
    });
  } catch (error) {
    await fetch(`/api/library/uploads/${encodeURIComponent(start.id)}`, {
      method: 'DELETE',
      headers: { Accept: 'application/json' },
    }).catch(() => {});
    throw error;
  }
}

function enableLargeUploads() {
  const fileInput = document.querySelector('#file-input');
  const deviceUpload = document.querySelector('#device-upload');
  if (!fileInput) return;

  fileInput.addEventListener('change', async (event) => {
    const files = Array.from(fileInput.files || []);
    if (!files.some((file) => file.size > MAX_DIRECT_BYTES)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    if (deviceUpload) deviceUpload.disabled = true;

    try {
      for (const file of files) {
        if (!validLocalFile(file)) throw new Error(tr('uploadUnsupported', file.name));
        if (file.size > MAX_LARGE_BYTES) throw new Error(tr('uploadTooLarge', file.name));
      }

      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        if (file.size > MAX_DIRECT_BYTES) await uploadLargeFile(file);
        else await uploadDirectFile(file, index + 1, files.length);
      }

      setMainNotice(tr('uploadDone', files.length), 'ok');
      clearUploadProgress();
      window.setTimeout(() => window.location.reload(), 650);
    } catch (error) {
      clearUploadProgress();
      setMainNotice(error instanceof Error ? error.message : tr('uploadFailed'), 'error');
      if (deviceUpload) deviceUpload.disabled = false;
      fileInput.value = '';
    }
  }, true);
}

function applyLibraryLanguage() {
  const eyebrow = document.querySelector('#library-eyebrow');
  const title = document.querySelector('#library-title');
  const intro = document.querySelector('#library-intro');
  const create = document.querySelector('#library-new');
  const search = document.querySelector('#library-search');
  if (eyebrow) eyebrow.textContent = tr('organize');
  if (title) title.textContent = tr('title');
  if (intro) intro.textContent = tr('intro');
  if (create) create.textContent = tr('newCollection');
  if (search) search.placeholder = tr('search');

  const deviceSubtitle = document.querySelector('#device-subtitle');
  if (deviceSubtitle) deviceSubtitle.textContent = tr('largeReady');
  const footerVersion = document.querySelector('#footer-version');
  if (footerVersion) footerVersion.textContent = tr('version');

  const collectionTitle = document.querySelector('#collection-dialog-title');
  if (collectionTitle) collectionTitle.textContent = editingCollectionId ? tr('editTitle') : tr('createTitle');
  const setText = (selector, value) => {
    const node = document.querySelector(selector);
    if (node) node.textContent = value;
  };
  setText('#collection-name-label', tr('name'));
  const collectionName = document.querySelector('#collection-name');
  if (collectionName) collectionName.placeholder = tr('namePlaceholder');
  setText('#collection-kind-label', tr('kind'));
  setText('#collection-date-label', tr('date'));
  setText('#collection-icon-label', tr('icon'));
  setText('#collection-tone-label', tr('tone'));
  setText('#collection-description-label', tr('description'));
  const description = document.querySelector('#collection-description');
  if (description) description.placeholder = tr('descriptionPlaceholder');
  const kind = document.querySelector('#collection-kind');
  if (kind) {
    kind.options[0].textContent = tr('moment');
    kind.options[1].textContent = tr('collection');
    kind.options[2].textContent = tr('theme');
  }
  setText('#collection-delete', tr('delete'));
  setText('#collection-cancel', tr('cancel'));
  setText('#collection-save', tr('save'));

  setText('#caption-dialog-title', tr('captionTitle'));
  setText('#caption-label', tr('caption'));
  setText('#caption-date-label', tr('mediaDate'));
  const caption = document.querySelector('#caption-text');
  if (caption) caption.placeholder = tr('captionPlaceholder');
  setText('#caption-cancel', tr('cancel'));
  setText('#caption-save', tr('save'));

  setText('#assign-dialog-title', tr('organizeTitle'));
  setText('#assign-cancel', tr('cancel'));
  setText('#assign-save', tr('save'));

  renderCollections();
  decorateAllCards();
}

async function loadState() {
  const [state, media] = await Promise.all([
    api('/api/library/state'),
    api('/api/media'),
  ]);
  libraryState = {
    collections: Array.isArray(state?.collections) ? state.collections : [],
    mediaMeta: state?.mediaMeta && typeof state.mediaMeta === 'object' ? state.mediaMeta : {},
  };
  mediaIndex = Array.isArray(media?.items) ? media.items : [];
  renderCollections();
  decorateAllCards();
}

function observeLanguage() {
  const observer = new MutationObserver(() => window.queueMicrotask(applyLibraryLanguage));
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
}

async function init() {
  injectLibraryUi();
  injectDialogs();
  enableViewerSwipe();
  enableLargeUploads();
  watchGallery();
  observeLanguage();
  applyLibraryLanguage();

  try {
    await loadState();
  } catch {
    // The core vault stays fully usable if organization metadata is temporarily unavailable.
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
