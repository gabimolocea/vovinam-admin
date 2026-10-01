import { useState } from 'react';
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

export default function LoginPage({ onLoggedIn }) {
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

      <p className="footer-note">Parola nu este salvată pe disc — este folosită doar cât timp aplicația rulează.</p>
    </div>
  );
}
