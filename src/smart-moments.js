import './smart-moments.css';

const APP_VERSION = '0.8.0';
const DISMISSED_KEY = 'naughtyshare-smart-moments-dismissed-v1';
const TRUSTED_CAPTURE_SOURCES = new Set(['exif', 'container', 'manual']);
const MAX_SUGGESTIONS = 10;
const MAX_PERIOD_DAYS = 3;

const copy = {
  fr: {
    eyebrow: 'SUGGESTIONS',
    title: 'Moments intelligents',
    intro: 'NaughtyShare repère les journées et petites périodes qui vont naturellement ensemble, à partir des vraies dates de prise.',
    trusted: 'EXIF, vidéo ou date corrigée manuellement uniquement.',
    day: 'Journée',
    period: 'Période',
    media: 'média',
    medias: 'médias',
    oneDay: 'même journée',
    days: (count) => `${count} jours`,
    create: 'Créer ce Moment',
    creating: (done, total) => `Création du Moment · ${done}/${total}…`,
    created: (name, count) => `${name} créé avec ${count} média${count > 1 ? 's' : ''}.`,
    dismiss: 'Masquer cette suggestion',
    noSuggestion: 'Pas encore de regroupement évident. Les suggestions apparaîtront dès que plusieurs médias datés formeront une journée ou une courte période.',
    refresh: 'Actualiser',
    descriptionDay: (count) => `Moment suggéré automatiquement à partir de ${count} médias pris le même jour.`,
    descriptionPeriod: (count, days) => `Moment suggéré automatiquement à partir de ${count} médias pris sur ${days} jours proches.`,
    failed: 'Impossible de créer ce Moment pour le moment.',
  },
  vi: {
    eyebrow: 'GỢI Ý',
    title: 'Khoảnh khắc thông minh',
    intro: 'NaughtyShare nhận ra những ngày và khoảng thời gian ngắn tự nhiên thuộc về nhau dựa trên ngày chụp thật.',
    trusted: 'Chỉ dùng EXIF, siêu dữ liệu video hoặc ngày đã sửa thủ công.',
    day: 'Một ngày',
    period: 'Khoảng thời gian',
    media: 'mục',
    medias: 'mục',
    oneDay: 'cùng một ngày',
    days: (count) => `${count} ngày`,
    create: 'Tạo khoảnh khắc này',
    creating: (done, total) => `Đang tạo khoảnh khắc · ${done}/${total}…`,
    created: (name, count) => `Đã tạo ${name} với ${count} mục.`,
    dismiss: 'Ẩn gợi ý này',
    noSuggestion: 'Chưa có nhóm thời gian rõ ràng. Gợi ý sẽ xuất hiện khi có nhiều ảnh hoặc video có ngày chụp đáng tin cậy.',
    refresh: 'Làm mới',
    descriptionDay: (count) => `Khoảnh khắc được gợi ý tự động từ ${count} mục được chụp trong cùng một ngày.`,
    descriptionPeriod: (count, days) => `Khoảnh khắc được gợi ý tự động từ ${count} mục được chụp trong ${days} ngày gần nhau.`,
    failed: 'Chưa thể tạo khoảnh khắc này.',
  },
};

let libraryState = { collections: [], mediaMeta: {} };
let mediaIndex = [];
let suggestions = [];
let busySignature = null;

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

function setNotice(message, stateName = 'ok') {
  const note = document.querySelector('#upload-note');
  if (!note) return;
  note.dataset.state = stateName;
  note.textContent = message;
}

function mediaFor(id) {
  return mediaIndex.find((item) => item.id === id) || null;
}

function localDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function dateFromKey(key) {
  const [year, month, day] = String(key).split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
}

function dayNumber(key) {
  const date = dateFromKey(key);
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
}

function formatDay(key) {
  return dateFromKey(key).toLocaleDateString(lang() === 'vi' ? 'vi-VN' : 'fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatPeriod(startKey, endKey) {
  const start = dateFromKey(startKey);
  const end = dateFromKey(endKey);
  const locale = lang() === 'vi' ? 'vi-VN' : 'fr-FR';
  if (startKey === endKey) return formatDay(startKey);

  if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
    const monthYear = end.toLocaleDateString(locale, { month: 'short', year: 'numeric' });
    return `${start.getDate()}–${end.getDate()} ${monthYear}`;
  }

  const startText = start.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    ...(start.getFullYear() !== end.getFullYear() ? { year: 'numeric' } : {}),
  });
  const endText = end.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  return `${startText} – ${endText}`;
}

function trustedMedia() {
  return Object.entries(libraryState.mediaMeta)
    .map(([id, meta]) => {
      if (!meta?.capturedAt || !TRUSTED_CAPTURE_SOURCES.has(meta.capturedAtSource)) return null;
      const date = new Date(meta.capturedAt);
      if (Number.isNaN(date.getTime()) || !mediaFor(id)) return null;
      return { id, date, key: localDateKey(date) };
    })
    .filter(Boolean)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

function collectionContainsAll(ids) {
  return libraryState.collections.some((collection) => {
    const members = new Set(collection.mediaIds || []);
    return ids.length > 0 && ids.every((id) => members.has(id));
  });
}

function loadDismissed() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]');
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function saveDismissed(values) {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...values].slice(-80)));
  } catch {
    // Dismissal persistence is optional.
  }
}

