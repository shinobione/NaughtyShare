import './timeline.css';

const APP_VERSION = '0.9.0';
const QUICK_FILTER_KEY = 'naughtyshare-quick-filter-v1';
const COLLECTION_FILTER_KEY = 'naughtyshare-quick-collection-v1';
const MONTH_FILTER_KEY = 'naughtyshare-timeline-month-v1';
const DAY_FILTER_KEY = 'naughtyshare-timeline-day-v1';
const CAPTURE_SORT_KEY = 'naughtyshare-capture-sort-active';
const SORT_DIRECTION_KEY = 'naughtyshare-sort-direction';
const QUICK_FILTERS = new Set(['all', 'photo', 'video', 'favorite', 'dated', 'undated']);

const copy = {
  fr: {
    eyebrow: 'NAVIGATION',
    title: 'Chronologie & filtres',
    intro: 'Navigue par mois ou par jour et combine les filtres avec tes Moments, la recherche et le tri existants.',
    chronology: 'Chronologie',
    all: 'Tout',
    photos: 'Photos',
    videos: 'Vidéos',
    favorites: 'Favoris',
    dated: 'Datés',
    undated: 'Sans date',
    collection: 'Collection',
    allCollections: 'Toutes les collections',
    months: 'Mois',
    allMonths: 'Tous',
    unknownMonth: 'Date inconnue',
    days: 'Jours',
    allDays: 'Tous les jours',
    reset: 'Réinitialiser',
    visible: (shown, total) => `${shown}/${total} affichés`,
    dateSummary: (dated, unknown) => `${dated} datés · ${unknown} sans date`,
    noResults: 'Aucun média ne correspond à ces filtres.',
  },
  vi: {
    eyebrow: 'ĐIỀU HƯỚNG',
    title: 'Dòng thời gian & bộ lọc',
    intro: 'Duyệt theo tháng hoặc ngày và kết hợp bộ lọc với Khoảnh khắc, tìm kiếm và sắp xếp hiện có.',
    chronology: 'Dòng thời gian',
    all: 'Tất cả',
    photos: 'Ảnh',
    videos: 'Video',
    favorites: 'Yêu thích',
    dated: 'Có ngày',
    undated: 'Chưa có ngày',
    collection: 'Bộ sưu tập',
    allCollections: 'Tất cả bộ sưu tập',
    months: 'Tháng',
    allMonths: 'Tất cả',
    unknownMonth: 'Không rõ ngày',
    days: 'Ngày',
    allDays: 'Tất cả ngày',
    reset: 'Đặt lại',
    visible: (shown, total) => `Hiện ${shown}/${total}`,
    dateSummary: (dated, unknown) => `${dated} có ngày · ${unknown} chưa có ngày`,
    noResults: 'Không có nội dung phù hợp với các bộ lọc này.',
  },
};

let libraryState = { collections: [], mediaMeta: {} };
let mediaIndex = [];
let quickFilter = loadChoice(QUICK_FILTER_KEY, 'all', QUICK_FILTERS);
let collectionFilter = loadChoice(COLLECTION_FILTER_KEY, 'all');
let monthFilter = loadChoice(MONTH_FILTER_KEY, 'all');
let dayFilter = loadChoice(DAY_FILTER_KEY, 'all');
let applying = false;
let applyFrame = 0;
let markerSignature = '';
let galleryObserver = null;

function lang() {
  return document.documentElement.lang?.toLowerCase().startsWith('vi') ? 'vi' : 'fr';
}

function tr(key, ...args) {
  const value = copy[lang()][key];
  return typeof value === 'function' ? value(...args) : value;
}

function loadChoice(key, fallback, allowed = null) {
  try {
    const value = localStorage.getItem(key);
    if (!value) return fallback;
    if (allowed && !allowed.has(value)) return fallback;
    return value;
  } catch {
    return fallback;
  }
}

function saveChoice(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // The filter still works for this session.
  }
}

