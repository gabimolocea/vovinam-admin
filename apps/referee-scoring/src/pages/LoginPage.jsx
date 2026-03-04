import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@shared';
import api from '@shared/lib/api';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState('credentials'); // 'credentials' | 'qr'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [qrCode, setQrCode] = useState('');
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
      setError(err.response?.data?.detail || 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  const handleQR = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post('/qr-codes/verify_qr_code/', { code: qrCode });
      const access = data.tokens?.access || data.access || data.token;
      const refresh = data.tokens?.refresh || data.refresh;
      if (access) {
        localStorage.setItem('authToken', access);
        if (refresh) localStorage.setItem('refreshToken', refresh);
        window.location.reload();
      } else {
        setError('Invalid QR code response');
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'QR verification failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-blue-900 px-4">
      <div className="w-full max-w-sm space-y-6 rounded-2xl bg-white p-8 shadow-xl">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">🥋 Referee Scoring</h1>
          <p className="mt-1 text-sm text-gray-500">FRVV Competition System</p>
        </div>

        {/* Mode toggle */}
        <div className="flex rounded-lg bg-gray-100 p-1">
          <button
            onClick={() => setMode('credentials')}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
              mode === 'credentials' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}
          >
            Email / Password
          </button>
          <button
            onClick={() => setMode('qr')}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
              mode === 'qr' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}
          >
            QR Code
          </button>
        </div>

        {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        {mode === 'credentials' ? (
          <form onSubmit={handleCredentials} className="space-y-4">
            <input
              type="text"
              placeholder="Email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            <input
              type="password"
              placeholder="Password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-blue-700 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
            >
              {busy ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleQR} className="space-y-4">
            <input
              type="text"
              placeholder="Enter or scan QR code"
              required
              value={qrCode}
              onChange={(e) => setQrCode(e.target.value)}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-center text-lg tracking-widest focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              autoFocus
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-blue-700 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
            >
              {busy ? 'Verifying…' : 'Verify QR Code'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