function signature(type, startKey, endKey, ids) {
  return `${type}|${startKey}|${endKey}|${[...ids].sort().join(',')}`;
}

function buildDayBuckets(items) {
  const map = new Map();
  for (const item of items) {
    if (!map.has(item.key)) map.set(item.key, []);
    map.get(item.key).push(item.id);
  }
  return [...map.entries()]
    .map(([key, ids]) => ({ key, ids }))
    .sort((a, b) => dayNumber(a.key) - dayNumber(b.key));
}

function buildPeriodSuggestions(buckets) {
  const results = [];
  let sequence = [];

  const flush = () => {
    if (sequence.length < 2) {
      sequence = [];
      return;
    }
    const limited = sequence.slice(0, MAX_PERIOD_DAYS);
    const ids = limited.flatMap((bucket) => bucket.ids);
    if (ids.length >= 4) {
      const startKey = limited[0].key;
      const endKey = limited[limited.length - 1].key;
      results.push({
        type: 'period',
        startKey,
        endKey,
        dayCount: limited.length,
        ids,
        signature: signature('period', startKey, endKey, ids),
      });
    }
    sequence = [];
  };

  for (const bucket of buckets) {
    const previous = sequence.at(-1);
    const consecutive = previous && dayNumber(bucket.key) - dayNumber(previous.key) === 1;
    if (!sequence.length || consecutive) {
      sequence.push(bucket);
      if (sequence.length === MAX_PERIOD_DAYS) flush();
    } else {
      flush();
      sequence = [bucket];
    }
  }
  flush();
  return results;
}

function buildSuggestions() {
  const dismissed = loadDismissed();
  const buckets = buildDayBuckets(trustedMedia());
  const periods = buildPeriodSuggestions(buckets);
  const days = buckets
    .filter((bucket) => bucket.ids.length >= 2)
    .map((bucket) => ({
      type: 'day',
      startKey: bucket.key,
      endKey: bucket.key,
      dayCount: 1,
      ids: bucket.ids,
      signature: signature('day', bucket.key, bucket.key, bucket.ids),
    }));

  const ordered = [...periods, ...days]
    .filter((suggestion) => !dismissed.has(suggestion.signature))
    .filter((suggestion) => !collectionContainsAll(suggestion.ids))
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'period' ? -1 : 1;
      if (a.ids.length !== b.ids.length) return b.ids.length - a.ids.length;
      return dayNumber(b.startKey) - dayNumber(a.startKey);
    });

  return ordered.slice(0, MAX_SUGGESTIONS);
}

function injectUi() {
  const library = document.querySelector('#library-section');
  if (!library || document.querySelector('#smart-moments')) return;

  const section = document.createElement('section');
  section.id = 'smart-moments';
  section.className = 'smart-moments';
  section.innerHTML = `
    <header class="smart-moments-head">
      <div>
        <p class="eyebrow" id="smart-moments-eyebrow"></p>
        <h3 id="smart-moments-title"></h3>
        <p id="smart-moments-intro"></p>
        <small id="smart-moments-trusted"></small>
      </div>
      <button id="smart-moments-refresh" type="button"><span>↻</span><b></b></button>
    </header>
    <div class="smart-moments-list" id="smart-moments-list"></div>
  `;

  const focus = document.querySelector('#moments-focus');
  if (focus?.parentNode === library) focus.insertAdjacentElement('afterend', section);
  else library.append(section);

  section.querySelector('#smart-moments-refresh')?.addEventListener('click', refresh);
}

function previewNode(media) {
  const cell = document.createElement('span');
  cell.className = 'smart-preview-cell';
  if (!media) return cell;

  if (media.contentType?.startsWith('image/')) {
    const image = document.createElement('img');
    image.src = media.url;
    image.alt = '';
    image.loading = 'lazy';
    image.decoding = 'async';
    cell.append(image);
  } else if (media.contentType?.startsWith('video/')) {
    const icon = document.createElement('span');
    icon.className = 'smart-preview-video';
    icon.textContent = '▶';
    cell.append(icon);
  }
  return cell;
}

