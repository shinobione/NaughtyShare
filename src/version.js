const APP_VERSION = '0.7.1';

function installVersionGuard() {
  const current = document.querySelector('#footer-version');
  if (!current) return;

  // Older feature layers intentionally guard their own release labels. Replace
  // the node so those observers stay attached to the detached element, then
  // guard the canonical release label on the live footer.
  const footer = current.dataset.releaseVersionGuard === APP_VERSION
    ? current
    : current.cloneNode(true);

  if (footer !== current) current.replaceWith(footer);
  footer.dataset.releaseVersionGuard = APP_VERSION;

  const wanted = `NaughtyShare v${APP_VERSION}`;
  const sync = () => {
    if (footer.textContent !== wanted) footer.textContent = wanted;
  };
  sync();

  const observer = new MutationObserver(sync);
  observer.observe(footer, { childList: true, characterData: true, subtree: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', installVersionGuard, { once: true });
} else {
  installVersionGuard();
}
