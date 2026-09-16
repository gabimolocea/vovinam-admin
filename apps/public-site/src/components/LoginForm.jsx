import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, authAPI } from '@shared';
import { Alert, Button, Req } from './ui';
import { Eye, EyeOff } from 'lucide-react';

/** Inline "forgot password" mini-form - swaps in for the login fields when
 * open, rather than navigating away, so it works the same in the compact
 * header popover as on the full /cont page. */
function ForgotPasswordForm({ compact, onBack }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await authAPI.requestPasswordReset(email);
      setSent(true);
    } catch {
      setError('Nu am putut trimite emailul de resetare. Încearcă din nou.');
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className={`flex flex-col ${compact ? 'gap-3' : 'gap-4'}`}>
        <Alert variant="success">
          Dacă adresa <strong>{email}</strong> există în sistem, vei primi un email cu un link de resetare a parolei.
        </Alert>
        <button type="button" onClick={onBack} className="text-center text-sm font-medium text-brand-red underline">
          Înapoi la autentificare
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={`flex flex-col ${compact ? 'gap-3' : 'gap-4'}`}>
      {error && <Alert variant="destructive">{error}</Alert>}
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Introdu adresa de email a contului tău<Req /></span>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="site-form-input"
        />
      </label>
      <Button
        type="submit"
        disabled={busy}
        className="h-auto rounded-lg bg-[#da3b26] py-3 text-base font-bold uppercase tracking-wide text-white hover:bg-[#da3b26]/90"
        style={{ fontFamily: "'Roboto Condensed', sans-serif" }}
      >
        {busy ? 'Se trimite…' : 'Trimite link de resetare'}
      </Button>
      <button type="button" onClick={onBack} className="text-center text-sm font-medium text-muted-foreground underline">
        Înapoi la autentificare
      </button>
    </form>
  );
}

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
  const [showForgotForm, setShowForgotForm] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password);
      if (onSuccess) {
        onSuccess();
      } else {
        // /cont figures out where to send this account: an approved
        // coach/athlete straight to their dashboard, everyone else to the
        // account status page.
        navigate('/cont', { replace: true });
      }
    } catch (err) {
      setError(err.response?.data?.detail || err.response?.data?.error || 'Autentificarea a eșuat. Verifică emailul și parola.');
    } finally {
      setBusy(false);
    }
  }

  if (showForgotForm) {
    return <ForgotPasswordForm compact={compact} onBack={() => setShowForgotForm(false)} />;
  }

  return (
    <form onSubmit={handleSubmit} className={`flex flex-col ${compact ? 'gap-3' : 'gap-4'}`}>
      {error && <Alert variant="destructive">{error}</Alert>}

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Introdu adresa de email<Req /></span>
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
        <span className="font-medium">Parolă<Req /></span>
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

      <Button
        type="submit"
        disabled={busy}
        className="h-auto rounded-lg bg-[#da3b26] py-3 text-base font-bold uppercase tracking-wide text-white hover:bg-[#da3b26]/90"
        style={{ fontFamily: "'Roboto Condensed', sans-serif" }}
      >
        {busy ? 'Se autentifică…' : 'Autentificare'}
      </Button>

      {showForgotPassword && (
        <button
          type="button"
          onClick={() => setShowForgotForm(true)}
          className="text-center text-sm font-medium text-brand-red underline"
        >
          Ai uitat parola?
        </button>
      )}
    </form>
  );
}
