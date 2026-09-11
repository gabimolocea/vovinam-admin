import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authAPI } from '@shared';
import { Alert, Button } from '../components/ui';
import Seo from '../components/Seo';
import Breadcrumbs from '../components/Breadcrumbs';

/** Landing page for the link emailed by the "Ai uitat parola?" flow
 * (/reseteaza-parola?uid=...&token=...) - sets a new password via
 * PasswordResetConfirmView, then sends the user to /cont to log in. */
export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const uid = searchParams.get('uid');
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (password !== passwordConfirm) {
      setError('Parolele nu coincid.');
      return;
    }

    setBusy(true);
    try {
      await authAPI.confirmPasswordReset(uid, token, password);
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Nu am putut reseta parola. Linkul poate fi expirat.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Seo title="Resetare parolă" path="/reseteaza-parola" noindex />
      <Breadcrumbs items={[{ label: 'Contul meu', to: '/cont' }, { label: 'Resetare parolă' }]} showCurrent />

      <div className="mx-auto mt-8 flex w-full max-w-md flex-col gap-6">
        <h1 className="font-display text-2xl font-bold text-[#00334d]">Resetare parolă</h1>

        {!uid || !token ? (
          <Alert variant="destructive">Link de resetare invalid. Cere unul nou din pagina de autentificare.</Alert>
        ) : done ? (
          <div className="flex flex-col gap-4">
            <Alert variant="success">Parola a fost resetată cu succes.</Alert>
            <Button onClick={() => navigate('/cont', { replace: true })}>Mergi la autentificare</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {error && <Alert variant="destructive">{error}</Alert>}

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Parolă nouă</span>
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
              <span className="font-medium">Confirmă parola nouă</span>
              <input
                type="password"
                required
                autoComplete="new-password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                className="site-form-input"
              />
            </label>

            <Button
              type="submit"
              disabled={busy}
              className="h-auto rounded-lg bg-[#da3b26] py-3 text-base font-bold uppercase tracking-wide text-white hover:bg-[#da3b26]/90"
              style={{ fontFamily: "'Roboto Condensed', sans-serif" }}
            >
              {busy ? 'Se salvează…' : 'Salvează parola nouă'}
            </Button>

            <Link to="/cont" className="text-center text-sm text-muted-foreground underline">
              Înapoi la autentificare
            </Link>
          </form>
        )}
      </div>
    </>
  );
}
