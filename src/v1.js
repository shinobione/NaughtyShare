import './v1.css';
import exifr from 'exifr';

const APP_VERSION = '1.0.0';
const MAX_DIRECT_BYTES = 95 * 1024 * 1024;
const MAX_LARGE_BYTES = 5 * 1024 * 1024 * 1024;
const VIDEO_SCAN_BYTES = 8 * 1024 * 1024;
const QUICKTIME_EPOCH_MS = Date.UTC(1904, 0, 1);
const EXIF_TAGS = ['DateTimeOriginal', 'CreateDate', 'DateTimeDigitized', 'DateTime'];
const PENDING_UPLOAD_KEY = 'naughtyshare-v1-pending-upload';
const BACKUP_SCHEMA = 'naughtyshare-metadata-backup';
const BACKUP_VERSION = 1;
const THUMB_MAX_DIM = 560;
const THUMB_QUALITY = 0.78;
const THUMB_UPLOAD_LIMIT = 1024 * 1024;

const copy = {
  fr: {
    eyebrow: 'V1 · FIABILITÉ',
    title: 'Mobile & sauvegarde',
    intro: 'Reprise des gros envois, aperçus légers, gestes vidéo sûrs et sauvegarde de l’organisation.',
    uploadTitle: 'Gros envois robustes',
    uploadIdle: 'Les fichiers >95 Mo utilisent des blocs parallèles et peuvent reprendre après un rechargement.',
    uploadPending: (name, percent) => `Envoi interrompu · ${name} · ${percent}% déjà sécurisé`,
    uploadExpired: 'La session précédente a expiré. Abandonne-la puis relance le fichier.',
    resume: 'Reprendre',
    abandon: 'Abandonner',
    resumePick: 'Resélectionne exactement le même fichier pour reprendre.',
    resumeMismatch: 'Ce n’est pas le même fichier. La reprise a été refusée.',
    resumeRunning: (name, percent) => `Reprise ${name} · ${percent}%…`,
    uploadStarting: (name) => `Préparation ${name}…`,
    uploadPart: (name, percent, done, total) => `${name} · ${percent}% · ${done}/${total} blocs`,
    uploadFinish: 'Finalisation dans le coffre…',
    uploadPaused: 'Connexion interrompue : la session est conservée. Tu peux recharger puis reprendre.',
    uploadDone: (count) => `${count} fichier${count > 1 ? 's' : ''} ajouté${count > 1 ? 's' : ''}.`,
    uploadUnsupported: (name) => `${name} n’est pas une image ou une vidéo reconnue.`,
    uploadTooLarge: (name) => `${name} dépasse la limite NaughtyShare de 5 Go.`,
    pendingFirst: 'Un gros envoi est déjà en attente. Reprends-le ou abandonne-le avant d’en démarrer un autre.',
    backupTitle: 'Sauvegarde de l’organisation',
    backupBody: 'Exporte collections, légendes, favoris, dates et rotations. Les photos/vidéos elles-mêmes ne sont pas incluses.',
    export: 'Exporter JSON',
    restore: 'Restaurer JSON',
    backupExported: 'Sauvegarde métadonnées exportée.',
    backupInvalid: 'Fichier de sauvegarde NaughtyShare invalide.',
    backupConfirm: 'Restaurer cette sauvegarde sur les médias encore présents ? Les métadonnées correspondantes seront remplacées et les collections seront fusionnées.',
    restoring: 'Restauration des métadonnées…',
    restoreDone: (media, collections) => `Restauration terminée · ${media} médias · ${collections} collections.`,
    restorePartial: 'Restauration partielle : tu peux relancer le même JSON sans supprimer les médias.',
    backupPrivacy: 'Ce JSON peut contenir des noms et légendes privés : garde-le dans un endroit sûr.',
    previewTitle: 'Aperçus privés',
    previewBody: 'Les miniatures WebP sont générées sans modifier les originaux et restent dans le R2 privé.',
    videoSwipe: 'Vidéo : swipe depuis le bord gauche/droit, hors zone des contrôles.',
    version: `NaughtyShare v${APP_VERSION}`,
  },
  vi: {
    eyebrow: 'V1 · ỔN ĐỊNH',
    title: 'Di động & sao lưu',
    intro: 'Tiếp tục tải tệp lớn, ảnh xem trước nhẹ, vuốt video an toàn và sao lưu cách sắp xếp.',
    uploadTitle: 'Tải tệp lớn ổn định',
    uploadIdle: 'Tệp >95 MB dùng nhiều phần song song và có thể tiếp tục sau khi tải lại trang.',
    uploadPending: (name, percent) => `Tải bị gián đoạn · ${name} · đã lưu ${percent}%`,
    uploadExpired: 'Phiên tải trước đã hết hạn. Hãy hủy rồi tải lại tệp.',
    resume: 'Tiếp tục',
    abandon: 'Hủy phiên',
    resumePick: 'Chọn lại đúng tệp đó để tiếp tục.',
    resumeMismatch: 'Không phải cùng một tệp. Đã từ chối tiếp tục.',
    resumeRunning: (name, percent) => `Đang tiếp tục ${name} · ${percent}%…`,
    uploadStarting: (name) => `Đang chuẩn bị ${name}…`,
    uploadPart: (name, percent, done, total) => `${name} · ${percent}% · ${done}/${total} phần`,
    uploadFinish: 'Đang hoàn tất trong kho…',
    uploadPaused: 'Mất kết nối: phiên tải vẫn được giữ. Có thể tải lại trang rồi tiếp tục.',
    uploadDone: (count) => `Đã thêm ${count} tệp.`,
    uploadUnsupported: (name) => `${name} không phải ảnh hoặc video được hỗ trợ.`,
    uploadTooLarge: (name) => `${name} vượt quá giới hạn 5 GB của NaughtyShare.`,
    pendingFirst: 'Đang có một tệp lớn chờ tiếp tục. Hãy tiếp tục hoặc hủy trước khi bắt đầu tệp lớn khác.',
    backupTitle: 'Sao lưu cách sắp xếp',
    backupBody: 'Xuất bộ sưu tập, chú thích, yêu thích, ngày và xoay ảnh. Không bao gồm chính ảnh/video.',
    export: 'Xuất JSON',
    restore: 'Khôi phục JSON',
    backupExported: 'Đã xuất sao lưu siêu dữ liệu.',
    backupInvalid: 'Tệp sao lưu NaughtyShare không hợp lệ.',
    backupConfirm: 'Khôi phục sao lưu này cho các nội dung vẫn còn? Siêu dữ liệu tương ứng sẽ được thay thế và bộ sưu tập sẽ được hợp nhất.',
    restoring: 'Đang khôi phục siêu dữ liệu…',
    restoreDone: (media, collections) => `Khôi phục xong · ${media} mục · ${collections} bộ sưu tập.`,
    restorePartial: 'Khôi phục một phần: có thể chạy lại cùng JSON mà không xóa nội dung.',
    backupPrivacy: 'JSON này có thể chứa tên và chú thích riêng tư: hãy lưu ở nơi an toàn.',
    previewTitle: 'Ảnh xem trước riêng tư',
    previewBody: 'Thumbnail WebP được tạo mà không thay đổi bản gốc và vẫn nằm trong R2 riêng tư.',
    videoSwipe: 'Video: vuốt từ mép trái/phải, tránh vùng điều khiển.',
    version: `NaughtyShare v${APP_VERSION}`,
  },
};

