import './styles.css';

const MAX_UPLOAD_BYTES = 95 * 1024 * 1024;
const APP_VERSION = '0.4.0';
const LANGUAGE_STORAGE_KEY = 'naughtyshare-language';
const SORT_FIELD_STORAGE_KEY = 'naughtyshare-sort-field';
const SORT_DIRECTION_STORAGE_KEY = 'naughtyshare-sort-direction';
const SUPPORTED_LANGUAGES = new Set(['fr', 'vi']);
const SUPPORTED_SORTS = new Set(['date', 'name', 'type', 'duration']);
const app = document.querySelector('#app');

const translations = {
  fr: {
    locale: 'fr-FR',
    brandAria: 'NaughtyShare accueil',
    brandSubtitle: 'Coffre média privé',
    languageGroup: 'Changer de langue',
    frenchLabel: 'Français',
    vietnameseLabel: 'Vietnamien',
    statusChecking: 'Vérification du coffre…',
    statusOnline: 'Coffre connecté',
    statusOffline: 'Coffre non configuré',
    heroEyebrow: 'POUR NOUS DEUX · PRIVÉ PAR DÉFAUT',
    heroLine1: 'Nos photos.',
    heroLine2: 'Notre espace.',
    heroLede: 'Une galerie PWA privée pour partager photos et vidéos sans créer de lien public permanent.',
    vaultTitle: 'Coffre privé',
    vaultBody: 'Les médias sont servis uniquement après authentification Cloudflare Access.',
    actionsAria: 'Actions principales',
    googleTitle: 'Importer depuis Google Photos',
    googleSubtitle: 'Phase 2 · Google Photos Picker',
    deviceTitle: 'Ajouter depuis l’appareil',
    deviceSubtitle: 'Photos & vidéos · max 95 MB/fichier',
    galleryEyebrow: 'GALERIE',
    galleryTitle: 'Moments partagés',
    emptyTitle: 'Le coffre est encore vide',
    emptyBody: 'Ajoute une photo ou une vidéo depuis ton appareil pour commencer.',
    footerVersion: `NaughtyShare v${APP_VERSION}`,
    footerPrivacy: 'Code ≠ médias · aucun contenu privé dans Git',
    mediaCount: (count) => `${count} média${count > 1 ? 's' : ''}`,
    storageTitle: 'Stockage NaughtyShare',
    storageUsed: (size) => `${size} utilisés`,
    storageNote: 'Bucket privé NaughtyShare · le quota R2 gratuit est partagé au niveau du compte Cloudflare.',
    sortLabel: 'Trier par',
    sortDate: 'Date d’ajout',
    sortName: 'Nom',
    sortType: 'Type',
    sortDuration: 'Durée',
    ascending: 'Croissant',
    descending: 'Décroissant',
    sortDirectionAria: 'Inverser le sens du tri',
    imageType: 'PHOTO',
    videoType: 'VIDÉO',
    openMedia: (name) => `Ouvrir ${name}`,
    rename: 'Renommer',
    delete: 'Supprimer',
    close: 'Fermer',
    previous: 'Précédent',
    next: 'Suivant',
    position: (index, total) => `${index} / ${total}`,
    noDuration: '—',
    durationLoading: '…',
    renameTitle: 'Renommer ce média',
    renameLabel: 'Nouveau nom',
    renameCancel: 'Annuler',
    renameSave: 'Enregistrer',
    renameSuccess: 'Média renommé.',
    renameFailure: 'Impossible de renommer ce média.',
    deleteTitle: 'Supprimer ce média ?',
    deleteBody: 'Cette action supprimera définitivement la copie NaughtyShare du stockage privé.',
    deleteCancel: 'Annuler',
    deleteConfirm: 'Supprimer définitivement',
    deleteSuccess: 'Média supprimé du coffre.',
    deleteFailure: 'Impossible de supprimer ce média.',
    unsupportedMedia: (name) => `${name} n’est pas une image ou une vidéo reconnue.`,
    tooLarge: (name) => `${name} dépasse 95 MB.`,
    sending: (index, total, name) => `Envoi ${index}/${total} · ${name}…`,
    uploadSuccess: (count) => `${count} fichier${count > 1 ? 's' : ''} ajouté${count > 1 ? 's' : ''} au coffre.`,
    uploadFailure: 'Échec de l’envoi.',
    uploadHttpError: (status) => `Échec de l’envoi · HTTP ${status}`,
    galleryLoadError: 'Impossible de charger la galerie.',
    bytes: (value) => `${value} o`,
    kilobytes: (value) => `${value} Ko`,
    megabytes: (value) => `${value} Mo`,
    gigabytes: (value) => `${value} Go`,
  },
  vi: {
    locale: 'vi-VN',
    brandAria: 'Trang chủ NaughtyShare',
    brandSubtitle: 'Kho ảnh & video riêng tư',
    languageGroup: 'Đổi ngôn ngữ',
    frenchLabel: 'Tiếng Pháp',
    vietnameseLabel: 'Tiếng Việt',
    statusChecking: 'Đang kiểm tra kho…',
    statusOnline: 'Kho đã kết nối',
    statusOffline: 'Kho chưa được cấu hình',
    heroEyebrow: 'CHỈ HAI CHÚNG TA · RIÊNG TƯ MẶC ĐỊNH',
    heroLine1: 'Ảnh của chúng ta.',
    heroLine2: 'Không gian riêng.',
    heroLede: 'Một thư viện PWA riêng tư để chia sẻ ảnh và video mà không tạo liên kết công khai vĩnh viễn.',
    vaultTitle: 'Kho riêng tư',
    vaultBody: 'Ảnh và video chỉ được hiển thị sau khi xác thực qua Cloudflare Access.',
    actionsAria: 'Các thao tác chính',
    googleTitle: 'Nhập từ Google Photos',
    googleSubtitle: 'Giai đoạn 2 · Google Photos Picker',
    deviceTitle: 'Thêm từ thiết bị',
    deviceSubtitle: 'Ảnh & video · tối đa 95 MB/tệp',
    galleryEyebrow: 'THƯ VIỆN',
    galleryTitle: 'Khoảnh khắc chung',
    emptyTitle: 'Kho vẫn đang trống',
    emptyBody: 'Thêm một ảnh hoặc video từ thiết bị để bắt đầu.',
    footerVersion: `NaughtyShare v${APP_VERSION}`,
    footerPrivacy: 'Mã nguồn ≠ ảnh/video · không có nội dung riêng tư trong Git',
    mediaCount: (count) => `${count} mục`,
    storageTitle: 'Dung lượng NaughtyShare',
    storageUsed: (size) => `Đã dùng ${size}`,
    storageNote: 'Bucket NaughtyShare riêng tư · hạn mức R2 miễn phí được tính chung cho tài khoản Cloudflare.',
    sortLabel: 'Sắp xếp theo',
    sortDate: 'Ngày thêm',
    sortName: 'Tên',
    sortType: 'Loại',
    sortDuration: 'Thời lượng',
    ascending: 'Tăng dần',
    descending: 'Giảm dần',
    sortDirectionAria: 'Đảo chiều sắp xếp',
    imageType: 'ẢNH',
    videoType: 'VIDEO',
    openMedia: (name) => `Mở ${name}`,
    rename: 'Đổi tên',
    delete: 'Xóa',
    close: 'Đóng',
    previous: 'Trước',
    next: 'Sau',
    position: (index, total) => `${index} / ${total}`,
    noDuration: '—',
    durationLoading: '…',
    renameTitle: 'Đổi tên nội dung',
    renameLabel: 'Tên mới',
    renameCancel: 'Hủy',
    renameSave: 'Lưu',
    renameSuccess: 'Đã đổi tên.',
    renameFailure: 'Không thể đổi tên nội dung này.',
    deleteTitle: 'Xóa nội dung này?',
    deleteBody: 'Thao tác này sẽ xóa vĩnh viễn bản sao NaughtyShare khỏi kho lưu trữ riêng tư.',
    deleteCancel: 'Hủy',
    deleteConfirm: 'Xóa vĩnh viễn',
    deleteSuccess: 'Đã xóa khỏi kho.',
    deleteFailure: 'Không thể xóa nội dung này.',
    unsupportedMedia: (name) => `${name} không phải là ảnh hoặc video được hỗ trợ.`,
    tooLarge: (name) => `${name} vượt quá 95 MB.`,
    sending: (index, total, name) => `Đang tải lên ${index}/${total} · ${name}…`,
    uploadSuccess: (count) => `Đã thêm ${count} tệp vào kho.`,
    uploadFailure: 'Tải lên thất bại.',
    uploadHttpError: (status) => `Tải lên thất bại · HTTP ${status}`,
    galleryLoadError: 'Không thể tải thư viện.',
    bytes: (value) => `${value} B`,
    kilobytes: (value) => `${value} KB`,
    megabytes: (value) => `${value} MB`,
    gigabytes: (value) => `${value} GB`,
  },
};

