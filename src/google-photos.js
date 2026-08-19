const POLL_FALLBACK_MS = 1800;
const INITIAL_POLL_TIMEOUT_MS = 15 * 60 * 1000;

function isVietnamese() {
  return document.documentElement.lang?.toLowerCase().startsWith('vi');
}

function copy(fr, vi) {
  return isVietnamese() ? vi : fr;
}

function notice(message, state = 'ok') {
  const node = document.querySelector('#upload-note');
  if (!node) return;
  node.dataset.state = state;
  node.textContent = message;
}

function googleButton() {
  return document.querySelector('#google-import');
}

function googleSubtitle() {
  return document.querySelector('#google-subtitle');
}

function renderPickerState(enabled) {
  const button = googleButton();
  const subtitle = googleSubtitle();
  if (!button || !subtitle) return;

  button.disabled = !enabled;
  subtitle.textContent = enabled
    ? copy('Google Photos Picker · prêt', 'Google Photos Picker · sẵn sàng')
    : copy('Google Photos Picker · configuration requise', 'Google Photos Picker · cần cấu hình');
}

async function pickerEnabled() {
  try {
    const response = await fetch('/api/health', {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) return false;
    const data = await response.json();
    return data?.googlePhotosPicker === true;
  } catch {
    return false;
  }
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function cancelSession() {
  try {
    await fetch('/api/google/photos/session', {
      method: 'DELETE',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
  } catch {
    // Best-effort cleanup only.
  }
}

async function getStatus() {
  const response = await fetch('/api/google/photos/status', {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function importAllBatches() {
  let importedTotal = 0;
  let skippedTotal = 0;
  let batch = 0;

  while (true) {
    batch += 1;
    notice(
      copy(
        `Import Google Photos · lot ${batch}…`,
        `Đang nhập Google Photos · đợt ${batch}…`,
      ),
      'working',
    );

    const response = await fetch('/api/google/photos/import', {
      method: 'POST',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    importedTotal += Number(data?.imported || 0);
    skippedTotal += Number(data?.skipped || 0);

    if (data?.done === true) break;
  }

  const skippedNote = skippedTotal
    ? copy(` · ${skippedTotal} ignoré(s)`, ` · bỏ qua ${skippedTotal}`)
    : '';
  notice(
    copy(
      `${importedTotal} média(s) importé(s) depuis Google Photos${skippedNote}.`,
      `Đã nhập ${importedTotal} mục từ Google Photos${skippedNote}.`,
    ),
    skippedTotal ? 'working' : 'ok',
  );

  window.setTimeout(() => window.location.reload(), 900);
}

async function waitForSelection() {
  let waitMs = POLL_FALLBACK_MS;
  let pollDeadline = Date.now() + INITIAL_POLL_TIMEOUT_MS;

  while (true) {
    const remainingMs = pollDeadline - Date.now();
    if (remainingMs <= 0) {
      await cancelSession();
      throw new Error('timeout');
    }

    await sleep(Math.min(waitMs, remainingMs));

    let status;
    try {
      status = await getStatus();
    } catch {
      // OAuth and Google Photos may hand the flow across browser contexts.
      // A popup/window reference can report closed while the Picker session
      // is still active, so session state remains the only cancellation truth.
      continue;
    }

    if (status?.ready === true) {
      await importAllBatches();
      return;
    }

    if (status?.active === false && status?.expired) {
      throw new Error('expired');
    }

    if (Number.isFinite(Number(status?.pollIntervalMs))) {
      waitMs = Math.min(5000, Math.max(700, Number(status.pollIntervalMs)));
    }

    if (Number.isFinite(Number(status?.timeoutMs))) {
      const timeoutMs = Math.max(0, Number(status.timeoutMs));
      if (timeoutMs === 0) {
        await cancelSession();
        throw new Error('timeout');
      }
      pollDeadline = Date.now() + timeoutMs;
    }
  }
}

async function startPicker() {
  const button = googleButton();
  if (!button || button.disabled) return;

  button.disabled = true;
  notice(
    copy('Ouverture de Google Photos…', 'Đang mở Google Photos…'),
    'working',
  );

  const popup = window.open(
    '/api/google/photos/start',
    'naughtyshare-google-photos',
    'popup,width=520,height=760,resizable=yes,scrollbars=yes',
  );

  if (!popup) {
    notice(
      copy(
        'Le navigateur a bloqué la fenêtre Google Photos. Autorise les pop-ups pour NaughtyShare puis réessaie.',
        'Trình duyệt đã chặn cửa sổ Google Photos. Hãy cho phép pop-up cho NaughtyShare rồi thử lại.',
      ),
      'error',
    );
    button.disabled = false;
    return;
  }

  const onMessage = (event) => {
    if (event.origin !== window.location.origin) return;
    if (event.data?.type !== 'naughtyshare-google-photos') return;
    if (event.data?.state === 'error') {
      notice(
        copy('Autorisation Google Photos annulée.', 'Đã hủy quyền truy cập Google Photos.'),
        'error',
      );
    }
  };
  window.addEventListener('message', onMessage);

  try {
    await waitForSelection();
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'expired') {
      notice(
        copy('La session Google Photos a expiré. Relance l’import.', 'Phiên Google Photos đã hết hạn. Hãy nhập lại.'),
        'error',
      );
    } else if (code === 'timeout') {
      notice(
        copy(
          'La fenêtre de sélection Google Photos a expiré. Relance l’import quand tu es prêt à choisir.',
          'Phiên chọn Google Photos đã hết thời gian. Hãy nhập lại khi bạn sẵn sàng chọn.',
        ),
        'error',
      );
    } else {
      notice(
        copy('Impossible d’importer depuis Google Photos.', 'Không thể nhập từ Google Photos.'),
        'error',
      );
    }
  } finally {
    window.removeEventListener('message', onMessage);
    const enabled = await pickerEnabled();
    renderPickerState(enabled);
  }
}

async function initGooglePhotosPicker() {
  const button = googleButton();
  if (!button) return;

  const enabled = await pickerEnabled();
  renderPickerState(enabled);
  button.addEventListener('click', startPicker);

  const languageObserver = new MutationObserver(() => renderPickerState(!button.disabled));
  languageObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['lang'],
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initGooglePhotosPicker, { once: true });
} else {
  initGooglePhotosPicker();
}
