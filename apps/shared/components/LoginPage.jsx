import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Logo from './Logo';

export default function LoginPage({ title = 'Login' }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.response?.data?.detail || 'Autentificarea a eșuat');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-4">
      <div className="w-full max-w-sm space-y-6 bg-white p-8">
        <div className="text-center">
          <div className="mb-4 flex justify-center">
            <Logo size={96} />
          </div>
          <h1 className="text-2xl font-black uppercase tracking-wide text-black">{title}</h1>
          <p className="mt-1 text-sm text-gray-600">Federația Română de Vovinam Viet Vo Dao</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              id="email"
              type="text"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="frvv-input mt-1 block w-full"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Parolă
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="frvv-input mt-1 block w-full"
            />
          </div>

          <button
            type="submit"
            disabled={busy}
            className="frvv-btn-primary w-full"
          >
            {busy ? 'Se autentifică…' : 'Autentificare'}
          </button>
        </form>
      </div>
    </div>
  );
}