let pendingResumeMode = false;
let uploadBusy = false;
let restoreBusy = false;
let galleryObserver = null;
let cardObserver = null;
let thumbWorkerBusy = false;
const thumbQueue = [];
const thumbObjectUrls = new Map();
const thumbChecked = new Set();
const durationSynced = new Set();
const durationMap = new Map();

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
  if (typeof options.body === 'string' && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(path, { ...options, headers, cache: 'no-store' });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const error = new Error(payload?.error || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.status === 204 ? null : response.json();
}

function setNotice(message, state = 'ok') {
  const note = document.querySelector('#upload-note');
  if (!note) return;
  note.dataset.state = state;
  note.textContent = message;
}

function readPendingUpload() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PENDING_UPLOAD_KEY) || 'null');
    if (!parsed?.id || !parsed?.name || !Number.isFinite(parsed?.size) || !Number.isFinite(parsed?.partSize)) return null;
    parsed.parts = Array.isArray(parsed.parts) ? parsed.parts : [];
    return parsed;
  } catch {
    return null;
  }
}

function writePendingUpload(value) {
  try {
    localStorage.setItem(PENDING_UPLOAD_KEY, JSON.stringify(value));
  } catch {
    // Resume is best effort when localStorage is unavailable.
  }
  renderPendingUpload();
}

function clearPendingUpload() {
  try {
    localStorage.removeItem(PENDING_UPLOAD_KEY);
  } catch {
    // Nothing else to do.
  }
  pendingResumeMode = false;
  renderPendingUpload();
}

function pendingProgress(pending) {
  if (!pending) return 0;
  const totalParts = Math.ceil(pending.size / pending.partSize);
  if (!totalParts) return 0;
  const completed = new Set(pending.parts.map((part) => Number(part.partNumber)).filter(Number.isFinite));
  let bytes = 0;
  for (const partNumber of completed) {
    const begin = (partNumber - 1) * pending.partSize;
    if (begin >= pending.size) continue;
    bytes += Math.min(pending.partSize, pending.size - begin);
  }
  return Math.min(100, Math.round((bytes / pending.size) * 100));
}

function inferContentType(file) {
  if (file.type?.startsWith('image/') || file.type?.startsWith('video/')) return file.type;
  return '';
}

async function fileEdgeFingerprint(file) {
  const edge = Math.min(256 * 1024, file.size);
  const first = new Uint8Array(await file.slice(0, edge).arrayBuffer());
  const tailStart = Math.max(0, file.size - edge);
  const tail = new Uint8Array(await file.slice(tailStart, file.size).arrayBuffer());
  const meta = new TextEncoder().encode(`${file.name}\n${file.size}\n${file.type}\n${file.lastModified}\n`);
  const bytes = new Uint8Array(meta.length + first.length + tail.length);
  bytes.set(meta, 0);
  bytes.set(first, meta.length);
  bytes.set(tail, meta.length + first.length);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, (value) => value.toString(16).padStart(2, '0')).join('');
}