async function api(path) {
  const response = await fetch(path, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function mediaFor(id) {
  return mediaIndex.find((item) => item.id === id) || null;
}

function metaFor(id) {
  return libraryState.mediaMeta?.[id] || {};
}

function collectionFor(id) {
  return libraryState.collections.find((item) => item.id === id) || null;
}

function captureDate(id) {
  const value = metaFor(id).capturedAt;
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function monthKey(date) {
  if (!date) return 'unknown';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function dayKey(date) {
  if (!date) return 'unknown';
  return `${monthKey(date)}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateFromMonthKey(key) {
  const [year, month] = String(key).split('-').map(Number);
  return new Date(year, month - 1, 1, 12, 0, 0);
}

function dateFromDayKey(key) {
  const [year, month, day] = String(key).split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
}

function formatMonth(key) {
  if (key === 'unknown') return tr('unknownMonth');
  return dateFromMonthKey(key).toLocaleDateString(lang() === 'vi' ? 'vi-VN' : 'fr-FR', {
    month: 'long',
    year: 'numeric',
  });
}

function formatDay(key, compact = false) {
  const date = dateFromDayKey(key);
  return date.toLocaleDateString(lang() === 'vi' ? 'vi-VN' : 'fr-FR', compact
    ? { day: '2-digit', month: 'short' }
    : { day: 'numeric', month: 'long', year: 'numeric' });
}

function sortDirection() {
  try {
    return localStorage.getItem(SORT_DIRECTION_KEY) === 'asc' ? 1 : -1;
  } catch {
    return -1;
  }
}

function captureSortActive() {
  try {
    return localStorage.getItem(CAPTURE_SORT_KEY) === '1';
  } catch {
    return document.querySelector('#sort-field')?.value === 'capture';
  }
}

function ensureCaptureSort() {
  const select = document.querySelector('#sort-field');
  if (!select?.querySelector('option[value="capture"]')) return;
  if (select.value === 'capture' && captureSortActive()) return;
  select.value = 'capture';
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

function passesQuickFilter(id) {
  const media = mediaFor(id);
  const meta = metaFor(id);
  if (!media) return false;

  if (quickFilter === 'photo') return media.contentType?.startsWith('image/');
  if (quickFilter === 'video') return media.contentType?.startsWith('video/');
  if (quickFilter === 'favorite') return meta.favorite === true;
  if (quickFilter === 'dated') return Boolean(captureDate(id));
  if (quickFilter === 'undated') return !captureDate(id);
  return true;
}

function passesCollectionFilter(id) {
  if (collectionFilter === 'all') return true;
  const collection = collectionFor(collectionFilter);
  return Boolean(collection && (collection.mediaIds || []).includes(id));
}

function passesTimelineFilter(id) {
  const date = captureDate(id);
  if (monthFilter === 'all') return true;
  if (monthFilter === 'unknown') return !date;
  if (!date || monthKey(date) !== monthFilter) return false;
  return dayFilter === 'all' || dayKey(date) === dayFilter;
}

function baseVisible(card) {
  return !card.classList.contains('is-library-hidden');
}

function finalVisibleCards() {
  return Array.from(document.querySelectorAll('#gallery .media-card')).filter((card) => {
    if (card.hidden || card.classList.contains('is-library-hidden')) return false;
    return getComputedStyle(card).display !== 'none';
  });
}

function filterCandidateIds() {
  return mediaIndex
    .map((item) => item.id)
    .filter((id) => passesQuickFilter(id) && passesCollectionFilter(id));
}

function availableMonths() {
  const months = new Set();
  let hasUnknown = false;
  for (const id of filterCandidateIds()) {
    const date = captureDate(id);
    if (date) months.add(monthKey(date));
    else hasUnknown = true;
  }
  const ordered = [...months].sort((a, b) => {
    const diff = dateFromMonthKey(a).getTime() - dateFromMonthKey(b).getTime();
    return diff * sortDirection();
  });
  return { ordered, hasUnknown };
}

function availableDays() {
  if (monthFilter === 'all' || monthFilter === 'unknown') return [];
  const days = new Set();
  for (const id of filterCandidateIds()) {
    const date = captureDate(id);
    if (date && monthKey(date) === monthFilter) days.add(dayKey(date));
  }
  return [...days].sort((a, b) => {
    const diff = dateFromDayKey(a).getTime() - dateFromDayKey(b).getTime();
    return diff * sortDirection();
  });
}

function injectUi() {
  if (document.querySelector('#timeline-panel')) return;
  const anchor = document.querySelector('#gallery-polish-toolbar') || document.querySelector('#gallery-toolbar');
  if (!anchor) return;

  const section = document.createElement('section');
  section.id = 'timeline-panel';
  section.className = 'timeline-panel';
  section.innerHTML = `
    <header class="timeline-head">
      <div>
        <p class="eyebrow" id="timeline-eyebrow"></p>
        <h3 id="timeline-title"></h3>
        <p id="timeline-intro"></p>
        <small id="timeline-summary"></small>
      </div>
      <button id="timeline-mode" class="timeline-mode" type="button"><span>◷</span><b></b></button>
    </header>
    <div class="timeline-quick-row" id="timeline-quick-row" role="group"></div>
    <div class="timeline-secondary-row">
      <label class="timeline-collection-label" for="timeline-collection">
        <span id="timeline-collection-label"></span>
        <select id="timeline-collection"></select>
      </label>
      <button id="timeline-reset" class="timeline-reset" type="button"></button>
    </div>
    <div class="timeline-rail-wrap">
      <span class="timeline-rail-label" id="timeline-months-label"></span>
      <div class="timeline-rail" id="timeline-months"></div>
    </div>
    <div class="timeline-rail-wrap" id="timeline-days-wrap" hidden>
      <span class="timeline-rail-label" id="timeline-days-label"></span>
      <div class="timeline-rail" id="timeline-days"></div>
    </div>
    <div class="timeline-visible" id="timeline-visible"></div>
  `;
  anchor.insertAdjacentElement('afterend', section);

  const quickRoot = section.querySelector('#timeline-quick-row');
  const quicks = [
    ['all', 'all'],
    ['photo', 'photos'],
    ['video', 'videos'],
    ['favorite', 'favorites'],
    ['dated', 'dated'],
    ['undated', 'undated'],
  ];
  for (const [value, labelKey] of quicks) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'timeline-chip';
    button.dataset.timelineQuick = value;
    button.dataset.labelKey = labelKey;
    button.addEventListener('click', () => {
      quickFilter = value;
      saveChoice(QUICK_FILTER_KEY, value);
      scheduleApply();
    });
    quickRoot.append(button);
  }

  section.querySelector('#timeline-mode')?.addEventListener('click', () => {
    ensureCaptureSort();
    window.setTimeout(scheduleApply, 0);
  });

  section.querySelector('#timeline-collection')?.addEventListener('change', (event) => {
    collectionFilter = event.target.value || 'all';
    saveChoice(COLLECTION_FILTER_KEY, collectionFilter);
    scheduleApply();
  });

  section.querySelector('#timeline-reset')?.addEventListener('click', () => {
    quickFilter = 'all';
    collectionFilter = 'all';
    monthFilter = 'all';
    dayFilter = 'all';
    saveChoice(QUICK_FILTER_KEY, quickFilter);
    saveChoice(COLLECTION_FILTER_KEY, collectionFilter);
    saveChoice(MONTH_FILTER_KEY, monthFilter);
    saveChoice(DAY_FILTER_KEY, dayFilter);
    scheduleApply();
  });

  section.querySelector('#timeline-months')?.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-timeline-month]');
    if (!button) return;
    monthFilter = button.dataset.timelineMonth;
    dayFilter = 'all';
    saveChoice(MONTH_FILTER_KEY, monthFilter);
    saveChoice(DAY_FILTER_KEY, dayFilter);
    if (monthFilter !== 'all') ensureCaptureSort();
    scheduleApply();
  });

  section.querySelector('#timeline-days')?.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-timeline-day]');
    if (!button) return;
    dayFilter = button.dataset.timelineDay;
    saveChoice(DAY_FILTER_KEY, dayFilter);
    ensureCaptureSort();
    scheduleApply();
  });
}

function syncCollectionOptions() {
  const select = document.querySelector('#timeline-collection');
  if (!select) return;
  if (collectionFilter !== 'all' && !collectionFor(collectionFilter)) collectionFilter = 'all';

  const signature = libraryState.collections.map((item) => `${item.id}:${item.name}`).join('|');
  if (select.dataset.signature !== signature) {
    select.replaceChildren();
    const all = document.createElement('option');
    all.value = 'all';
    all.textContent = tr('allCollections');
    select.append(all);
    for (const collection of libraryState.collections) {
      const option = document.createElement('option');
      option.value = collection.id;
      option.textContent = collection.name;
      select.append(option);
    }
    select.dataset.signature = signature;
  }
  select.options[0].textContent = tr('allCollections');
  select.value = collectionFilter;
}

function renderTimeRails() {
  const monthsRoot = document.querySelector('#timeline-months');
  const daysRoot = document.querySelector('#timeline-days');
  const daysWrap = document.querySelector('#timeline-days-wrap');
  if (!monthsRoot || !daysRoot || !daysWrap) return;

  const months = availableMonths();
  if (monthFilter !== 'all' && monthFilter !== 'unknown' && !months.ordered.includes(monthFilter)) {
    monthFilter = 'all';
    dayFilter = 'all';
  }
  if (monthFilter === 'unknown' && !months.hasUnknown) monthFilter = 'all';

  monthsRoot.replaceChildren();
  const all = makeRailButton(tr('allMonths'), 'month', 'all', monthFilter === 'all');
  monthsRoot.append(all);
  for (const key of months.ordered) {
    monthsRoot.append(makeRailButton(formatMonth(key), 'month', key, monthFilter === key));
  }
  if (months.hasUnknown) {
    monthsRoot.append(makeRailButton(tr('unknownMonth'), 'month', 'unknown', monthFilter === 'unknown'));
  }

  const days = availableDays();
  daysWrap.hidden = monthFilter === 'all' || monthFilter === 'unknown';
  daysRoot.replaceChildren();
  if (!daysWrap.hidden) {
    if (dayFilter !== 'all' && !days.includes(dayFilter)) dayFilter = 'all';
    daysRoot.append(makeRailButton(tr('allDays'), 'day', 'all', dayFilter === 'all'));
    for (const key of days) daysRoot.append(makeRailButton(formatDay(key, true), 'day', key, dayFilter === key));
  }
}

function makeRailButton(label, type, value, active) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `timeline-rail-chip${active ? ' is-active' : ''}`;
  if (type === 'month') button.dataset.timelineMonth = value;
  else button.dataset.timelineDay = value;
  button.textContent = label;
  button.setAttribute('aria-pressed', String(active));
  return button;
}

function markerGroupKey(card) {
  const date = captureDate(card.dataset.mediaId);
  if (!date) return 'unknown';
  if (monthFilter !== 'all' && monthFilter !== 'unknown') return dayKey(date);
  return monthKey(date);
}

function markerLabel(key) {
  if (key === 'unknown') return tr('unknownMonth');
  return key.length === 10 ? formatDay(key) : formatMonth(key);
}

function renderMarkers() {
  const gallery = document.querySelector('#gallery');
  if (!gallery) return;

  if (!captureSortActive()) {
    gallery.querySelectorAll('.timeline-marker').forEach((node) => node.remove());
    markerSignature = '';
    return;
  }

  const cards = finalVisibleCards();
  const groups = cards.map((card) => `${card.dataset.mediaId}:${markerGroupKey(card)}`);
  const signature = `${monthFilter}|${dayFilter}|${groups.join('|')}`;
  if (signature === markerSignature && gallery.querySelectorAll('.timeline-marker').length) return;

  gallery.querySelectorAll('.timeline-marker').forEach((node) => node.remove());
  markerSignature = signature;
  let previous = null;
  for (const card of cards) {
    const key = markerGroupKey(card);
    if (key === previous) continue;
    previous = key;
    const marker = document.createElement('div');
    marker.className = 'timeline-marker';
    marker.dataset.timelineGroup = key;
    marker.innerHTML = '<span></span><i></i>';
    marker.querySelector('span').textContent = markerLabel(key);
    gallery.insertBefore(marker, card);
  }
}

function syncSummary() {
  const summary = document.querySelector('#timeline-summary');
  const visible = document.querySelector('#timeline-visible');
  const cards = Array.from(document.querySelectorAll('#gallery .media-card'));
  const shown = finalVisibleCards().length;
  const dated = mediaIndex.filter((item) => captureDate(item.id)).length;
  const unknown = Math.max(0, mediaIndex.length - dated);
  if (summary) summary.textContent = tr('dateSummary', dated, unknown);
  if (visible) visible.textContent = tr('visible', shown, cards.length);

  const count = document.querySelector('#media-count');
  if (count && cards.length) count.textContent = `${shown} / ${cards.length}`;

  const noResults = document.querySelector('#library-no-results');
  if (noResults && cards.length) {
    noResults.hidden = shown !== 0;
    if (shown === 0) noResults.textContent = tr('noResults');
  }
}

function syncControls() {
  const labelMap = {
    all: tr('all'),
    photo: tr('photos'),
    video: tr('videos'),
    favorite: tr('favorites'),
    dated: tr('dated'),
    undated: tr('undated'),
  };
  document.querySelectorAll('[data-timeline-quick]').forEach((button) => {
    const active = button.dataset.timelineQuick === quickFilter;
    button.textContent = labelMap[button.dataset.timelineQuick] || '';
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });

  const mode = document.querySelector('#timeline-mode');
  if (mode) {
    mode.classList.toggle('is-active', captureSortActive());
    mode.setAttribute('aria-pressed', String(captureSortActive()));
    mode.querySelector('b').textContent = tr('chronology');
  }

  syncCollectionOptions();
  const collectionLabel = document.querySelector('#timeline-collection-label');
  if (collectionLabel) collectionLabel.textContent = tr('collection');
  const reset = document.querySelector('#timeline-reset');
  if (reset) reset.textContent = tr('reset');
  const months = document.querySelector('#timeline-months-label');
  if (months) months.textContent = tr('months');
  const days = document.querySelector('#timeline-days-label');
  if (days) days.textContent = tr('days');
}

function applyLanguage() {
  const eyebrow = document.querySelector('#timeline-eyebrow');
  const title = document.querySelector('#timeline-title');
  const intro = document.querySelector('#timeline-intro');
  if (eyebrow) eyebrow.textContent = tr('eyebrow');
  if (title) title.textContent = tr('title');
  if (intro) intro.textContent = tr('intro');
  syncControls();
  renderTimeRails();
  renderMarkers();
  syncSummary();
}

function applyFilters() {
  if (applying) return;
  applying = true;
  try {
    const cards = Array.from(document.querySelectorAll('#gallery .media-card'));
    for (const card of cards) {
      const id = card.dataset.mediaId;
      const visible = Boolean(id)
        && passesQuickFilter(id)
        && passesCollectionFilter(id)
        && passesTimelineFilter(id);
      card.hidden = !visible;
    }
    syncControls();
    renderTimeRails();
    renderMarkers();
    syncSummary();
  } finally {
    applying = false;
  }
}

function scheduleApply() {
  if (applyFrame) cancelAnimationFrame(applyFrame);
  applyFrame = requestAnimationFrame(() => {
    applyFrame = 0;
    applyFilters();
  });
}

async function loadState() {
  const [library, media] = await Promise.all([
    api('/api/library/state'),
    api('/api/media'),
  ]);
  libraryState = {
    collections: Array.isArray(library?.collections) ? library.collections : [],
    mediaMeta: library?.mediaMeta && typeof library.mediaMeta === 'object' ? library.mediaMeta : {},
  };
  mediaIndex = Array.isArray(media?.items) ? media.items : [];
}

async function refreshState() {
  try {
    await loadState();
    scheduleApply();
  } catch {
    // Core gallery remains usable if timeline metadata cannot be refreshed.
  }
}

function setupObservers() {
  const gallery = document.querySelector('#gallery');
  if (gallery && !galleryObserver) {
    galleryObserver = new MutationObserver(() => scheduleApply());
    galleryObserver.observe(gallery, {
      childList: true,
      subtree: false,
      attributes: true,
      attributeFilter: ['class', 'hidden'],
    });
  }

  new MutationObserver(() => window.queueMicrotask(applyLanguage))
    .observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
}

function setupInteractions() {
  document.querySelector('#sort-field')?.addEventListener('change', () => window.setTimeout(scheduleApply, 0));
  document.querySelector('#sort-direction')?.addEventListener('click', () => window.setTimeout(scheduleApply, 0));
  document.querySelector('#library-search')?.addEventListener('input', () => window.setTimeout(scheduleApply, 0));

  document.addEventListener('click', (event) => {
    if (event.target.closest?.('.collection-open, .library-filter-clear')) {
      window.setTimeout(scheduleApply, 0);
    }
    if (event.target.closest?.('[data-library-favorite]')) {
      window.setTimeout(refreshState, 180);
    }
  });

  document.addEventListener('submit', (event) => {
    if (event.target?.id === 'assign-form' || event.target?.id === 'caption-form' || event.target?.id === 'collection-form') {
      window.setTimeout(refreshState, 220);
    }
  });

  window.addEventListener('focus', () => window.setTimeout(refreshState, 80));
}

async function init() {
  injectUi();
  setupObservers();
  setupInteractions();
  applyLanguage();

  try {
    await loadState();
  } catch {
    libraryState = { collections: [], mediaMeta: {} };
    mediaIndex = [];
  }
  scheduleApply();

  const footer = document.querySelector('#footer-version');
  if (footer) footer.textContent = `NaughtyShare v${APP_VERSION}`;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
