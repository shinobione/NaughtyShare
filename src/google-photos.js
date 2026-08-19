const POLL_FALLBACK_MS = 1800;
const MAX_POLL_MS = 5 * 60 * 1000;

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

async function waitForSelection(popup) {
  const startedAt = Date.now();
  let waitMs = POLL_FALLBACK_MS;
  let closedGracePolls = 0;

  while (Date.now() - startedAt < MAX_POLL_MS) {
    await sleep(waitMs);

    let status;
    try {
      status = await getStatus();
    } catch {
      if (popup?.closed) closedGracePolls += 1;
      if (closedGracePolls >= 3) throw new Error('cancelled');
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

    if (popup?.closed) {
      closedGracePolls += 1;
      if (closedGracePolls >= 3) {
        await cancelSession();
        throw new Error('cancelled');
      }
    } else {
      closedGracePolls = 0;
    }
  }

  await cancelSession();
  throw new Error('timeout');
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
    await waitForSelection(popup);
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'expired') {
      notice(
        copy('La session Google Photos a expiré. Relance l’import.', 'Phiên Google Photos đã hết hạn. Hãy nhập lại.'),
        'error',
      );
    } else if (code === 'timeout') {
      notice(
        copy('Google Photos n’a pas terminé la sélection à temps.', 'Google Photos chưa hoàn tất lựa chọn kịp thời.'),
        'error',
      );
    } else if (code === 'cancelled') {
      notice(
        copy('Import Google Photos annulé.', 'Đã hủy nhập Google Photos.'),
        'working',
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