function normalizeDateCandidate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'string') {
    const match = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(value.trim());
    if (match) {
      const [, year, month, day, hour, minute, second] = match;
      const parsed = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function plausibleDate(date) {
  return date instanceof Date && !Number.isNaN(date.getTime()) && date.getFullYear() >= 1800 && date.getFullYear() <= 2200;
}

async function extractImageDate(file) {
  try {
    const parsed = await exifr.parse(file, EXIF_TAGS);
    for (const tag of EXIF_TAGS) {
      const date = normalizeDateCandidate(parsed?.[tag]);
      if (plausibleDate(date)) return date;
    }
  } catch {
    // Metadata is optional.
  }
  return null;
}

function readU32(bytes, offset) {
  if (offset < 0 || offset + 4 > bytes.length) return null;
  return (((bytes[offset] << 24) >>> 0) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0;
}

function readU64(bytes, offset) {
  if (offset < 0 || offset + 8 > bytes.length) return null;
  const high = readU32(bytes, offset);
  const low = readU32(bytes, offset + 4);
  if (high == null || low == null) return null;
  const value = BigInt(high) * 0x1_0000_0000n + BigInt(low);
  return value > BigInt(Number.MAX_SAFE_INTEGER) ? null : Number(value);
}

function movieDateFromSeconds(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  let date = new Date(QUICKTIME_EPOCH_MS + seconds * 1000);
  if (date.getFullYear() < 1980 && seconds > 315_532_800) {
    const unix = new Date(seconds * 1000);
    if (plausibleDate(unix) && unix.getFullYear() >= 1980) date = unix;
  }
  return plausibleDate(date) ? date : null;
}

function scanMovieHeader(bytes) {
  for (const type of ['mvhd', 'tkhd', 'mdhd']) {
    const chars = Array.from(type, (char) => char.charCodeAt(0));
    for (let i = 4; i + 20 < bytes.length; i += 1) {
      if (bytes[i] !== chars[0] || bytes[i + 1] !== chars[1] || bytes[i + 2] !== chars[2] || bytes[i + 3] !== chars[3]) continue;
      const value = bytes[i + 4] === 1 ? readU64(bytes, i + 8) : readU32(bytes, i + 8);
      const date = movieDateFromSeconds(value);
      if (date) return date;
    }
  }
  return null;
}

async function extractVideoDate(file) {
  try {
    const firstLength = Math.min(file.size, VIDEO_SCAN_BYTES);
    const first = new Uint8Array(await file.slice(0, firstLength).arrayBuffer());
    const firstDate = scanMovieHeader(first);
    if (firstDate) return firstDate;
    if (file.size > firstLength) {
      const start = Math.max(0, file.size - VIDEO_SCAN_BYTES);
      return scanMovieHeader(new Uint8Array(await file.slice(start).arrayBuffer()));
    }
  } catch {
    // Metadata is optional.
  }
  return null;
}

async function extractCapture(file) {
  let date = null;
  let source = null;
  if (file.type?.startsWith('image/')) {
    date = await extractImageDate(file);
    if (date) source = 'exif';
  } else if (file.type?.startsWith('video/')) {
    date = await extractVideoDate(file);
    if (date) source = 'container';
  }
  if (!date && Number.isFinite(file.lastModified) && file.lastModified > 0) {
    const fallback = new Date(file.lastModified);
    if (plausibleDate(fallback)) {
      date = fallback;
      source = 'file';
    }
  }
  return date ? { capturedAt: date.toISOString(), capturedAtSource: source } : null;
}

async function patchCapture(mediaId, capture) {
  if (!mediaId || !capture) return;
  await api(`/api/library/media/${encodeURIComponent(mediaId)}`, {
    method: 'PATCH',
    body: JSON.stringify(capture),
  }).catch(() => {});
}

async function uploadDirect(file) {
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
    const payload = await response.json().catch(() => ({}));
    const error = new Error(payload?.error || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return (await response.json())?.item || null;
}

function multipartConcurrency() {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (connection?.saveData) return 1;
  if (['slow-2g', '2g', '3g'].includes(connection?.effectiveType)) return 2;
  return 3;
}

async function runPartPool(partNumbers, concurrency, worker) {
  let cursor = 0;
  async function runner() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= partNumbers.length) return;
      await worker(partNumbers[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, partNumbers.length)) }, () => runner()));
}

async function createPendingUpload(file) {
  const start = await api('/api/library/uploads', {
    method: 'POST',
    body: JSON.stringify({ name: file.name, contentType: file.type, sizeBytes: file.size }),
  });
  const pending = {
    id: start.id,
    name: file.name,
    type: file.type,
    size: file.size,
    lastModified: file.lastModified,
    fingerprint: await fileEdgeFingerprint(file),
    partSize: Number(start.partSizeBytes),
    parts: [],
    startedAt: Date.now(),
    expiresAt: Date.now() + 23 * 60 * 60 * 1000,
  };
  writePendingUpload(pending);
  return pending;
}

