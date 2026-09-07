import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@shared';
import { Alert, Button } from './ui';
import { Eye, EyeOff } from 'lucide-react';

/** Shared login form used both in the header "Cont" popover and on the
 * full /cont page. `compact` tightens spacing for the popover context. */
export default function LoginForm({ onSuccess, compact = false, showForgotPassword = true }) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [forgotNotice, setForgotNotice] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password);
      if (onSuccess) {
        onSuccess();
      } else {
        navigate('/cont', { replace: true });
      }
    } catch (err) {
      setError(err.response?.data?.detail || err.response?.data?.error || 'Autentificarea a eșuat. Verifică emailul și parola.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={`flex flex-col ${compact ? 'gap-3' : 'gap-4'}`}>
      {error && <Alert variant="destructive">{error}</Alert>}

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Introdu adresa de email</span>
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
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="site-form-input pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute inset-y-0 right-2 flex items-center text-muted-foreground"
            aria-label={showPassword ? 'Ascunde parola' : 'Arată parola'}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </label>

      <Button type="submit" disabled={busy}>
        {busy ? 'Se autentifică…' : 'Autentificare'}
      </Button>

      {showForgotPassword && (
        <div className="flex flex-col items-center gap-1 text-center text-sm">
          <button type="button" onClick={() => setForgotNotice(true)} className="font-medium text-brand-red underline">
            Ai uitat parola?
          </button>
          {forgotNotice && (
            <span className="text-xs text-muted-foreground">
              Contactează un administrator al federației pentru resetarea parolei.
            </span>
          )}
        </div>
      )}
    </form>
  );
}
