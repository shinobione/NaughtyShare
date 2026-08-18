import './styles.css';

const MAX_UPLOAD_BYTES = 95 * 1024 * 1024;
const app = document.querySelector('#app');

app.innerHTML = `
  <main class="shell">
    <header class="topbar">
      <a class="brand" href="/" aria-label="NaughtyShare accueil">
        <span class="brand-mark">NS</span>
        <span>
          <strong>NaughtyShare</strong>
          <small>Private media vault</small>
        </span>
      </a>
      <div class="status" id="vault-status" data-state="checking">
        <span class="status-dot"></span>
        <span>Vérification du coffre…</span>
      </div>
    </header>

    <section class="hero">
      <div class="hero-copy">
        <p class="eyebrow">POUR NOUS DEUX · PRIVÉ PAR DÉFAUT</p>
        <h1>Nos photos.<br><span>Notre espace.</span></h1>
        <p class="lede">Une galerie PWA privée pour partager photos et vidéos sans créer de lien public permanent.</p>
      </div>

      <div class="hero-card">
        <div class="hero-card-glow"></div>
        <span class="lock">✦</span>
        <h2>Coffre privé</h2>
        <p>Les médias sont servis uniquement après authentification Cloudflare Access.</p>
      </div>
    </section>

    <section class="actions" aria-label="Actions principales">
      <button class="action primary" id="google-import" type="button" disabled>
        <span class="action-icon">G</span>
        <span>
          <strong>Importer depuis Google Photos</strong>
          <small>Phase 2 · Google Photos Picker</small>
        </span>
      </button>
      <button class="action" id="device-upload" type="button" disabled>
        <span class="action-icon">＋</span>
        <span>
          <strong>Ajouter depuis l’appareil</strong>
          <small>Photos & vidéos · max 95 MB/fichier</small>
        </span>
      </button>
      <input id="file-input" type="file" accept="image/*,video/*" multiple hidden />
    </section>

    <p class="upload-note" id="upload-note" role="status" aria-live="polite"></p>

    <section class="gallery-section">
      <div class="section-title">
        <div>
          <p class="eyebrow">GALERIE</p>
          <h2>Moments partagés</h2>
        </div>
        <span class="count" id="media-count">0 média</span>
      </div>

      <div class="empty-state" id="gallery-empty">
        <div class="empty-orbit"><span>♡</span></div>
        <h3>Le coffre est encore vide</h3>
        <p>Ajoute une photo ou une vidéo depuis ton appareil pour commencer.</p>
      </div>
      <div class="gallery" id="gallery" hidden></div>
    </section>

    <footer>
      <span>NaughtyShare v0.2.0</span>
      <span>Code ≠ médias · aucun contenu privé dans Git</span>
    </footer>
  </main>
`;

const status = document.querySelector('#vault-status');
const deviceUpload = document.querySelector('#device-upload');
const fileInput = document.querySelector('#file-input');
const uploadNote = document.querySelector('#upload-note');
const gallery = document.querySelector('#gallery');
const emptyState = document.querySelector('#gallery-empty');
const mediaCount = document.querySelector('#media-count');

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / 1024 ** 2).toFixed(1)} Mo`;
}

function renderGallery(items) {
  gallery.replaceChildren();
  mediaCount.textContent = `${items.length} média${items.length > 1 ? 's' : ''}`;
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
    const when = Number.isNaN(date.getTime()) ? '' : date.toLocaleString('fr-FR');
    details.textContent = [formatBytes(item.sizeBytes), when].filter(Boolean).join(' · ');

    meta.append(name, details);
    card.append(preview, meta);
    gallery.append(card);
  }
}

async function loadGallery() {
  const response = await fetch('/api/media', {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });

  if (!response.ok) throw new Error(`Gallery HTTP ${response.status}`);
  const data = await response.json();
  renderGallery(Array.isArray(data.items) ? data.items : []);
}

async function uploadFile(file, index, total) {
  if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
    throw new Error(`${file.name} n’est pas une image ou une vidéo reconnue.`);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`${file.name} dépasse 95 MB.`);
  }

  uploadNote.dataset.state = 'working';
  uploadNote.textContent = `Envoi ${index}/${total} · ${file.name}…`;

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
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Upload HTTP ${response.status}`);
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
    uploadNote.textContent = `${selected.length} fichier${selected.length > 1 ? 's' : ''} ajouté${selected.length > 1 ? 's' : ''} au coffre.`;
    await loadGallery();
  } catch (error) {
    uploadNote.dataset.state = 'error';
    uploadNote.textContent = error instanceof Error ? error.message : 'Échec de l’envoi.';
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
    status.lastElementChild.textContent = 'Coffre connecté';
    deviceUpload.disabled = false;
    await loadGallery();
  } catch {
    status.dataset.state = 'offline';
    status.lastElementChild.textContent = 'Coffre non configuré';
    deviceUpload.disabled = true;
  }
}

deviceUpload.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => uploadFiles(fileInput.files));

checkVault();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // The app remains usable without offline shell support.
    });
  });
}