async function uploadMultipart(file, pending) {
  const totalParts = Math.ceil(file.size / pending.partSize);
  const partMap = new Map(pending.parts.map((part) => [Number(part.partNumber), part]));
  const missing = [];
  for (let partNumber = 1; partNumber <= totalParts; partNumber += 1) {
    if (!partMap.has(partNumber)) missing.push(partNumber);
  }

  const updateProgress = () => {
    pending.parts = Array.from(partMap.values()).sort((a, b) => a.partNumber - b.partNumber);
    writePendingUpload(pending);
    setNotice(tr('uploadPart', file.name, pendingProgress(pending), pending.parts.length, totalParts), 'working');
  };
  updateProgress();

  await runPartPool(missing, multipartConcurrency(), async (partNumber) => {
    const begin = (partNumber - 1) * pending.partSize;
    const end = Math.min(file.size, begin + pending.partSize);
    const blob = file.slice(begin, end);
    const part = await api(`/api/library/uploads/${encodeURIComponent(pending.id)}/parts/${partNumber}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Part-Size': String(blob.size),
      },
      body: blob,
    });
    partMap.set(partNumber, { partNumber: Number(part.partNumber), etag: part.etag });
    updateProgress();
  });

  const parts = Array.from(partMap.values()).sort((a, b) => a.partNumber - b.partNumber);
  if (parts.length !== totalParts) throw new Error('Multipart upload is incomplete');
  setNotice(tr('uploadFinish'), 'working');
  const completed = await api(`/api/library/uploads/${encodeURIComponent(pending.id)}/complete`, {
    method: 'POST',
    body: JSON.stringify({ parts }),
  });
  clearPendingUpload();
  return completed?.item || null;
}

async function handleLargeSelection(files) {
  if (uploadBusy) return;
  const selected = Array.from(files || []);
  if (!selected.length) return;

  const existing = readPendingUpload();
  if (existing && selected.some((file) => file.size > MAX_DIRECT_BYTES)) {
    setNotice(tr('pendingFirst'), 'error');
    return;
  }

  uploadBusy = true;
  const deviceButton = document.querySelector('#device-upload');
  if (deviceButton) deviceButton.disabled = true;
  let completedCount = 0;

  try {
    for (const file of selected) {
      if (!inferContentType(file)) throw new Error(tr('uploadUnsupported', file.name));
      if (file.size > MAX_LARGE_BYTES) throw new Error(tr('uploadTooLarge', file.name));
      setNotice(tr('uploadStarting', file.name), 'working');
      const capture = await extractCapture(file);
      let item;
      if (file.size <= MAX_DIRECT_BYTES) {
        item = await uploadDirect(file);
      } else {
        const pending = await createPendingUpload(file);
        item = await uploadMultipart(file, pending);
      }
      if (item?.id) await patchCapture(item.id, capture);
      completedCount += 1;
    }
    setNotice(tr('uploadDone', completedCount), 'ok');
    window.setTimeout(() => window.location.reload(), 450);
  } catch (error) {
    const pending = readPendingUpload();
    if (pending) {
      setNotice(error?.status === 410 ? tr('uploadExpired') : tr('uploadPaused'), 'error');
    } else {
      setNotice(error instanceof Error ? error.message : tr('uploadPaused'), 'error');
    }
  } finally {
    uploadBusy = false;
    if (deviceButton) deviceButton.disabled = false;
    const input = document.querySelector('#file-input');
    if (input) input.value = '';
    renderPendingUpload();
  }
}

async function resumePendingWithFile(file) {
  const pending = readPendingUpload();
  if (!pending || uploadBusy) return;
  uploadBusy = true;
  try {
    if (pending.expiresAt && pending.expiresAt <= Date.now()) {
      setNotice(tr('uploadExpired'), 'error');
      return;
    }
    const fingerprint = await fileEdgeFingerprint(file);
    if (file.name !== pending.name || file.size !== pending.size || fingerprint !== pending.fingerprint) {
      setNotice(tr('resumeMismatch'), 'error');
      return;
    }
    setNotice(tr('resumeRunning', file.name, pendingProgress(pending)), 'working');
    const capture = await extractCapture(file);
    const item = await uploadMultipart(file, pending);
    if (item?.id) await patchCapture(item.id, capture);
    setNotice(tr('uploadDone', 1), 'ok');
    window.setTimeout(() => window.location.reload(), 450);
  } catch (error) {
    if (error?.status === 404 || error?.status === 410) {
      setNotice(tr('uploadExpired'), 'error');
    } else {
      setNotice(tr('uploadPaused'), 'error');
    }
  } finally {
    uploadBusy = false;
    pendingResumeMode = false;
    const input = document.querySelector('#v1-resume-input');
    if (input) input.value = '';
    renderPendingUpload();
  }
}

async function abandonPendingUpload() {
  const pending = readPendingUpload();
  if (!pending || uploadBusy) return;
  await fetch(`/api/library/uploads/${encodeURIComponent(pending.id)}`, {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  }).catch(() => {});
  clearPendingUpload();
  setNotice(tr('uploadIdle'), 'ok');
}

function injectV1Ui() {
  if (document.querySelector('#v1-section')) return;
  const footer = document.querySelector('.shell > footer');
  if (!footer) return;
  footer.insertAdjacentHTML('beforebegin', `
    <section class="v1-section" id="v1-section">
      <div class="v1-head">
        <div>
          <p class="eyebrow" id="v1-eyebrow"></p>
          <h2 id="v1-title"></h2>
          <p id="v1-intro"></p>
        </div>
      </div>
      <div class="v1-grid">
        <article class="v1-card v1-upload-card">
          <span class="v1-icon">⟳</span>
          <div class="v1-card-copy">
            <strong id="v1-upload-title"></strong>
            <small id="v1-upload-status"></small>
          </div>
          <div class="v1-actions">
            <button type="button" id="v1-resume" hidden></button>
            <button type="button" id="v1-abandon" class="secondary" hidden></button>
          </div>
          <input type="file" id="v1-resume-input" accept="image/*,video/*" hidden />
        </article>
        <article class="v1-card">
          <span class="v1-icon">◇</span>
          <div class="v1-card-copy">
            <strong id="v1-preview-title"></strong>
            <small id="v1-preview-body"></small>
            <small id="v1-video-swipe" class="v1-subnote"></small>
          </div>
        </article>
        <article class="v1-card v1-backup-card">
          <span class="v1-icon">⇩</span>
          <div class="v1-card-copy">
            <strong id="v1-backup-title"></strong>
            <small id="v1-backup-body"></small>
            <small id="v1-backup-privacy" class="v1-subnote"></small>
          </div>
          <div class="v1-actions">
            <button type="button" id="v1-export"></button>
            <button type="button" id="v1-restore" class="secondary"></button>
          </div>
          <input type="file" id="v1-restore-input" accept="application/json,.json" hidden />
        </article>
      </div>
    </section>
  `);

  document.querySelector('#v1-resume')?.addEventListener('click', () => {
    pendingResumeMode = true;
    setNotice(tr('resumePick'), 'working');
    document.querySelector('#v1-resume-input')?.click();
  });
  document.querySelector('#v1-abandon')?.addEventListener('click', abandonPendingUpload);
  document.querySelector('#v1-resume-input')?.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (file) resumePendingWithFile(file);
  });
  document.querySelector('#v1-export')?.addEventListener('click', exportMetadataBackup);
  document.querySelector('#v1-restore')?.addEventListener('click', () => document.querySelector('#v1-restore-input')?.click());
  document.querySelector('#v1-restore-input')?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (file) await restoreMetadataBackup(file);
    event.target.value = '';
  });
}

function renderPendingUpload() {
  const status = document.querySelector('#v1-upload-status');
  const resume = document.querySelector('#v1-resume');
  const abandon = document.querySelector('#v1-abandon');
  if (!status || !resume || !abandon) return;
  const pending = readPendingUpload();
  if (!pending) {
    status.textContent = tr('uploadIdle');
    resume.hidden = true;
    abandon.hidden = true;
    return;
  }
  status.textContent = pending.expiresAt && pending.expiresAt <= Date.now()
    ? tr('uploadExpired')
    : tr('uploadPending', pending.name, pendingProgress(pending));
  resume.textContent = tr('resume');
  abandon.textContent = tr('abandon');
  resume.hidden = false;
  abandon.hidden = false;
}

function applyV1Language() {
  const bindings = {
    '#v1-eyebrow': tr('eyebrow'),
    '#v1-title': tr('title'),
    '#v1-intro': tr('intro'),
    '#v1-upload-title': tr('uploadTitle'),
    '#v1-preview-title': tr('previewTitle'),
    '#v1-preview-body': tr('previewBody'),
    '#v1-video-swipe': tr('videoSwipe'),
    '#v1-backup-title': tr('backupTitle'),
    '#v1-backup-body': tr('backupBody'),
    '#v1-backup-privacy': tr('backupPrivacy'),
    '#v1-export': tr('export'),
    '#v1-restore': tr('restore'),
  };
  for (const [selector, text] of Object.entries(bindings)) {
    const node = document.querySelector(selector);
    if (node) node.textContent = text;
  }
  renderPendingUpload();
}

async function exportMetadataBackup() {
  if (restoreBusy) return;
  try {
    const [media, library] = await Promise.all([api('/api/media'), api('/api/library/state')]);
    const payload = {
      schema: BACKUP_SCHEMA,
      version: BACKUP_VERSION,
      appVersion: APP_VERSION,
      exportedAt: new Date().toISOString(),
      media: Array.isArray(media?.items) ? media.items.map((item) => ({
        id: item.id,
        originalName: item.originalName,
        contentType: item.contentType,
        sizeBytes: item.sizeBytes,
        createdAt: item.createdAt,
      })) : [],
      library: {
        collections: Array.isArray(library?.collections) ? library.collections : [],
        mediaMeta: library?.mediaMeta && typeof library.mediaMeta === 'object' ? library.mediaMeta : {},
        momentsUi: library?.momentsUi && typeof library.momentsUi === 'object' ? library.momentsUi : {},
      },
      note: 'Metadata/organization backup only. Original media bytes are not included.',
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    anchor.href = url;
    anchor.download = `naughtyshare-metadata-${stamp}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice(tr('backupExported'), 'ok');
  } catch (error) {
    setNotice(error instanceof Error ? error.message : tr('backupInvalid'), 'error');
  }
}

function validBackup(payload) {
  return payload?.schema === BACKUP_SCHEMA
    && Number(payload?.version) === BACKUP_VERSION
    && Array.isArray(payload?.media)
    && Array.isArray(payload?.library?.collections)
    && payload?.library?.mediaMeta
    && typeof payload.library.mediaMeta === 'object';
}

async function runTasks(tasks, concurrency = 4) {
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= tasks.length) return;
      await tasks[index]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, tasks.length)) }, () => worker()));
}

