import './capture.css';
import exifr from 'exifr';

const APP_VERSION = '0.5.1';
const MAX_DIRECT_BYTES = 95 * 1024 * 1024;
const MAX_LARGE_BYTES = 5 * 1024 * 1024 * 1024;
const EXIF_TAGS = ['DateTimeOriginal', 'CreateDate', 'DateTimeDigitized', 'DateTime'];
const CAPTURE_SORT_KEY = 'naughtyshare-capture-sort-active';
const SORT_DIRECTION_KEY = 'naughtyshare-sort-direction';
const VIDEO_SCAN_BYTES = 8 * 1024 * 1024;
const QUICKTIME_EPOCH_MS = Date.UTC(1904, 0, 1);

const copy = {
  fr: {
    captureSort: 'Date de prise',
    scan: '◷ Analyser les dates',
    scanning: (done, total) => `Analyse des métadonnées · ${done}/${total}…`,
    scanDone: (found, unknown) => `${found} date${found > 1 ? 's' : ''} de prise récupérée${found > 1 ? 's' : ''}${unknown ? ` · ${unknown} inconnue${unknown > 1 ? 's' : ''}` : ''}.`,
    scanNone: 'Toutes les dates disponibles sont déjà indexées.',
    captureDate: 'Date et heure de prise',
    captureUnknown: 'Date de prise inconnue',
    sourceExif: 'EXIF · date de prise enregistrée par l’appareil',
    sourceContainer: 'Métadonnées du conteneur vidéo',
    sourceFile: 'Date du fichier · valeur de secours, pas forcément la prise réelle',
    sourceManual: 'Date corrigée manuellement',
    rotateLeft: 'Tourner à gauche',
    rotateRight: 'Tourner à droite',
    uploadPreparing: 'Lecture des métadonnées…',
    uploadPart: (name, percent, part, total) => `${name} · ${percent}% · bloc ${part}/${total}`,
    uploadFinishing: 'Finalisation dans le coffre…',
    uploadDone: (count) => `${count} fichier${count > 1 ? 's' : ''} ajouté${count > 1 ? 's' : ''} au coffre.`,
    uploadTooLarge: (name) => `${name} dépasse la limite NaughtyShare de 5 Go.`,
    uploadUnsupported: (name) => `${name} n’est pas une image ou une vidéo reconnue.`,
    uploadFailed: 'Échec de l’envoi.',
    capturedPrefix: 'Pris le',
    version: `NaughtyShare v${APP_VERSION}`,
  },
  vi: {
    captureSort: 'Ngày chụp',
    scan: '◷ Phân tích ngày chụp',
    scanning: (done, total) => `Đang đọc siêu dữ liệu · ${done}/${total}…`,
    scanDone: (found, unknown) => `Đã tìm thấy ngày chụp cho ${found} mục${unknown ? ` · ${unknown} mục chưa rõ ngày` : ''}.`,
    scanNone: 'Tất cả ngày có thể đọc đã được lập chỉ mục.',
    captureDate: 'Ngày và giờ chụp',
    captureUnknown: 'Không rõ ngày chụp',
    sourceExif: 'EXIF · ngày chụp do thiết bị ghi lại',
    sourceContainer: 'Siêu dữ liệu của tệp video',
    sourceFile: 'Ngày của tệp · giá trị dự phòng, có thể không phải ngày chụp thật',
    sourceManual: 'Ngày đã chỉnh thủ công',
    rotateLeft: 'Xoay trái',
    rotateRight: 'Xoay phải',
    uploadPreparing: 'Đang đọc siêu dữ liệu…',
    uploadPart: (name, percent, part, total) => `${name} · ${percent}% · phần ${part}/${total}`,
    uploadFinishing: 'Đang hoàn tất trong kho…',
    uploadDone: (count) => `Đã thêm ${count} tệp vào kho.`,
    uploadTooLarge: (name) => `${name} vượt quá giới hạn 5 GB của NaughtyShare.`,
    uploadUnsupported: (name) => `${name} không phải ảnh hoặc video được hỗ trợ.`,
    uploadFailed: 'Tải lên thất bại.',
    capturedPrefix: 'Chụp lúc',
    version: `NaughtyShare v${APP_VERSION}`,
  },
};

