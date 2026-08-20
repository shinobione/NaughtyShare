const THUMB_MAX_DIM = 560;
const THUMB_QUALITY = 0.78;
const THUMB_UPLOAD_LIMIT = 1024 * 1024;

const thumbQueue = [];
const thumbObjectUrls = new Map();
const thumbChecked = new Set();
const durationMap = new Map();
const durationSynced = new Set();
let thumbWorkerBusy = false;
let galleryObserver = null;
let cardObserver = null;

function mediaIdFor(card) {
  return card?.dataset?.mediaId || '';
}

function currentLang() {
  return document.documentElement.lang?.toLowerCase().startsWith('vi') ? 'vi-VN' : 'fr-FR';
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
  if (!mediaId || !Number.isFinite(seconds) || seconds < 0) return;
  durationMap.set(mediaId, seconds);
  updateCardDuration(card, seconds);
  applyDurationDomSort();
  if (durationSynced.has(mediaId)) return;
  durationSynced.add(mediaId);
  try {
    const response = await fetch(`/api/v1/media/${encodeURIComponent(mediaId)}/duration`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ durationSeconds: seconds }),
      cache: 'no-store',
    });
    if (!response.ok) durationSynced.delete(mediaId);
  } catch {
    durationSynced.delete(mediaId);
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

async function uploadThumbnail(mediaId, blob) {
  if (!blob || blob.size <= 0 || blob.size > THUMB_UPLOAD_LIMIT) return false;
  try {
    const response = await fetch(`/api/v1/thumbnails/${encodeURIComponent(mediaId)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'image/webp',
        'X-Thumbnail-Size': String(blob.size),
        Accept: 'application/json',
      },
      body: blob,
      cache: 'no-store',
    });
    return response.ok;
  } catch {
    return false;
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
    const fail = () => {
      cleanup();
      reject(new Error(`${type} failed`));
    };
    const cleanup = () => {
      window.clearTimeout(timer);
      target.removeEventListener(type, done);
      target.removeEventListener('error', fail);
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
  await persistDuration(mediaId, video.duration, video.closest('.media-card'));

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

async function prepareCard(card) {
  if (!card || card.dataset.v1PreviewPrepared === '1') return;
  card.dataset.v1PreviewPrepared = '1';
  const mediaId = mediaIdFor(card);
  const preview = card.querySelector('.media-preview');
  if (!mediaId || !preview) return;

  const knownDuration = durationMap.get(mediaId);
  if (Number.isFinite(knownDuration)) updateCardDuration(card, knownDuration);

  if (preview instanceof HTMLVideoElement) {
    preview.addEventListener('loadedmetadata', () => persistDuration(mediaId, preview.duration, card), { once: true });
  }

  if (thumbChecked.has(mediaId)) return;
  thumbChecked.add(mediaId);

  const thumbnail = await fetchThumbnail(mediaId).catch(() => null);
  if (thumbnail) {
    setThumbObjectUrl(mediaId, thumbnail, preview, { poster: preview instanceof HTMLVideoElement });
    return;
  }

  if (preview instanceof HTMLImageElement) queueThumbnail(() => makeImageThumbnail(preview, mediaId));
  else if (preview instanceof HTMLVideoElement) queueThumbnail(() => makeVideoThumbnail(preview, mediaId));
}

function applyDurationDomSort() {
  const select = document.querySelector('#sort-field');
  const gallery = document.querySelector('#gallery');
  if (!gallery || select?.value !== 'duration') return;
  const cards = Array.from(gallery.querySelectorAll('.media-card'));
  if (!cards.length) return;

  let direction = -1;
  try {
    direction = localStorage.getItem('naughtyshare-sort-direction') === 'asc' ? 1 : -1;
  } catch {
    direction = -1;
  }
  const collator = new Intl.Collator(currentLang(), { numeric: true, sensitivity: 'base' });

  cards.sort((a, b) => {
    const aVideo = Boolean(a.querySelector('video.media-preview'));
    const bVideo = Boolean(b.querySelector('video.media-preview'));
    const aDuration = aVideo ? durationMap.get(mediaIdFor(a)) : 0;
    const bDuration = bVideo ? durationMap.get(mediaIdFor(b)) : 0;
    const aUnknown = aVideo && !Number.isFinite(aDuration);
    const bUnknown = bVideo && !Number.isFinite(bDuration);
    if (aUnknown && !bUnknown) return 1;
    if (!aUnknown && bUnknown) return -1;
    let comparison = (Number.isFinite(aDuration) ? aDuration : 0) - (Number.isFinite(bDuration) ? bDuration : 0);
    if (!comparison) {
      comparison = collator.compare(
        a.querySelector('.media-name')?.textContent || '',
        b.querySelector('.media-name')?.textContent || '',
      );
    }
    return comparison * direction;
  });

  for (const card of cards) gallery.append(card);
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
    if (card.dataset.v1PreviewObserved === '1') continue;
    card.dataset.v1PreviewObserved = '1';
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
    const response = await fetch('/api/media', { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!response.ok) return;
    const data = await response.json();
    for (const item of data?.items || []) {
      if (Number.isFinite(item.durationSeconds)) durationMap.set(item.id, item.durationSeconds);
    }
    document.querySelectorAll('#gallery .media-card').forEach((card) => {
      const duration = durationMap.get(mediaIdFor(card));
      if (Number.isFinite(duration)) updateCardDuration(card, duration);
    });
    applyDurationDomSort();
  } catch {
    // Derived metadata can be learned again from video previews.
  }
}

function cleanupObjectUrls() {
  for (const url of thumbObjectUrls.values()) URL.revokeObjectURL(url);
  thumbObjectUrls.clear();
}

async function init() {
  observeCards();
  await loadPersistedDurations();
  document.querySelector('#sort-field')?.addEventListener('change', () => window.setTimeout(applyDurationDomSort, 0));
  document.querySelector('#sort-direction')?.addEventListener('click', () => window.setTimeout(applyDurationDomSort, 0));
  window.addEventListener('beforeunload', cleanupObjectUrls, { once: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();