function collectionSignature(collection) {
  return `${String(collection?.kind || 'collection')}\u0000${String(collection?.name || '').trim().toLocaleLowerCase()}`;
}

async function restoreMetadataBackup(file) {
  if (restoreBusy || file.size > 8 * 1024 * 1024) return;
  let backup;
  try {
    backup = JSON.parse(await file.text());
  } catch {
    setNotice(tr('backupInvalid'), 'error');
    return;
  }
  if (!validBackup(backup)) {
    setNotice(tr('backupInvalid'), 'error');
    return;
  }
  if (!window.confirm(tr('backupConfirm'))) return;

  restoreBusy = true;
  setNotice(tr('restoring'), 'working');
  try {
    const [media, currentState] = await Promise.all([api('/api/media'), api('/api/library/state')]);
    const existingMediaIds = new Set((media?.items || []).map((item) => item.id));
    const backupMeta = backup.library.mediaMeta || {};
    const metaTasks = [];
    let restoredMedia = 0;

    for (const [mediaId, source] of Object.entries(backupMeta)) {
      if (!existingMediaIds.has(mediaId) || !source || typeof source !== 'object') continue;
      const body = {};
      for (const key of ['favorite', 'caption', 'eventDate', 'capturedAt', 'capturedAtSource', 'rotation']) {
        if (Object.hasOwn(source, key)) body[key] = source[key];
      }
      if (!Object.keys(body).length) continue;
      metaTasks.push(async () => {
        await api(`/api/library/media/${encodeURIComponent(mediaId)}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        restoredMedia += 1;
      });
    }
    await runTasks(metaTasks, 4);

    const currentCollections = Array.isArray(currentState?.collections) ? currentState.collections : [];
    const currentBySignature = new Map(currentCollections.map((collection) => [collectionSignature(collection), collection]));
    const idMap = new Map();
    const backupCollections = backup.library.collections || [];

    for (const source of backupCollections) {
      if (!source?.id || !source?.name) continue;
      const signature = collectionSignature(source);
      let target = currentBySignature.get(signature) || null;
      const body = {
        name: source.name,
        kind: source.kind || 'collection',
        description: source.description || '',
        eventDate: source.eventDate || null,
        icon: source.icon || '♡',
        tone: Number.isInteger(source.tone) ? source.tone : 0,
      };
      if (target) {
        const updated = await api(`/api/library/collections/${encodeURIComponent(target.id)}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        target = { ...target, ...(updated?.collection || {}) };
      } else {
        const created = await api('/api/library/collections', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        target = created?.collection || null;
        if (target) currentBySignature.set(signature, target);
      }
      if (!target?.id) continue;
      idMap.set(source.id, target.id);

      const membershipTasks = (source.mediaIds || [])
        .filter((mediaId) => existingMediaIds.has(mediaId))
        .map((mediaId) => () => api(
          `/api/library/collections/${encodeURIComponent(target.id)}/items/${encodeURIComponent(mediaId)}`,
          { method: 'PUT' },
        ));
      await runTasks(membershipTasks, 5);
    }

    const sourceUi = backup.library.momentsUi || {};
    const collectionOrder = (sourceUi.collectionOrder || []).map((oldId) => idMap.get(oldId)).filter(Boolean);
    const covers = {};
    for (const [oldCollectionId, mediaId] of Object.entries(sourceUi.covers || {})) {
      const mappedId = idMap.get(oldCollectionId);
      if (mappedId && existingMediaIds.has(mediaId)) covers[mappedId] = mediaId;
    }
    if (collectionOrder.length || Object.keys(covers).length) {
      await api('/api/library/moments-ui', {
        method: 'PATCH',
        body: JSON.stringify({ collectionOrder, covers }),
      });
    }

    setNotice(tr('restoreDone', restoredMedia, idMap.size), 'ok');
    window.setTimeout(() => window.location.reload(), 650);
  } catch (error) {
    setNotice(error instanceof Error ? `${tr('restorePartial')} · ${error.message}` : tr('restorePartial'), 'error');
  } finally {
    restoreBusy = false;
  }
}

function canvasBlob(source, width, height) {
  const scale = Math.min(1, THUMB_MAX_DIM / Math.max(width, height));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) return Promise.resolve(null);
  context.drawImage(source, 0, 0, targetWidth, targetHeight);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', THUMB_QUALITY));
}

async function uploadThumbnail(mediaId, blob) {
  if (!blob || blob.size <= 0 || blob.size > THUMB_UPLOAD_LIMIT) return false;
  const response = await fetch(`/api/v1/thumbnails/${encodeURIComponent(mediaId)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'image/webp',
      'X-Thumbnail-Size': String(blob.size),
      Accept: 'application/json',
    },
    body: blob,
  });
  return response.ok;
}

function setThumbObjectUrl(mediaId, blob, target, { poster = false } = {}) {
  const previous = thumbObjectUrls.get(mediaId);
  if (previous) URL.revokeObjectURL(previous);
  const url = URL.createObjectURL(blob);
  thumbObjectUrls.set(mediaId, url);
  if (poster) target.poster = url;
  else target.src = url;
}

async function fetchThumbnail(mediaId) {
  const response = await fetch(`/thumbnail/${encodeURIComponent(mediaId)}`, { cache: 'no-store' });
  if (!response.ok) return null;
  const blob = await response.blob();
  return blob.type.startsWith('image/') && blob.size > 0 ? blob : null;
}

function queueThumbnail(task) {
  thumbQueue.push(task);
  pumpThumbnailQueue();
}

async function pumpThumbnailQueue() {
  if (thumbWorkerBusy) return;
  thumbWorkerBusy = true;
  try {
    while (thumbQueue.length) {
      const task = thumbQueue.shift();
      await task().catch(() => {});
    }
  } finally {
    thumbWorkerBusy = false;
  }
}

function waitForEvent(target, type, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error(`${type} timeout`));
    }, timeout);
    const done = () => {
      cleanup();
      resolve();
    };
    const cleanup = () => {
      window.clearTimeout(timer);
      target.removeEventListener(type, done);
      target.removeEventListener('error', fail);
    };
    const fail = () => {
      cleanup();
      reject(new Error(`${type} failed`));
    };
    target.addEventListener(type, done, { once: true });
    target.addEventListener('error', fail, { once: true });
  });
}

async function makeImageThumbnail(image, mediaId) {
  if (!image.complete || !image.naturalWidth) await waitForEvent(image, 'load');
  const blob = await canvasBlob(image, image.naturalWidth, image.naturalHeight);
  if (!blob) return;
  if (await uploadThumbnail(mediaId, blob)) setThumbObjectUrl(mediaId, blob, image);
}

async function makeVideoThumbnail(video, mediaId) {
  video.preload = 'metadata';
  if (video.readyState < 1) await waitForEvent(video, 'loadedmetadata');
  if (!Number.isFinite(video.duration) || !video.videoWidth || !video.videoHeight) return;

  if (video.readyState < 2) {
    try {
      await waitForEvent(video, 'loadeddata');
    } catch {
      return;
    }
  }
  const seekTarget = Math.min(Math.max(video.duration * 0.04, 0.08), 1.5);
  if (Math.abs(video.currentTime - seekTarget) > 0.05) {
    video.currentTime = seekTarget;
    try {
      await waitForEvent(video, 'seeked');
    } catch {
      return;
    }
  }
  const blob = await canvasBlob(video, video.videoWidth, video.videoHeight);
  if (!blob) return;
  if (await uploadThumbnail(mediaId, blob)) setThumbObjectUrl(mediaId, blob, video, { poster: true });
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${minutes}:${String(secs).padStart(2, '0')}`;
}

function updateCardDuration(card, seconds) {
  const details = card?.querySelector('.media-details');
  if (!details || !Number.isFinite(seconds)) return;
  const formatted = formatDuration(seconds);
  if (details.textContent.includes(' · … · ')) {
    details.textContent = details.textContent.replace(' · … · ', ` · ${formatted} · `);
  }
}

async function persistDuration(mediaId, seconds, card) {
  if (!Number.isFinite(seconds) || seconds < 0 || durationSynced.has(mediaId)) return;
  durationSynced.add(mediaId);
  durationMap.set(mediaId, seconds);
  updateCardDuration(card, seconds);
  applyDurationDomSort();
  await api(`/api/v1/media/${encodeURIComponent(mediaId)}/duration`, {
    method: 'PATCH',
    body: JSON.stringify({ durationSeconds: seconds }),
  }).catch(() => durationSynced.delete(mediaId));
}

async function prepareCard(card) {
  if (!card || card.dataset.v1Prepared === '1') return;
  card.dataset.v1Prepared = '1';
  const mediaId = card.dataset.mediaId;
  const preview = card.querySelector('.media-preview');
  if (!mediaId || !preview) return;

  if (preview instanceof HTMLImageElement) {
    preview.loading = 'lazy';
    preview.decoding = 'async';
    preview.fetchPriority = 'low';
    if (!thumbChecked.has(mediaId)) {
      thumbChecked.add(mediaId);
      const thumbnail = await fetchThumbnail(mediaId).catch(() => null);
      if (thumbnail) {
        setThumbObjectUrl(mediaId, thumbnail, preview);
      } else {
        queueThumbnail(() => makeImageThumbnail(preview, mediaId));
      }
    }
    return;
  }

  if (preview instanceof HTMLVideoElement) {
    preview.preload = 'none';
    preview.muted = true;
    preview.playsInline = true;
    const known = durationMap.get(mediaId);
    if (Number.isFinite(known)) updateCardDuration(card, known);
    preview.addEventListener('loadedmetadata', () => persistDuration(mediaId, preview.duration, card), { once: true });
    if (!thumbChecked.has(mediaId)) {
      thumbChecked.add(mediaId);
      const thumbnail = await fetchThumbnail(mediaId).catch(() => null);
      if (thumbnail) {
        setThumbObjectUrl(mediaId, thumbnail, preview, { poster: true });
      } else {
        queueThumbnail(() => makeVideoThumbnail(preview, mediaId));
      }
    }
    preview.preload = 'metadata';
  }
}

function observeCards() {
  const gallery = document.querySelector('#gallery');
  if (!gallery) return;
  if (!cardObserver && 'IntersectionObserver' in window) {
    cardObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        cardObserver.unobserve(entry.target);
        prepareCard(entry.target);
      }
    }, { rootMargin: '420px 0px' });
  }

  for (const card of gallery.querySelectorAll('.media-card')) {
    if (card.dataset.v1Observed === '1') continue;
    card.dataset.v1Observed = '1';
    if (cardObserver) cardObserver.observe(card);
    else prepareCard(card);
  }

  if (!galleryObserver) {
    galleryObserver = new MutationObserver(() => {
      observeCards();
      window.requestAnimationFrame(applyDurationDomSort);
    });
    galleryObserver.observe(gallery, { childList: true, subtree: true });
  }
}

