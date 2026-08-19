import './styles.css';

const MAX_UPLOAD_BYTES = 95 * 1024 * 1024;
const APP_VERSION = '0.3.0';
const LANGUAGE_STORAGE_KEY = 'naughtyshare-language';
const SUPPORTED_LANGUAGES = new Set(['fr', 'vi']);
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

let currentLanguage = readInitialLanguage();
let currentItems = [];

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
const footerVersion = document.querySelector('#footer-version');
const footerPrivacy = document.querySelector('#footer-privacy');

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return t('bytes', bytes);
  if (bytes < 1024 ** 2) return t('kilobytes', (bytes / 1024).toFixed(1));
  return t('megabytes', (bytes / 1024 ** 2).toFixed(1));
}

function updateStatusText() {
  const state = status.dataset.state;
  if (state === 'online') statusText.textContent = t('statusOnline');
  else if (state === 'offline') statusText.textContent = t('statusOffline');
  else statusText.textContent = t('statusChecking');
}

function renderGallery(items) {
  currentItems = items;
  gallery.replaceChildren();
  mediaCount.textContent = t('mediaCount', items.length);
  emptyState.hidden = items.length > 0;
  gallery.hidden = items.length === 0;

  for (const item of items) {
    const card = document.createElement('article');
    card.className = 'media-card';

    const preview = item.contentType.startsWith('video/')
      ? document.createElement('video')
      : document.createElement('img');

    preview.className = 'media-preview';
    preview.src = item.url;
    preview.setAttribute('aria-label', item.originalName);

    if (preview instanceof HTMLVideoElement) {
      preview.controls = true;
      preview.preload = 'metadata';
      preview.playsInline = true;
    } else {
      preview.alt = item.originalName;
      preview.loading = 'lazy';
      preview.decoding = 'async';
    }

    const meta = document.createElement('div');
    meta.className = 'media-meta';

    const name = document.createElement('strong');
    name.textContent = item.originalName;

    const details = document.createElement('small');
    const date = new Date(item.createdAt);
    const when = Number.isNaN(date.getTime()) ? '' : date.toLocaleString(t('locale'));
    details.textContent = [formatBytes(item.sizeBytes), when].filter(Boolean).join(' · ');

    meta.append(name, details);
    card.append(preview, meta);
    gallery.append(card);
  }
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
  renderGallery(currentItems);
}

async function loadGallery() {
  const response = await fetch('/api/media', {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });

  if (!response.ok) throw new Error(t('galleryLoadError'));
  const data = await response.json();
  renderGallery(Array.isArray(data.items) ? data.items : []);
}

async function uploadFile(file, index, total) {
  if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
    throw new Error(t('unsupportedMedia', file.name));
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(t('tooLarge', file.name));
  }

  uploadNote.dataset.state = 'working';
  uploadNote.textContent = t('sending', index, total, file.name);

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
    uploadNote.dataset.state = 'ok';
    uploadNote.textContent = t('uploadSuccess', selected.length);
    await loadGallery();
  } catch (error) {
    uploadNote.dataset.state = 'error';
    uploadNote.textContent = error instanceof Error ? error.message : t('uploadFailure');
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

deviceUpload.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => uploadFiles(fileInput.files));

applyLanguage(currentLanguage, { persist: false });
checkVault();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // The app remains usable without offline shell support.
    });
  });
}