function readInitialLanguage() {
  try {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (SUPPORTED_LANGUAGES.has(saved)) return saved;
  } catch {
    // localStorage can be unavailable in hardened/private browser modes.
  }

  return navigator.language?.toLowerCase().startsWith('vi') ? 'vi' : 'fr';
}

function readSortField() {
  try {
    const saved = localStorage.getItem(SORT_FIELD_STORAGE_KEY);
    if (SUPPORTED_SORTS.has(saved)) return saved;
  } catch {
    // Keep the default sort for this session.
  }
  return 'date';
}

function readSortDirection() {
  try {
    return localStorage.getItem(SORT_DIRECTION_STORAGE_KEY) === 'asc' ? 'asc' : 'desc';
  } catch {
    return 'desc';
  }
}

let currentLanguage = readInitialLanguage();
let currentItems = [];
let currentStats = { count: 0, sizeBytes: 0 };
let sortField = readSortField();
let sortDirection = readSortDirection();
let activeMediaId = null;
let pendingRenameId = null;
let pendingDeleteId = null;
let durationRerenderTimer = null;

function t(key, ...args) {
  const value = translations[currentLanguage][key];
  return typeof value === 'function' ? value(...args) : value;
}

app.innerHTML = `
  <main class="shell">
    <header class="topbar">
      <a class="brand" id="brand-link" href="/">
        <span class="brand-mark">NS</span>
        <span>
          <strong>NaughtyShare</strong>
          <small id="brand-subtitle"></small>
        </span>
      </a>

      <div class="topbar-tools">
        <div class="language-toggle" id="language-toggle" role="group">
          <button class="language-option" type="button" data-language="fr" aria-pressed="false">FR</button>
          <button class="language-option" type="button" data-language="vi" aria-pressed="false">VN</button>
        </div>

        <div class="status" id="vault-status" data-state="checking">
          <span class="status-dot"></span>
          <span id="vault-status-text"></span>
        </div>
      </div>
    </header>

    <section class="hero">
      <div class="hero-copy">
        <p class="eyebrow" id="hero-eyebrow"></p>
        <h1><span class="hero-line hero-line-plain" id="hero-line-1"></span><br><span class="hero-line" id="hero-line-2"></span></h1>
        <p class="lede" id="hero-lede"></p>
      </div>

      <div class="hero-card">
        <div class="hero-card-glow"></div>
        <span class="lock">✦</span>
        <h2 id="vault-title"></h2>
        <p id="vault-body"></p>
      </div>
    </section>

    <section class="actions" id="main-actions">
      <button class="action primary" id="google-import" type="button" disabled>
        <span class="action-icon">G</span>
        <span>
          <strong id="google-title"></strong>
          <small id="google-subtitle"></small>
        </span>
      </button>
      <button class="action" id="device-upload" type="button" disabled>
        <span class="action-icon">＋</span>
        <span>
          <strong id="device-title"></strong>
          <small id="device-subtitle"></small>
        </span>
      </button>
      <input id="file-input" type="file" accept="image/*,video/*" multiple hidden />
    </section>

    <p class="upload-note" id="upload-note" role="status" aria-live="polite"></p>

    <section class="gallery-section">
      <div class="section-title">
        <div>
          <p class="eyebrow" id="gallery-eyebrow"></p>
          <h2 id="gallery-title"></h2>
        </div>
        <span class="count" id="media-count"></span>
      </div>

      <div class="gallery-toolbar" id="gallery-toolbar">
        <div class="storage-summary">
          <span class="storage-icon">◫</span>
          <span>
            <strong id="storage-title"></strong>
            <small id="storage-used"></small>
          </span>
          <span class="storage-note" id="storage-note"></span>
        </div>

        <div class="sort-controls">
          <label for="sort-field" id="sort-label"></label>
          <select id="sort-field">
            <option value="date"></option>
            <option value="name"></option>
            <option value="type"></option>
            <option value="duration"></option>
          </select>
          <button class="sort-direction" id="sort-direction" type="button"></button>
        </div>
      </div>

      <div class="empty-state" id="gallery-empty">
        <div class="empty-orbit"><span>♡</span></div>
        <h3 id="empty-title"></h3>
        <p id="empty-body"></p>
      </div>
      <div class="gallery" id="gallery" hidden></div>
    </section>

    <footer>
      <span id="footer-version"></span>
      <span id="footer-privacy"></span>
    </footer>
  </main>

  <dialog class="media-dialog" id="media-dialog">
    <div class="viewer-shell">
      <header class="viewer-header">
        <div class="viewer-heading">
          <span class="viewer-type" id="viewer-type"></span>
          <h3 id="viewer-name"></h3>
        </div>
        <div class="viewer-actions">
          <button class="viewer-action" id="viewer-rename" type="button"><span>✎</span><b></b></button>
          <button class="viewer-action danger" id="viewer-delete" type="button"><span>⌫</span><b></b></button>
          <button class="viewer-close" id="viewer-close" type="button" aria-label="Close">×</button>
        </div>
      </header>
      <div class="viewer-stage" id="viewer-stage"></div>
      <button class="viewer-nav viewer-prev" id="viewer-prev" type="button">‹</button>
      <button class="viewer-nav viewer-next" id="viewer-next" type="button">›</button>
      <div class="viewer-footer">
        <span id="viewer-details"></span>
        <span id="viewer-position"></span>
      </div>
    </div>
  </dialog>

  <dialog class="mini-dialog" id="rename-dialog">
    <form class="mini-dialog-card" id="rename-form">
      <h3 id="rename-title"></h3>
      <label for="rename-input" id="rename-label"></label>
      <input id="rename-input" type="text" maxlength="240" autocomplete="off" />
      <div class="mini-dialog-actions">
        <button class="secondary-button" id="rename-cancel" type="button"></button>
        <button class="primary-button" id="rename-save" type="submit"></button>
      </div>
    </form>
  </dialog>

  <dialog class="mini-dialog" id="delete-dialog">
    <div class="mini-dialog-card">
      <h3 id="delete-title"></h3>
      <p id="delete-body"></p>
      <strong class="delete-name" id="delete-name"></strong>
      <div class="mini-dialog-actions">
        <button class="secondary-button" id="delete-cancel" type="button"></button>
        <button class="danger-button" id="delete-confirm" type="button"></button>
      </div>
    </div>
  </dialog>
`;

