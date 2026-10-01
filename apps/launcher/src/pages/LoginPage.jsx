import { useState } from 'react';

/** Device-ul de arbitraj: un cip cu picioruse. Desenat aici, nu adus dintr-o
 *  biblioteca de iconite - e singura din toata aplicatia. */
function IconDevice() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <rect x="7" y="7" width="10" height="10" rx="1.5" />
      <path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4" />
    </svg>
  );
}
import frvvLogo from '../assets/frvv-logo.png';
import { cleanErrorMessage } from '../lib/cleanError.js';

const DEFAULT_CLOUD_URL = 'https://vovinam.ro';
const CLOUD_URL_KEY = 'launcher:cloud-url';

// Adresa de unde se iau competitiile. Implicit site-ul federatiei, dar
// editabila: la testare o indrepti catre backendul local
// (http://localhost:8000) si vezi competitiile de pe calculatorul asta, fara
// sa atingi datele reale din cloud.
function savedCloudUrl() {
  try {
    return window.localStorage.getItem(CLOUD_URL_KEY) || DEFAULT_CLOUD_URL;
  } catch {
    return DEFAULT_CLOUD_URL;
  }
}

export default function LoginPage({ onLoggedIn, onConfigureDevices }) {
  const [cloudUrl, setCloudUrl] = useState(savedCloudUrl);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const url = cloudUrl.trim().replace(/\/+$/, '') || DEFAULT_CLOUD_URL;
      // Salvam adresa pe care a folosit-o chiar cererea, nu pe cea tastata:
      // daca serverul ne-a trimis de la http la https, data viitoare pornim
      // direct corect. Vezi normalizeBaseUrl din electron/cloudSync.js.
      const { baseUrl } = await window.launcher.login(url, email, password);
      const adresaFolosita = baseUrl || url;
      setCloudUrl(adresaFolosita);
      try { window.localStorage.setItem(CLOUD_URL_KEY, adresaFolosita); } catch { /* fara persistenta */ }
      onLoggedIn(adresaFolosita);
    } catch (err) {
      setError(cleanErrorMessage(err, 'Autentificarea a eșuat.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <img src={frvvLogo} alt="FRVV" className="login-logo" />

      {error && <div className="error-box">{error}</div>}

      <form onSubmit={handleSubmit}>
        <label htmlFor="cloud-url">Server</label>
        <input
          id="cloud-url"
          type="text"
          value={cloudUrl}
          onChange={(e) => setCloudUrl(e.target.value)}
          placeholder={DEFAULT_CLOUD_URL}
          spellCheck={false}
          autoCapitalize="off"
        />

        <label htmlFor="email">Email</label>
        <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />

        <label htmlFor="password">Parolă</label>
        <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />

        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Se conectează…' : 'Conectare'}
        </button>
      </form>

      {/* Configurarea device-urilor nu are nevoie nici de cont, nici de
          competitie sincronizata - se face cu o saptamana inainte, pe masa
          din birou. De aceea e aici, nu dupa cinci ecrane. */}
      <button type="button" className="btn-link btn-icon" onClick={onConfigureDevices}>
        <IconDevice />
        Configurează Device Arbitru
      </button>

    </div>
  );
}
