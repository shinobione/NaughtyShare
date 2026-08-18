import './styles.css';

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
        <p>Les médias seront servis uniquement après authentification.</p>
      </div>
    </section>

    <section class="actions" aria-label="Actions principales">
      <button class="action primary" id="google-import" type="button" disabled>
        <span class="action-icon">G</span>
        <span>
          <strong>Importer depuis Google Photos</strong>
          <small>Google Photos Picker</small>
        </span>
      </button>
      <button class="action" id="device-upload" type="button" disabled>
        <span class="action-icon">＋</span>
        <span>
          <strong>Ajouter depuis l’appareil</strong>
          <small>Photos & vidéos</small>
        </span>
      </button>
    </section>

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
        <p>L’import sera activé dès que le backend privé et l’authentification seront configurés.</p>
      </div>
      <div class="gallery" id="gallery" hidden></div>
    </section>

    <footer>
      <span>NaughtyShare v0.1.0</span>
      <span>Code ≠ médias · aucun contenu privé dans Git</span>
    </footer>
  </main>
`;

const status = document.querySelector('#vault-status');

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
    document.querySelector('#google-import').disabled = false;
    document.querySelector('#device-upload').disabled = false;
  } catch {
    status.dataset.state = 'offline';
    status.lastElementChild.textContent = 'Coffre non configuré';
  }
}

checkVault();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // The app remains usable without offline shell support.
    });
  });
}