const brandLink = document.querySelector('#brand-link');
const brandSubtitle = document.querySelector('#brand-subtitle');
const languageToggle = document.querySelector('#language-toggle');
const languageOptions = Array.from(document.querySelectorAll('.language-option'));
const status = document.querySelector('#vault-status');
const statusText = document.querySelector('#vault-status-text');
const heroEyebrow = document.querySelector('#hero-eyebrow');
const heroLine1 = document.querySelector('#hero-line-1');
const heroLine2 = document.querySelector('#hero-line-2');
const heroLede = document.querySelector('#hero-lede');
const vaultTitle = document.querySelector('#vault-title');
const vaultBody = document.querySelector('#vault-body');
const mainActions = document.querySelector('#main-actions');
const googleTitle = document.querySelector('#google-title');
const googleSubtitle = document.querySelector('#google-subtitle');
const deviceUpload = document.querySelector('#device-upload');
const deviceTitle = document.querySelector('#device-title');
const deviceSubtitle = document.querySelector('#device-subtitle');
const fileInput = document.querySelector('#file-input');
const uploadNote = document.querySelector('#upload-note');
const galleryEyebrow = document.querySelector('#gallery-eyebrow');
const galleryTitle = document.querySelector('#gallery-title');
const gallery = document.querySelector('#gallery');
const emptyState = document.querySelector('#gallery-empty');
const emptyTitle = document.querySelector('#empty-title');
const emptyBody = document.querySelector('#empty-body');
const mediaCount = document.querySelector('#media-count');
const storageTitle = document.querySelector('#storage-title');
const storageUsed = document.querySelector('#storage-used');
const storageNote = document.querySelector('#storage-note');
const sortLabel = document.querySelector('#sort-label');
const sortFieldSelect = document.querySelector('#sort-field');
const sortDirectionButton = document.querySelector('#sort-direction');
const footerVersion = document.querySelector('#footer-version');
const footerPrivacy = document.querySelector('#footer-privacy');
const mediaDialog = document.querySelector('#media-dialog');
const viewerType = document.querySelector('#viewer-type');
const viewerName = document.querySelector('#viewer-name');
const viewerStage = document.querySelector('#viewer-stage');
const viewerDetails = document.querySelector('#viewer-details');
const viewerPosition = document.querySelector('#viewer-position');
const viewerPrev = document.querySelector('#viewer-prev');
const viewerNext = document.querySelector('#viewer-next');
const viewerRename = document.querySelector('#viewer-rename');
const viewerDelete = document.querySelector('#viewer-delete');
const viewerClose = document.querySelector('#viewer-close');
const renameDialog = document.querySelector('#rename-dialog');
const renameForm = document.querySelector('#rename-form');
const renameTitle = document.querySelector('#rename-title');
const renameLabel = document.querySelector('#rename-label');
const renameInput = document.querySelector('#rename-input');
const renameCancel = document.querySelector('#rename-cancel');
const renameSave = document.querySelector('#rename-save');
const deleteDialog = document.querySelector('#delete-dialog');
const deleteTitle = document.querySelector('#delete-title');
const deleteBody = document.querySelector('#delete-body');
const deleteName = document.querySelector('#delete-name');
const deleteCancel = document.querySelector('#delete-cancel');
const deleteConfirm = document.querySelector('#delete-confirm');

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return t('bytes', bytes);
  if (bytes < 1024 ** 2) return t('kilobytes', (bytes / 1024).toFixed(1));
  if (bytes < 1024 ** 3) return t('megabytes', (bytes / 1024 ** 2).toFixed(1));
  return t('gigabytes', (bytes / 1024 ** 3).toFixed(2));
}

