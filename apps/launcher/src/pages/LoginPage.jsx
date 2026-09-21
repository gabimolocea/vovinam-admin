import { useState } from 'react';
import frvvLogo from '../assets/frvv-logo.png';
import { cleanErrorMessage } from '../lib/cleanError.js';

const CLOUD_URL = 'https://vovinam.ro';

export default function LoginPage({ onLoggedIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await window.launcher.login(CLOUD_URL, email, password);
      onLoggedIn(CLOUD_URL);
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
