import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@shared';
import { Alert, Button, Card, CardContent, CardHeader, CardTitle } from '../components/ui';
import Seo from '../components/Seo';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password);
      navigate('/cont');
    } catch (err) {
      setError(err.response?.data?.detail || err.response?.data?.error || 'Autentificarea a eșuat. Verifică emailul și parola.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <Seo title="Autentificare" path="/autentificare" noindex />
      <Card>
        <CardHeader>
          <CardTitle as="h1">Autentificare</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {error && <Alert variant="destructive">{error}</Alert>}

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Email</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="site-form-input"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Parolă</span>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="site-form-input"
              />
            </label>

            <Button type="submit" disabled={busy}>
              {busy ? 'Se autentifică…' : 'Autentificare'}
            </Button>
          </form>

          <p className="mt-4 text-sm text-muted-foreground">
            Nu ai cont? <Link to="/inregistrare" className="font-medium underline">Înregistrează-te</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