async function loadPersistedDurations() {
  try {
    const data = await api('/api/media');
    for (const item of data?.items || []) {
      if (Number.isFinite(item.durationSeconds)) durationMap.set(item.id, item.durationSeconds);
    }
    document.querySelectorAll('#gallery .media-card').forEach((card) => {
      const duration = durationMap.get(card.dataset.mediaId);
      if (Number.isFinite(duration)) updateCardDuration(card, duration);
    });
    applyDurationDomSort();
  } catch {
    // Derived metadata can be learned again from video elements.
  }
}

function applyDurationDomSort() {
  const select = document.querySelector('#sort-field');
  const gallery = document.querySelector('#gallery');
  if (!gallery || select?.value !== 'duration') return;
  const cards = Array.from(gallery.querySelectorAll('.media-card'));
  if (!cards.length) return;
  const direction = (() => {
    try {
      return localStorage.getItem('naughtyshare-sort-direction') === 'asc' ? 1 : -1;
    } catch {
      return -1;
    }
  })();
  const collator = new Intl.Collator(lang() === 'vi' ? 'vi-VN' : 'fr-FR', { numeric: true, sensitivity: 'base' });

  cards.sort((a, b) => {
    const aVideo = Boolean(a.querySelector('video.media-preview'));
    const bVideo = Boolean(b.querySelector('video.media-preview'));
    const aDuration = aVideo ? durationMap.get(a.dataset.mediaId) : 0;
    const bDuration = bVideo ? durationMap.get(b.dataset.mediaId) : 0;
    const aUnknown = aVideo && !Number.isFinite(aDuration);
    const bUnknown = bVideo && !Number.isFinite(bDuration);
    if (aUnknown && !bUnknown) return 1;
    if (!aUnknown && bUnknown) return -1;
    let comparison = (Number.isFinite(aDuration) ? aDuration : 0) - (Number.isFinite(bDuration) ? bDuration : 0);
    if (!comparison) comparison = collator.compare(a.querySelector('.media-name')?.textContent || '', b.querySelector('.media-name')?.textContent || '');
    return comparison * direction;
  });
  for (const card of cards) gallery.append(card);
}