let state = { mediaMeta: {} };
let mediaIndex = [];
let captureEditingId = null;
let scanRunning = false;

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
    throw new Error(payload?.error || `HTTP ${response.status}`);
  }
  return response.status === 204 ? null : response.json();
}

function metaFor(id) {
  return state.mediaMeta?.[id] || {};
}

function mediaFor(id) {
  return mediaIndex.find((item) => item.id === id) || null;
}

function normalizeDateCandidate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'string') {
    const exif = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(value.trim());
    if (exif) {
      const [, year, month, day, hour, minute, second] = exif;
      const parsed = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function plausibleDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;
  const year = date.getFullYear();
  return year >= 1800 && year <= 2200;
}

function asIso(date) {
  return plausibleDate(date) ? date.toISOString() : null;
}

function isoToLocalInput(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function localInputToIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function formatCaptureDate(iso) {
  const date = new Date(iso || '');
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(lang() === 'vi' ? 'vi-VN' : 'fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function sourceLabel(source) {
  if (source === 'exif') return tr('sourceExif');
  if (source === 'container') return tr('sourceContainer');
  if (source === 'file') return tr('sourceFile');
  if (source === 'manual') return tr('sourceManual');
  return tr('captureUnknown');
}

async function extractImageDate(input) {
  try {
    const parsed = await exifr.parse(input, EXIF_TAGS);
    if (!parsed) return null;
    for (const tag of EXIF_TAGS) {
      const date = normalizeDateCandidate(parsed[tag]);
      if (plausibleDate(date)) return date;
    }
  } catch {
    // Metadata is optional; unsupported/stripped files simply fall back.
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
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(value);
}

function movieDateFromSeconds(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  let date = new Date(QUICKTIME_EPOCH_MS + seconds * 1000);

  // A few encoders incorrectly write Unix seconds into QuickTime fields.
  // If QuickTime interpretation lands implausibly early, try Unix epoch too.
  if (date.getFullYear() < 1980 && seconds > 315_532_800) {
    const unix = new Date(seconds * 1000);
    if (plausibleDate(unix) && unix.getFullYear() >= 1980) date = unix;
  }
  return plausibleDate(date) ? date : null;
}

function scanMovieHeader(bytes) {
  const types = ['mvhd', 'tkhd', 'mdhd'];
  for (const type of types) {
    const a = type.charCodeAt(0);
    const b = type.charCodeAt(1);
    const c = type.charCodeAt(2);
    const d = type.charCodeAt(3);
    for (let i = 4; i + 20 < bytes.length; i += 1) {
      if (bytes[i] !== a || bytes[i + 1] !== b || bytes[i + 2] !== c || bytes[i + 3] !== d) continue;
      const version = bytes[i + 4];
      const value = version === 1 ? readU64(bytes, i + 8) : readU32(bytes, i + 8);
      const date = movieDateFromSeconds(value);
      if (date) return date;
    }
  }
  return null;
}

async function extractVideoDateFromFile(file) {
  try {
    const firstLength = Math.min(file.size, VIDEO_SCAN_BYTES);
    const first = new Uint8Array(await file.slice(0, firstLength).arrayBuffer());
    const firstDate = scanMovieHeader(first);
    if (firstDate) return firstDate;

    if (file.size > firstLength) {
      const start = Math.max(0, file.size - VIDEO_SCAN_BYTES);
      const tail = new Uint8Array(await file.slice(start, file.size).arrayBuffer());
      return scanMovieHeader(tail);
    }
  } catch {
    // Container metadata is optional.
  }
  return null;
}

async function fetchRange(url, start, end) {
  const response = await fetch(url, {
    headers: { Range: `bytes=${start}-${end}` },
    cache: 'no-store',
  });
  if (!response.ok && response.status !== 206) throw new Error(`HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function extractVideoDateFromRemote(media) {
  try {
    const size = Number(media?.sizeBytes || 0);
    if (!Number.isFinite(size) || size <= 0) return null;
    const firstEnd = Math.min(size, VIDEO_SCAN_BYTES) - 1;
    const first = await fetchRange(media.url, 0, firstEnd);
    const firstDate = scanMovieHeader(first);
    if (firstDate) return firstDate;

    if (size > VIDEO_SCAN_BYTES) {
      const start = Math.max(0, size - VIDEO_SCAN_BYTES);
      const tail = await fetchRange(media.url, start, size - 1);
      return scanMovieHeader(tail);
    }
  } catch {
    // Leave the date unknown rather than downloading the entire video.
  }
  return null;
}

async function extractCaptureFromFile(file) {
  let date = null;
  let source = null;

  if (file.type?.startsWith('image/')) {
    date = await extractImageDate(file);
    if (date) source = 'exif';
  } else if (file.type?.startsWith('video/')) {
    date = await extractVideoDateFromFile(file);
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

async function extractCaptureFromRemote(media) {
  if (media?.contentType?.startsWith('image/')) {
    const date = await extractImageDate(media.url);
    return date ? { capturedAt: date.toISOString(), capturedAtSource: 'exif' } : null;
  }
  if (media?.contentType?.startsWith('video/')) {
    const date = await extractVideoDateFromRemote(media);
    return date ? { capturedAt: date.toISOString(), capturedAtSource: 'container' } : null;
  }
  return null;
}

async function patchCapture(mediaId, payload) {
  const data = await api(`/api/library/media/${encodeURIComponent(mediaId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  state.mediaMeta[mediaId] = { ...(state.mediaMeta[mediaId] || {}), ...(data?.meta || payload) };
  return state.mediaMeta[mediaId];
}

function captureSortActive() {
  try {
    return localStorage.getItem(CAPTURE_SORT_KEY) === '1';
  } catch {
    return false;
  }
}

function setCaptureSortActive(enabled) {
  try {
    if (enabled) localStorage.setItem(CAPTURE_SORT_KEY, '1');
    else localStorage.removeItem(CAPTURE_SORT_KEY);
  } catch {
    // Sorting remains usable for the current session.
  }
}

function sortDirection() {
  try {
    return localStorage.getItem(SORT_DIRECTION_KEY) === 'asc' ? 1 : -1;
  } catch {
    return -1;
  }
}

function captureTimestamp(id) {
  const meta = metaFor(id);
  const date = new Date(meta.capturedAt || '');
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

function fallbackTimestamp(id) {
  const media = mediaFor(id);
  const date = new Date(media?.createdAt || '');
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function applyCaptureSort() {
  if (!captureSortActive()) return;
  const gallery = document.querySelector('#gallery');
  if (!gallery) return;
  const cards = Array.from(gallery.querySelectorAll('.media-card'));
  const direction = sortDirection();
  const desired = [...cards].sort((a, b) => {
    const aId = a.dataset.mediaId;
    const bId = b.dataset.mediaId;
    const aCapture = captureTimestamp(aId);
    const bCapture = captureTimestamp(bId);
    if (aCapture != null && bCapture == null) return -1;
    if (aCapture == null && bCapture != null) return 1;
    if (aCapture != null && bCapture != null) return (aCapture - bCapture) * direction;
    return (fallbackTimestamp(aId) - fallbackTimestamp(bId)) * direction;
  });

  const unchanged = desired.every((card, index) => card === cards[index]);
  if (unchanged) return;
  for (const card of desired) gallery.append(card);
}

function rotationFor(id) {
  const rotation = Number(metaFor(id).rotation || 0);
  return [0, 90, 180, 270].includes(rotation) ? rotation : 0;
}

function applyImageRotation(image, id, viewer = false) {
  if (!(image instanceof HTMLImageElement)) return;
  const rotation = rotationFor(id);
  image.classList.toggle('ns-manual-rotation', rotation !== 0);
  image.classList.toggle('ns-quarter-turn', rotation === 90 || rotation === 270);
  image.style.setProperty('--ns-rotation', `${rotation}deg`);
  image.style.setProperty('--ns-rotation-scale', '1');

  if (!viewer || rotation === 0 || rotation === 180) return;
  const fit = () => {
    const stage = document.querySelector('#viewer-stage');
    if (!stage || !image.naturalWidth || !image.naturalHeight) return;
    const width = Math.max(1, stage.clientWidth);
    const height = Math.max(1, stage.clientHeight);
    const normal = Math.min(width / image.naturalWidth, height / image.naturalHeight);
    const rotated = Math.min(width / image.naturalHeight, height / image.naturalWidth);
    const ratio = normal > 0 ? Math.min(1, rotated / normal) : 1;
    image.style.setProperty('--ns-rotation-scale', String(Math.max(0.2, ratio)));
  };
  if (image.complete) fit();
  else image.addEventListener('load', fit, { once: true });
}

function decorateCard(card) {
  const id = card.dataset.mediaId;
  if (!id) return;
  const meta = metaFor(id);
  const image = card.querySelector('img.media-preview');
  if (image) applyImageRotation(image, id, false);

  let line = card.querySelector('.capture-date-line');
  if (!line) {
    line = document.createElement('span');
    line.className = 'capture-date-line';
    const anchor = card.querySelector('.media-event-date') || card.querySelector('.media-details');
    if (anchor) anchor.insertAdjacentElement('afterend', line);
    else card.querySelector('.media-meta')?.append(line);
  }

  if (meta.capturedAt) {
    line.hidden = false;
    line.dataset.source = meta.capturedAtSource || '';
    line.textContent = `${tr('capturedPrefix')} ${formatCaptureDate(meta.capturedAt)}`;
    line.title = sourceLabel(meta.capturedAtSource);
  } else {
    line.hidden = true;
    line.textContent = '';
    line.removeAttribute('data-source');
    line.removeAttribute('title');
  }
}

function decorateCards() {
  document.querySelectorAll('#gallery .media-card').forEach(decorateCard);
  applyCaptureSort();
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

function decorateViewer() {
  const id = currentViewerId();
  const media = document.querySelector('#viewer-stage .viewer-media');
  const left = document.querySelector('#capture-rotate-left');
  const right = document.querySelector('#capture-rotate-right');
  const date = document.querySelector('#viewer-capture-date');
  const isImage = media instanceof HTMLImageElement;

  if (left) left.hidden = !isImage;
  if (right) right.hidden = !isImage;
  if (isImage && id) applyImageRotation(media, id, true);

  const meta = id ? metaFor(id) : {};
  if (date) {
    date.hidden = !meta.capturedAt;
    date.textContent = meta.capturedAt ? `${tr('capturedPrefix')} ${formatCaptureDate(meta.capturedAt)}` : '';
    date.title = meta.capturedAt ? sourceLabel(meta.capturedAtSource) : '';
  }
}

async function rotateCurrent(delta) {
  const id = currentViewerId();
  const media = document.querySelector('#viewer-stage .viewer-media');
  if (!id || !(media instanceof HTMLImageElement)) return;
  const current = rotationFor(id);
  const next = ((current + delta) % 360 + 360) % 360;
  await patchCapture(id, { rotation: next });
  decorateCards();
  decorateViewer();
}

function visibleCaptureOrder() {
  const cards = Array.from(document.querySelectorAll('#gallery .media-card'))
    .filter((card) => !card.classList.contains('is-library-hidden') && !card.hidden);
  return cards.map((card) => card.dataset.mediaId).filter(Boolean);
}

function moveViewerInCaptureOrder(delta) {
  const current = currentViewerId();
  const ids = visibleCaptureOrder();
  if (!current || ids.length <= 1) return false;
  const index = ids.indexOf(current);
  if (index < 0) return false;
  const nextId = ids[(index + delta + ids.length) % ids.length];
  const card = document.querySelector(`#gallery .media-card[data-media-id="${CSS.escape(nextId)}"] .media-open`);
  if (!card) return false;
  card.click();
  return true;
}

function injectSortOption() {
  const select = document.querySelector('#sort-field');
  if (!select) return;
  let option = select.querySelector('option[value="capture"]');
  if (!option) {
    option = document.createElement('option');
    option.value = 'capture';
    select.prepend(option);
  }
  option.textContent = tr('captureSort');
  if (captureSortActive()) select.value = 'capture';
}

function injectLibraryControls() {
  const tools = document.querySelector('.library-tools');
  if (!tools || document.querySelector('#capture-scan')) return;
  const button = document.createElement('button');
  button.id = 'capture-scan';
  button.className = 'capture-scan';
  button.type = 'button';
  button.textContent = tr('scan');
  button.addEventListener('click', scanExistingDates);
  tools.append(button);
}

function injectCaptionField() {
  const captionDate = document.querySelector('#caption-date');
  if (!captionDate || document.querySelector('#capture-datetime')) return;
  const field = document.createElement('div');
  field.className = 'library-field';
  field.innerHTML = `
    <label for="capture-datetime" id="capture-datetime-label"></label>
    <input id="capture-datetime" type="datetime-local" />
    <small class="capture-source-note" id="capture-source-note"></small>
  `;
  captionDate.closest('.library-field')?.insertAdjacentElement('afterend', field);
}

function injectViewerControls() {
  const actions = document.querySelector('.viewer-actions');
  if (actions && !document.querySelector('#capture-rotate-left')) {
    const left = document.createElement('button');
    left.className = 'viewer-action capture-rotate-action';
    left.id = 'capture-rotate-left';
    left.type = 'button';
    left.innerHTML = '<span>↺</span><b></b>';
    left.addEventListener('click', () => rotateCurrent(-90));

    const right = document.createElement('button');
    right.className = 'viewer-action capture-rotate-action';
    right.id = 'capture-rotate-right';
    right.type = 'button';
    right.innerHTML = '<span>↻</span><b></b>';
    right.addEventListener('click', () => rotateCurrent(90));

    const rename = document.querySelector('#viewer-rename');
    if (rename) {
      actions.insertBefore(right, rename);
      actions.insertBefore(left, right);
    } else {
      actions.prepend(right);
      actions.prepend(left);
    }
  }

  const footer = document.querySelector('.viewer-footer');
  if (footer && !document.querySelector('#viewer-capture-date')) {
    const date = document.createElement('span');
    date.id = 'viewer-capture-date';
    date.className = 'capture-date-line';
    const position = document.querySelector('#viewer-position');
    if (position) footer.insertBefore(date, position);
    else footer.append(date);
  }
}

function populateCaptionCapture(id) {
  captureEditingId = id;
  const meta = metaFor(id);
  const input = document.querySelector('#capture-datetime');
  const note = document.querySelector('#capture-source-note');
  if (input) input.value = isoToLocalInput(meta.capturedAt);
  if (note) note.textContent = sourceLabel(meta.capturedAtSource);
}

function applyLanguage() {
  injectSortOption();
  const scan = document.querySelector('#capture-scan');
  if (scan && !scanRunning) scan.textContent = tr('scan');
  const label = document.querySelector('#capture-datetime-label');
  if (label) label.textContent = tr('captureDate');
  const left = document.querySelector('#capture-rotate-left');
  const right = document.querySelector('#capture-rotate-right');
  if (left) {
    left.querySelector('b').textContent = tr('rotateLeft');
    left.setAttribute('aria-label', tr('rotateLeft'));
    left.title = tr('rotateLeft');
  }
  if (right) {
    right.querySelector('b').textContent = tr('rotateRight');
    right.setAttribute('aria-label', tr('rotateRight'));
    right.title = tr('rotateRight');
  }
  const footerVersion = document.querySelector('#footer-version');
  if (footerVersion) footerVersion.textContent = tr('version');
  decorateCards();
  decorateViewer();
  if (captureEditingId) populateCaptionCapture(captureEditingId);
}

function setNotice(message, stateName = 'working') {
  const note = document.querySelector('#upload-note');
  if (!note) return;
  note.dataset.state = stateName;
  note.textContent = message;
}

function setProgress(name, percent, detail) {
  let panel = document.querySelector('#capture-progress');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'capture-progress';
    panel.className = 'capture-progress';
    panel.innerHTML = '<strong></strong><small></small><div class="capture-progress-track"><span></span></div>';
    document.body.append(panel);
  }
  panel.querySelector('strong').textContent = name;
  panel.querySelector('small').textContent = detail;
  panel.querySelector('.capture-progress-track span').style.width = `${Math.max(0, Math.min(100, percent))}%`;
}

function clearProgress() {
  document.querySelector('#capture-progress')?.remove();
}

function validFile(file) {
  return file.type?.startsWith('image/') || file.type?.startsWith('video/');
}

async function uploadDirect(file, index, total) {
  setNotice(`${index}/${total} · ${file.name}…`, 'working');
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
  return (await response.json())?.item || null;
}

async function uploadLarge(file) {
  const start = await api('/api/library/uploads', {
    method: 'POST',
    body: JSON.stringify({ name: file.name, contentType: file.type, sizeBytes: file.size }),
  });
  const partSize = Number(start.partSizeBytes);
  const totalParts = Math.ceil(file.size / partSize);
  const parts = [];
  setProgress(file.name, 0, tr('uploadPreparing'));

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
      setProgress(file.name, percent, tr('uploadPart', file.name, percent, partNumber, totalParts));
    }

    setProgress(file.name, 100, tr('uploadFinishing'));
    const completed = await api(`/api/library/uploads/${encodeURIComponent(start.id)}/complete`, {
      method: 'POST',
      body: JSON.stringify({ parts }),
    });
    return completed?.item || null;
  } catch (error) {
    await fetch(`/api/library/uploads/${encodeURIComponent(start.id)}`, {
      method: 'DELETE',
      headers: { Accept: 'application/json' },
    }).catch(() => {});
    throw error;
  }
}

async function handleFiles(files) {
  const selected = Array.from(files || []);
  if (!selected.length) return;
  const button = document.querySelector('#device-upload');
  if (button) button.disabled = true;

  try {
    for (const file of selected) {
      if (!validFile(file)) throw new Error(tr('uploadUnsupported', file.name));
      if (file.size > MAX_LARGE_BYTES) throw new Error(tr('uploadTooLarge', file.name));
    }

    for (let index = 0; index < selected.length; index += 1) {
      const file = selected[index];
      setProgress(file.name, 0, tr('uploadPreparing'));
      const capture = await extractCaptureFromFile(file);
      const item = file.size > MAX_DIRECT_BYTES
        ? await uploadLarge(file)
        : await uploadDirect(file, index + 1, selected.length);

      if (item?.id && capture) {
        await patchCapture(item.id, capture).catch(() => {});
      }
    }

    clearProgress();
    setNotice(tr('uploadDone', selected.length), 'ok');
    window.setTimeout(() => window.location.reload(), 650);
  } catch (error) {
    clearProgress();
    setNotice(error instanceof Error ? error.message : tr('uploadFailed'), 'error');
    if (button) button.disabled = false;
    const input = document.querySelector('#file-input');
    if (input) input.value = '';
  }
}

async function scanExistingDates() {
  if (scanRunning) return;
  const button = document.querySelector('#capture-scan');
  const candidates = mediaIndex.filter((media) => !metaFor(media.id).capturedAt);
  if (!candidates.length) {
    setNotice(tr('scanNone'), 'ok');
    return;
  }

  scanRunning = true;
  if (button) button.disabled = true;
  let found = 0;
  let unknown = 0;

  try {
    for (let index = 0; index < candidates.length; index += 1) {
      const media = candidates[index];
      if (button) button.textContent = tr('scanning', index + 1, candidates.length);
      setProgress(media.originalName, Math.round((index / candidates.length) * 100), tr('scanning', index + 1, candidates.length));
      const capture = await extractCaptureFromRemote(media);
      if (capture) {
        await patchCapture(media.id, capture);
        found += 1;
        decorateCards();
      } else {
        unknown += 1;
      }
    }
    setNotice(tr('scanDone', found, unknown), found ? 'ok' : 'working');
  } finally {
    scanRunning = false;
    clearProgress();
    if (button) {
      button.disabled = false;
      button.textContent = tr('scan');
    }
    decorateCards();
    decorateViewer();
  }
}

async function loadState() {
  const [library, media] = await Promise.all([
    api('/api/library/state'),
    api('/api/media'),
  ]);
  state = {
    mediaMeta: library?.mediaMeta && typeof library.mediaMeta === 'object' ? library.mediaMeta : {},
  };
  mediaIndex = Array.isArray(media?.items) ? media.items : [];
  decorateCards();
  decorateViewer();
}

function setupObservers() {
  const gallery = document.querySelector('#gallery');
  if (gallery) {
    new MutationObserver(() => window.requestAnimationFrame(decorateCards))
      .observe(gallery, { childList: true });
  }

  const stage = document.querySelector('#viewer-stage');
  if (stage) {
    new MutationObserver(() => window.requestAnimationFrame(decorateViewer))
      .observe(stage, { childList: true });
  }

  new MutationObserver(() => window.queueMicrotask(applyLanguage))
    .observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
}

function setupInteractions() {
  document.addEventListener('change', (event) => {
    if (event.target?.id !== 'file-input') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const files = Array.from(event.target.files || []);
    handleFiles(files);
  }, true);

  document.querySelector('#sort-field')?.addEventListener('change', (event) => {
    const isCapture = event.target.value === 'capture';
    setCaptureSortActive(isCapture);
    if (isCapture) applyCaptureSort();
  });

  document.querySelector('#sort-direction')?.addEventListener('click', () => {
    if (captureSortActive()) window.requestAnimationFrame(applyCaptureSort);
  });

  document.addEventListener('click', (event) => {
    const caption = event.target.closest?.('[data-caption-action]');
    if (caption?.dataset.captionAction) {
      window.queueMicrotask(() => populateCaptionCapture(caption.dataset.captionAction));
    }
  });

  document.addEventListener('submit', (event) => {
    if (event.target?.id !== 'caption-form' || !captureEditingId) return;
    const mediaId = captureEditingId;
    const input = document.querySelector('#capture-datetime');
    const current = metaFor(mediaId);
    const nextLocal = input?.value || '';
    const currentLocal = isoToLocalInput(current.capturedAt);
    if (nextLocal === currentLocal) return;
    const capturedAt = localInputToIso(nextLocal);
    patchCapture(mediaId, {
      capturedAt,
      capturedAtSource: capturedAt ? 'manual' : null,
    }).then(() => {
      decorateCards();
      decorateViewer();
    }).catch(() => {});
  });

  document.addEventListener('click', (event) => {
    if (!captureSortActive()) return;
    const prev = event.target.closest?.('#viewer-prev');
    const next = event.target.closest?.('#viewer-next');
    if (!prev && !next) return;
    if (moveViewerInCaptureOrder(prev ? -1 : 1)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  window.addEventListener('keydown', (event) => {
    if (!captureSortActive()) return;
    const dialog = document.querySelector('#media-dialog');
    if (!dialog?.open || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
    if (moveViewerInCaptureOrder(event.key === 'ArrowLeft' ? -1 : 1)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
}

async function init() {
  injectSortOption();
  injectLibraryControls();
  injectCaptionField();
  injectViewerControls();
  setupObservers();
  setupInteractions();
  applyLanguage();

  try {
    await loadState();
  } catch {
    // Core gallery remains usable if capture metadata is temporarily unavailable.
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
