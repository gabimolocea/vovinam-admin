import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@shared';
import Logo from '@shared/components/Logo';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleCredentials = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
      navigate('/');
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
          <h1 className="text-2xl font-black uppercase tracking-wide text-black">Panou arbitraj</h1>
          <p className="mt-1 text-sm text-gray-600">Federația Română de Vovinam Viet Vo Dao</p>
        </div>

        {error && <div className="border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <form onSubmit={handleCredentials} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="frvv-input block w-full"
            autoComplete="email"
          />
          <input
            type="password"
            placeholder="Parolă"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="frvv-input block w-full"
            autoComplete="current-password"
          />
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
