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
    <div className="flex min-h-screen items-center justify-center bg-muted px-4">
      <div className="w-full max-w-sm space-y-6 rounded-lg border border-border bg-card p-8 shadow-sm">
        <div className="text-center">
          <div className="mb-4 flex justify-center">
            <Logo size={96} />
          </div>
          <h1 className="font-display text-2xl font-semibold text-foreground">Panou arbitraj</h1>
          <p className="mt-1 text-sm text-muted-foreground">Federația Română de Vovinam Viet Vo Dao</p>
        </div>

        {error && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleCredentials} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="block h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            autoComplete="email"
          />
          <input
            type="password"
            placeholder="Parolă"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="block h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            autoComplete="current-password"
          />
          <button
            type="submit"
            disabled={busy}
            className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
          >
            {busy ? 'Se autentifică…' : 'Autentificare'}
          </button>
        </form>
      </div>
    </div>
  );
}