function setupVideoEdgeSwipe() {
  const stage = document.querySelector('#viewer-stage');
  if (!stage) return;
  let gesture = null;

  stage.addEventListener('touchstart', (event) => {
    const video = event.target instanceof HTMLVideoElement ? event.target : event.target.closest?.('video.viewer-media');
    const touch = event.changedTouches?.[0];
    if (!video || !touch) {
      gesture = null;
      return;
    }
    const rect = video.getBoundingClientRect();
    const edge = Math.max(48, rect.width * 0.17);
    const controlsBand = Math.min(92, Math.max(58, rect.height * 0.18));
    const inHorizontalEdge = touch.clientX <= rect.left + edge || touch.clientX >= rect.right - edge;
    const aboveControls = touch.clientY < rect.bottom - controlsBand;
    gesture = inHorizontalEdge && aboveControls
      ? { x: touch.clientX, y: touch.clientY }
      : null;
  }, { capture: true, passive: true });

  stage.addEventListener('touchend', (event) => {
    if (!gesture) return;
    const touch = event.changedTouches?.[0];
    const start = gesture;
    gesture = null;
    if (!touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < 72 || Math.abs(dx) < Math.abs(dy) * 1.55) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    document.querySelector(dx < 0 ? '#viewer-next' : '#viewer-prev')?.click();
  }, { capture: true, passive: false });
}