function formatDuration(seconds, isVideo = true) {
  if (!isVideo) return t('noDuration');
  if (!Number.isFinite(seconds) || seconds < 0) return t('durationLoading');
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

function isVideo(item) {
  return item.contentType.startsWith('video/');
}

function typeLabel(item) {
  return isVideo(item) ? t('videoType') : t('imageType');
}

function mediaDetails(item) {
  const date = new Date(item.createdAt);
  const when = Number.isNaN(date.getTime()) ? '' : date.toLocaleString(t('locale'));
  const duration = isVideo(item) ? formatDuration(item.durationSeconds, true) : '';
  return [formatBytes(item.sizeBytes), duration, when].filter(Boolean).join(' · ');
}

function showNotice(message, state = 'ok') {
  uploadNote.dataset.state = state;
  uploadNote.textContent = message;
}

function updateStatusText() {
  const state = status.dataset.state;
  if (state === 'online') statusText.textContent = t('statusOnline');
  else if (state === 'offline') statusText.textContent = t('statusOffline');
  else statusText.textContent = t('statusChecking');
}

function persistSort() {
  try {
    localStorage.setItem(SORT_FIELD_STORAGE_KEY, sortField);
    localStorage.setItem(SORT_DIRECTION_STORAGE_KEY, sortDirection);
  } catch {
    // Sorting still works for this session.
  }
}

function sortedItems() {
  const items = [...currentItems];
  const direction = sortDirection === 'asc' ? 1 : -1;
  const collator = new Intl.Collator(t('locale'), { numeric: true, sensitivity: 'base' });

  items.sort((a, b) => {
    let comparison = 0;

    if (sortField === 'name') {
      comparison = collator.compare(a.originalName, b.originalName);
    } else if (sortField === 'type') {
      comparison = collator.compare(typeLabel(a), typeLabel(b));
      if (comparison === 0) comparison = collator.compare(a.originalName, b.originalName);
    } else if (sortField === 'duration') {
      const aUnknown = isVideo(a) && !Number.isFinite(a.durationSeconds);
      const bUnknown = isVideo(b) && !Number.isFinite(b.durationSeconds);
      if (aUnknown && !bUnknown) return 1;
      if (!aUnknown && bUnknown) return -1;
      const aDuration = isVideo(a) ? (a.durationSeconds ?? 0) : 0;
      const bDuration = isVideo(b) ? (b.durationSeconds ?? 0) : 0;
      comparison = aDuration - bDuration;
      if (comparison === 0) comparison = collator.compare(a.originalName, b.originalName);
    } else {
      comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    }

    return comparison * direction;
  });

  return items;
}

function renderStorage() {
  storageTitle.textContent = t('storageTitle');
  storageUsed.textContent = t('storageUsed', formatBytes(currentStats.sizeBytes));
  storageNote.textContent = t('storageNote');
}

function renderSortControls() {
  sortLabel.textContent = t('sortLabel');
  sortFieldSelect.options[0].textContent = t('sortDate');
  sortFieldSelect.options[1].textContent = t('sortName');
  sortFieldSelect.options[2].textContent = t('sortType');
  sortFieldSelect.options[3].textContent = t('sortDuration');
  sortFieldSelect.value = sortField;
  sortDirectionButton.textContent = sortDirection === 'asc' ? `↑ ${t('ascending')}` : `↓ ${t('descending')}`;
  sortDirectionButton.setAttribute('aria-label', t('sortDirectionAria'));
}

function scheduleDurationRerender() {
  if (durationRerenderTimer || sortField !== 'duration') return;
  durationRerenderTimer = window.setTimeout(() => {
    durationRerenderTimer = null;
    renderGallery();
    if (activeMediaId) renderViewer();
  }, 80);
}

function makeCard(item) {
  const card = document.createElement('article');
  card.className = 'media-card';
  card.dataset.mediaId = item.id;

  const openButton = document.createElement('button');
  openButton.className = 'media-open';
  openButton.type = 'button';
  openButton.setAttribute('aria-label', t('openMedia', item.originalName));

  const preview = isVideo(item) ? document.createElement('video') : document.createElement('img');
  preview.className = 'media-preview';
  preview.src = item.url;

  if (preview instanceof HTMLVideoElement) {
    preview.preload = 'metadata';
    preview.muted = true;
    preview.playsInline = true;
    preview.addEventListener('loadedmetadata', () => {
      const duration = preview.duration;
      if (Number.isFinite(duration) && Math.abs((item.durationSeconds ?? -1) - duration) > 0.2) {
        item.durationSeconds = duration;
        const details = card.querySelector('.media-details');
        if (details) details.textContent = mediaDetails(item);
        scheduleDurationRerender();
      }
    }, { once: true });
  } else {
    preview.alt = item.originalName;
    preview.loading = 'lazy';
    preview.decoding = 'async';
  }

  const badge = document.createElement('span');
  badge.className = 'media-type-badge';
  badge.textContent = typeLabel(item);

  openButton.append(preview, badge);
  if (isVideo(item)) {
    const play = document.createElement('span');
    play.className = 'play-badge';
    play.textContent = '▶';
    openButton.append(play);
  }

  const meta = document.createElement('div');
  meta.className = 'media-meta';

  const name = document.createElement('strong');
  name.className = 'media-name';
  name.textContent = item.originalName;

  const details = document.createElement('small');
  details.className = 'media-details';
  details.textContent = mediaDetails(item);

  const actions = document.createElement('div');
  actions.className = 'media-card-actions';

  const rename = document.createElement('button');
  rename.type = 'button';
  rename.className = 'icon-action';
  rename.textContent = '✎';
  rename.title = t('rename');
  rename.setAttribute('aria-label', `${t('rename')} · ${item.originalName}`);
  rename.addEventListener('click', () => openRenameDialog(item.id));

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'icon-action danger';
  remove.textContent = '⌫';
  remove.title = t('delete');
  remove.setAttribute('aria-label', `${t('delete')} · ${item.originalName}`);
  remove.addEventListener('click', () => openDeleteDialog(item.id));

  actions.append(rename, remove);
  meta.append(name, details, actions);
  openButton.addEventListener('click', () => openViewer(item.id));
  card.append(openButton, meta);
  return card;
}

function renderGallery() {
  const items = sortedItems();
  gallery.replaceChildren();
  mediaCount.textContent = t('mediaCount', currentStats.count || currentItems.length);
  emptyState.hidden = currentItems.length > 0;
  gallery.hidden = currentItems.length === 0;

  for (const item of items) gallery.append(makeCard(item));
}

function renderViewer() {
  if (!activeMediaId || !mediaDialog.open) return;
  const items = sortedItems();
  const index = items.findIndex((item) => item.id === activeMediaId);
  if (index < 0) {
    mediaDialog.close();
    return;
  }

  const item = items[index];
  viewerType.textContent = typeLabel(item);
  viewerName.textContent = item.originalName;
  viewerDetails.textContent = mediaDetails(item);
  viewerPosition.textContent = t('position', index + 1, items.length);
  viewerPrev.disabled = items.length <= 1;
  viewerNext.disabled = items.length <= 1;
  viewerPrev.setAttribute('aria-label', t('previous'));
  viewerNext.setAttribute('aria-label', t('next'));
  viewerClose.setAttribute('aria-label', t('close'));
  viewerRename.querySelector('b').textContent = t('rename');
  viewerDelete.querySelector('b').textContent = t('delete');

  viewerStage.replaceChildren();
  const media = isVideo(item) ? document.createElement('video') : document.createElement('img');
  media.className = 'viewer-media';
  media.src = item.url;

  if (media instanceof HTMLVideoElement) {
    media.controls = true;
    media.preload = 'metadata';
    media.playsInline = true;
    media.addEventListener('loadedmetadata', () => {
      if (Number.isFinite(media.duration)) {
        item.durationSeconds = media.duration;
        viewerDetails.textContent = mediaDetails(item);
        scheduleDurationRerender();
      }
    });
  } else {
    media.alt = item.originalName;
    media.decoding = 'async';
  }

  viewerStage.append(media);
}

function openViewer(id) {
  activeMediaId = id;
  if (!mediaDialog.open) mediaDialog.showModal();
  document.body.classList.add('viewer-open');
  renderViewer();
}

function moveViewer(delta) {
  const items = sortedItems();
  if (items.length <= 1) return;
  const index = items.findIndex((item) => item.id === activeMediaId);
  if (index < 0) return;
  const nextIndex = (index + delta + items.length) % items.length;
  activeMediaId = items[nextIndex].id;
  renderViewer();
}

function openRenameDialog(id) {
  const item = currentItems.find((entry) => entry.id === id);
  if (!item) return;
  pendingRenameId = id;
  renameInput.value = item.originalName;
  if (!renameDialog.open) renameDialog.showModal();
  window.setTimeout(() => {
    renameInput.focus();
    renameInput.select();
  }, 0);
}

function openDeleteDialog(id) {
  const item = currentItems.find((entry) => entry.id === id);
  if (!item) return;
  pendingDeleteId = id;
  deleteName.textContent = item.originalName;
  if (!deleteDialog.open) deleteDialog.showModal();
}

async function renameMedia(id, name) {
  const response = await fetch(`/api/media/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ name }),
  });

  if (!response.ok) throw new Error(t('renameFailure'));
  const data = await response.json();
  const item = currentItems.find((entry) => entry.id === id);
  if (item && data?.item?.originalName) item.originalName = data.item.originalName;
}

async function deleteMedia(id) {
  const response = await fetch(`/api/media/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(t('deleteFailure'));
}

function applyLanguage(language, { persist = true } = {}) {
  if (!SUPPORTED_LANGUAGES.has(language)) return;
  currentLanguage = language;
  document.documentElement.lang = language;

  if (persist) {
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
      // Language still changes for the current session.
    }
  }

  brandLink.setAttribute('aria-label', t('brandAria'));
  brandSubtitle.textContent = t('brandSubtitle');
  languageToggle.setAttribute('aria-label', t('languageGroup'));
  heroEyebrow.textContent = t('heroEyebrow');
  heroLine1.textContent = t('heroLine1');
  heroLine2.textContent = t('heroLine2');
  heroLede.textContent = t('heroLede');
  vaultTitle.textContent = t('vaultTitle');
  vaultBody.textContent = t('vaultBody');
  mainActions.setAttribute('aria-label', t('actionsAria'));
  googleTitle.textContent = t('googleTitle');
  googleSubtitle.textContent = t('googleSubtitle');
  deviceTitle.textContent = t('deviceTitle');
  deviceSubtitle.textContent = t('deviceSubtitle');
  galleryEyebrow.textContent = t('galleryEyebrow');
  galleryTitle.textContent = t('galleryTitle');
  emptyTitle.textContent = t('emptyTitle');
  emptyBody.textContent = t('emptyBody');
  footerVersion.textContent = t('footerVersion');
  footerPrivacy.textContent = t('footerPrivacy');
  renameTitle.textContent = t('renameTitle');
  renameLabel.textContent = t('renameLabel');
  renameCancel.textContent = t('renameCancel');
  renameSave.textContent = t('renameSave');
  deleteTitle.textContent = t('deleteTitle');
  deleteBody.textContent = t('deleteBody');
  deleteCancel.textContent = t('deleteCancel');
  deleteConfirm.textContent = t('deleteConfirm');

  for (const option of languageOptions) {
    const isActive = option.dataset.language === language;
    option.classList.toggle('is-active', isActive);
    option.setAttribute('aria-pressed', String(isActive));
    option.setAttribute(
      'aria-label',
      option.dataset.language === 'fr' ? translations[language].frenchLabel : translations[language].vietnameseLabel,
    );
  }

  updateStatusText();
  renderStorage();
  renderSortControls();
  renderGallery();
  renderViewer();
}

async function loadGallery() {
  const response = await fetch('/api/media', {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });

  if (!response.ok) throw new Error(t('galleryLoadError'));
  const data = await response.json();
  const previousDurations = new Map(currentItems.map((item) => [item.id, item.durationSeconds]));
  currentItems = Array.isArray(data.items)
    ? data.items.map((item) => ({ ...item, durationSeconds: previousDurations.get(item.id) }))
    : [];

  currentStats = {
    count: Number(data?.stats?.count ?? currentItems.length),
    sizeBytes: Number(data?.stats?.sizeBytes ?? currentItems.reduce((sum, item) => sum + Number(item.sizeBytes || 0), 0)),
  };

  renderStorage();
  renderGallery();
}

async function uploadFile(file, index, total) {
  if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
    throw new Error(t('unsupportedMedia', file.name));
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(t('tooLarge', file.name));
  }

  showNotice(t('sending', index, total, file.name), 'working');

  const response = await fetch('/api/media', {
    method: 'POST',
    headers: {
      'Content-Type': file.type,
      'X-File-Name': encodeURIComponent(file.name),
      Accept: 'application/json',
    },
    body: file,
  });

  if (!response.ok) {
    if (response.status === 413) throw new Error(t('tooLarge', file.name));
    if (response.status === 415) throw new Error(t('unsupportedMedia', file.name));
    throw new Error(t('uploadHttpError', response.status));
  }
}

