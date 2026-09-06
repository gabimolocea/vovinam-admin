import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@shared';
import { Alert, Button, Card, CardContent, CardHeader, CardTitle } from '../components/ui';
import Seo from '../components/Seo';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (password !== passwordConfirm) {
      setError('Parolele nu coincid.');
      return;
    }

    setBusy(true);
    try {
      await register({ email, password, passwordConfirm });
      navigate('/cont');
    } catch (err) {
      const data = err.response?.data;
      const firstError = data && typeof data === 'object' ? Object.values(data)[0] : null;
      setError((Array.isArray(firstError) ? firstError[0] : firstError) || 'Înregistrarea a eșuat. Încearcă din nou.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <Seo title="Creează cont" path="/inregistrare" noindex />
      <Card>
        <CardHeader>
          <CardTitle as="h1">Creează cont</CardTitle>
          <p className="text-sm text-muted-foreground">
            Contul se creează doar cu email și parolă. După autentificare vei completa profilul de sportiv,
            antrenor sau susținător în pași simpli.
          </p>
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
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="site-form-input"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Confirmă parola</span>
              <input
                type="password"
                required
                autoComplete="new-password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                className="site-form-input"
              />
            </label>

            <Button type="submit" disabled={busy}>
              {busy ? 'Se creează contul…' : 'Creează cont'}
            </Button>
          </form>

          <p className="mt-4 text-sm text-muted-foreground">
            Ai deja cont? <Link to="/autentificare" className="font-medium underline">Autentifică-te</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