function setupUploadInterception() {
  document.addEventListener('change', (event) => {
    if (event.target?.id !== 'file-input') return;
    const files = Array.from(event.target.files || []);
    if (!files.some((file) => file.size > MAX_DIRECT_BYTES)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    handleLargeSelection(files);
  }, true);
}

function setupLanguageObserver() {
  const root = document.documentElement;
  new MutationObserver(() => applyV1Language()).observe(root, { attributes: true, attributeFilter: ['lang'] });
}

function setupSortObservers() {
  document.querySelector('#sort-field')?.addEventListener('change', () => window.setTimeout(applyDurationDomSort, 0));
  document.querySelector('#sort-direction')?.addEventListener('click', () => window.setTimeout(applyDurationDomSort, 0));
}

function ensureVersion() {
  const footer = document.querySelector('#footer-version');
  if (!footer) return;
  const wanted = tr('version');
  const sync = () => {
    if (footer.textContent !== wanted) footer.textContent = wanted;
  };
  sync();
  new MutationObserver(sync).observe(footer, { childList: true, characterData: true, subtree: true });
}

function cleanupObjectUrls() {
  for (const url of thumbObjectUrls.values()) URL.revokeObjectURL(url);
  thumbObjectUrls.clear();
}

async function init() {
  injectV1Ui();
  applyV1Language();
  ensureVersion();
  setupUploadInterception();
  setupVideoEdgeSwipe();
  setupLanguageObserver();
  setupSortObservers();
  observeCards();
  await loadPersistedDurations();
  window.addEventListener('beforeunload', cleanupObjectUrls, { once: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