function renderSuggestion(suggestion) {
  const card = document.createElement('article');
  card.className = `smart-moment-card smart-${suggestion.type}`;
  card.dataset.smartSignature = suggestion.signature;

  const preview = document.createElement('div');
  preview.className = 'smart-preview';
  for (const id of suggestion.ids.slice(0, 3)) preview.append(previewNode(mediaFor(id)));
  while (preview.children.length < 3) {
    const filler = document.createElement('span');
    filler.className = 'smart-preview-cell';
    preview.append(filler);
  }
  card.append(preview);

  const content = document.createElement('div');
  content.className = 'smart-moment-content';

  const kind = document.createElement('span');
  kind.className = 'smart-moment-kind';
  kind.textContent = suggestion.type === 'day' ? tr('day') : tr('period');

  const title = document.createElement('strong');
  title.className = 'smart-moment-name';
  title.textContent = formatPeriod(suggestion.startKey, suggestion.endKey);

  const meta = document.createElement('span');
  meta.className = 'smart-moment-meta';
  meta.textContent = `${suggestion.ids.length} ${suggestion.ids.length === 1 ? tr('media') : tr('medias')} · ${suggestion.type === 'day' ? tr('oneDay') : tr('days', suggestion.dayCount)}`;

  content.append(kind, title, meta);
  card.append(content);

  const actions = document.createElement('div');
  actions.className = 'smart-moment-actions';

  const create = document.createElement('button');
  create.type = 'button';
  create.className = 'smart-create';
  create.textContent = tr('create');
  create.disabled = Boolean(busySignature);
  create.addEventListener('click', () => createMoment(suggestion));

  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'smart-dismiss';
  dismiss.textContent = '×';
  dismiss.title = tr('dismiss');
  dismiss.setAttribute('aria-label', tr('dismiss'));
  dismiss.disabled = Boolean(busySignature);
  dismiss.addEventListener('click', () => dismissSuggestion(suggestion));

  actions.append(create, dismiss);
  card.append(actions);
  return card;
}

function render() {
  const section = document.querySelector('#smart-moments');
  const root = document.querySelector('#smart-moments-list');
  if (!section || !root) return;

  document.querySelector('#smart-moments-eyebrow').textContent = tr('eyebrow');
  document.querySelector('#smart-moments-title').textContent = tr('title');
  document.querySelector('#smart-moments-intro').textContent = tr('intro');
  document.querySelector('#smart-moments-trusted').textContent = tr('trusted');
  const refreshButton = document.querySelector('#smart-moments-refresh');
  if (refreshButton) {
    refreshButton.querySelector('b').textContent = tr('refresh');
    refreshButton.disabled = Boolean(busySignature);
  }

  root.replaceChildren();
  if (!suggestions.length) {
    const empty = document.createElement('p');
    empty.className = 'smart-moments-empty';
    empty.textContent = tr('noSuggestion');
    root.append(empty);
    return;
  }

  for (const suggestion of suggestions) root.append(renderSuggestion(suggestion));
}

function dismissSuggestion(suggestion) {
  const dismissed = loadDismissed();
  dismissed.add(suggestion.signature);
  saveDismissed(dismissed);
  suggestions = suggestions.filter((item) => item.signature !== suggestion.signature);
  render();
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

async function createMoment(suggestion) {
  if (busySignature) return;
  busySignature = suggestion.signature;
  render();

  const name = formatPeriod(suggestion.startKey, suggestion.endKey);
  const toneDate = dateFromKey(suggestion.startKey);
  const description = suggestion.type === 'day'
    ? tr('descriptionDay', suggestion.ids.length)
    : tr('descriptionPeriod', suggestion.ids.length, suggestion.dayCount);
  let createdCollectionId = null;

  try {
    const created = await api('/api/library/collections', {
      method: 'POST',
      body: JSON.stringify({
        name,
        kind: 'moment',
        eventDate: suggestion.startKey,
        description,
        icon: '✦',
        tone: (toneDate.getMonth() + suggestion.ids.length) % 6,
      }),
    });
    createdCollectionId = created?.collection?.id || null;
    if (!createdCollectionId) throw new Error('Collection id missing');

    const tasks = suggestion.ids.map((mediaId) => () => api(
      `/api/library/collections/${encodeURIComponent(createdCollectionId)}/items/${encodeURIComponent(mediaId)}`,
      { method: 'PUT' },
    ));
    await runPool(tasks, 5, (done, total) => setNotice(tr('creating', done, total), 'working'));
    setNotice(tr('created', name, suggestion.ids.length), 'ok');
    window.setTimeout(() => window.location.reload(), 500);
  } catch (error) {
    if (createdCollectionId) {
      await fetch(`/api/library/collections/${encodeURIComponent(createdCollectionId)}`, {
        method: 'DELETE',
        headers: { Accept: 'application/json' },
      }).catch(() => {});
    }
    setNotice(error instanceof Error && error.message ? `${tr('failed')} ${error.message}` : tr('failed'), 'error');
    busySignature = null;
    render();
  }
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
  suggestions = buildSuggestions();
}

async function refresh() {
  const button = document.querySelector('#smart-moments-refresh');
  if (button) button.disabled = true;
  try {
    await loadState();
    render();
  } catch {
    // The core library remains usable if suggestions cannot be refreshed.
  } finally {
    if (button) button.disabled = Boolean(busySignature);
  }
}

function applyLanguage() {
  suggestions = buildSuggestions();
  render();
}

async function init() {
  injectUi();
  new MutationObserver(() => window.queueMicrotask(applyLanguage))
    .observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });

  try {
    await loadState();
  } catch {
    suggestions = [];
  }
  render();

  const footer = document.querySelector('#footer-version');
  if (footer) footer.textContent = `NaughtyShare v${APP_VERSION}`;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