async function uploadFiles(files) {
  const selected = Array.from(files);
  if (!selected.length) return;

  deviceUpload.disabled = true;
  try {
    for (let i = 0; i < selected.length; i += 1) {
      await uploadFile(selected[i], i + 1, selected.length);
    }
    showNotice(t('uploadSuccess', selected.length), 'ok');
    await loadGallery();
  } catch (error) {
    showNotice(error instanceof Error ? error.message : t('uploadFailure'), 'error');
  } finally {
    deviceUpload.disabled = false;
    fileInput.value = '';
  }
}

async function checkVault() {
  try {
    const response = await fetch('/api/health', {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (data?.ok !== true) throw new Error('Vault unavailable');

    status.dataset.state = 'online';
    updateStatusText();
    deviceUpload.disabled = false;
    await loadGallery();
  } catch {
    status.dataset.state = 'offline';
    updateStatusText();
    deviceUpload.disabled = true;
  }
}

for (const option of languageOptions) {
  option.addEventListener('click', () => applyLanguage(option.dataset.language));
}

sortFieldSelect.addEventListener('change', () => {
  if (!SUPPORTED_SORTS.has(sortFieldSelect.value)) return;
  sortField = sortFieldSelect.value;
  persistSort();
  renderSortControls();
  renderGallery();
  renderViewer();
});

sortDirectionButton.addEventListener('click', () => {
  sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
  persistSort();
  renderSortControls();
  renderGallery();
  renderViewer();
});

deviceUpload.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => uploadFiles(fileInput.files));
viewerPrev.addEventListener('click', () => moveViewer(-1));
viewerNext.addEventListener('click', () => moveViewer(1));
viewerClose.addEventListener('click', () => mediaDialog.close());
viewerRename.addEventListener('click', () => activeMediaId && openRenameDialog(activeMediaId));
viewerDelete.addEventListener('click', () => activeMediaId && openDeleteDialog(activeMediaId));

mediaDialog.addEventListener('click', (event) => {
  if (event.target === mediaDialog) mediaDialog.close();
});

mediaDialog.addEventListener('close', () => {
  viewerStage.replaceChildren();
  activeMediaId = null;
  document.body.classList.remove('viewer-open');
});

window.addEventListener('keydown', (event) => {
  if (!mediaDialog.open || renameDialog.open || deleteDialog.open) return;
  if (event.key === 'ArrowLeft') moveViewer(-1);
  if (event.key === 'ArrowRight') moveViewer(1);
});

renameCancel.addEventListener('click', () => renameDialog.close());
renameDialog.addEventListener('close', () => { pendingRenameId = null; });
renameForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!pendingRenameId) return;
  const id = pendingRenameId;
  const name = renameInput.value.trim();
  if (!name) return;
  renameSave.disabled = true;

  try {
    await renameMedia(id, name);
    renameDialog.close();
    showNotice(t('renameSuccess'), 'ok');
    renderGallery();
    renderViewer();
  } catch {
    showNotice(t('renameFailure'), 'error');
  } finally {
    renameSave.disabled = false;
  }
});

deleteCancel.addEventListener('click', () => deleteDialog.close());
deleteDialog.addEventListener('close', () => { pendingDeleteId = null; });
deleteConfirm.addEventListener('click', async () => {
  if (!pendingDeleteId) return;
  const id = pendingDeleteId;
  deleteConfirm.disabled = true;

  try {
    await deleteMedia(id);
    deleteDialog.close();
    if (activeMediaId === id && mediaDialog.open) mediaDialog.close();
    showNotice(t('deleteSuccess'), 'ok');
    await loadGallery();
  } catch {
    showNotice(t('deleteFailure'), 'error');
  } finally {
    deleteConfirm.disabled = false;
  }
});

applyLanguage(currentLanguage, { persist: false });
checkVault();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // The app remains usable without offline shell support.
    });
  });
}
