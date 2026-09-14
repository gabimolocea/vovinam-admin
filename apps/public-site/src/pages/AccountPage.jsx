import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth, onboardingAPI } from '@shared';
import { Alert, Button, Req } from '../components/ui';
import Seo from '../components/Seo';
import Breadcrumbs from '../components/Breadcrumbs';
import LoginForm from '../components/LoginForm';
import OnboardingPage from './OnboardingPage';
import { Eye, EyeOff } from 'lucide-react';

function RegisterForm() {
  const { register, refetchUser } = useAuth();
  const navigate = useNavigate();
  const [accountType, setAccountType] = useState('athlete');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (password !== passwordConfirm) {
      setError('Parolele nu coincid.');
      return;
    }
    if (!termsAccepted) {
      setError('Trebuie să accepți Termenii și Condițiile, Politica de Confidențialitate și GDPR pentru a-ți crea un cont.');
      return;
    }

    setBusy(true);
    try {
      await register({ email, password, passwordConfirm, termsAccepted });
      await onboardingAPI.setRole(accountType);
      await refetchUser();
      navigate(accountType === 'athlete' ? '/onboarding/sportiv' : '/cont', { replace: true });
    } catch (err) {
      const data = err.response?.data;
      const firstError = data && typeof data === 'object' ? Object.values(data)[0] : null;
      setError((Array.isArray(firstError) ? firstError[0] : firstError) || 'Înregistrarea a eșuat. Încearcă din nou.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <Alert variant="destructive">{error}</Alert>}

      <div className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Tip cont</span>
        <div className="flex gap-3">
          {[
            { value: 'athlete', label: 'Sportiv' },
            { value: 'supporter', label: 'Susținător/Părinte/Tutore' },
          ].map((option) => (
            <label
              key={option.value}
              className={`flex flex-1 cursor-pointer items-center gap-2 rounded-lg border-2 px-4 py-3 text-sm font-medium transition ${
                accountType === option.value ? 'border-[#0a4c75] bg-[#0a4c75]/5' : 'border-border'
              }`}
            >
              <input
                type="radio"
                name="accountType"
                value={option.value}
                checked={accountType === option.value}
                onChange={() => setAccountType(option.value)}
                className="h-4 w-4 accent-[#0a4c75]"
              />
              {option.label}
            </label>
          ))}
        </div>
      </div>

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
            minLength={8}
            autoComplete="new-password"
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

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Confirmă parola<Req /></span>
        <div className="relative">
          <input
            type={showPasswordConfirm ? 'text' : 'password'}
            required
            autoComplete="new-password"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            className="site-form-input pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPasswordConfirm((v) => !v)}
            className="absolute inset-y-0 right-2 flex items-center text-muted-foreground"
            aria-label={showPasswordConfirm ? 'Ascunde parola' : 'Arată parola'}
          >
            {showPasswordConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </label>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          required
          checked={termsAccepted}
          onChange={(e) => setTermsAccepted(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[#0a4c75]"
        />
        <span>
          Sunt de acord cu{' '}
          <Link to="/termeni-si-conditii" target="_blank" rel="noopener noreferrer" className="font-medium text-brand-red underline">
            Termenii și Condițiile
          </Link>
          , <Link to="/confidentialitate" target="_blank" rel="noopener noreferrer" className="font-medium text-brand-red underline">
            Politica de Confidențialitate
          </Link>{' '}
          și <Link to="/gdpr" target="_blank" rel="noopener noreferrer" className="font-medium text-brand-red underline">
            informarea GDPR
          </Link>.
        </span>
      </label>

      <Button
        type="submit"
        disabled={busy}
        className="h-auto rounded-lg bg-[#da3b26] py-3 text-base font-bold uppercase tracking-wide text-white hover:bg-[#da3b26]/90"
        style={{ fontFamily: "'Roboto Condensed', sans-serif" }}
      >
        {busy ? 'Se creează contul…' : 'Înregistrare'}
      </Button>
    </form>
  );
}

function AuthGate() {
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get('mode') === 'register' ? 'register' : 'login');

  return (
    <>
      <Breadcrumbs items={[{ label: 'Contul meu' }]} showCurrent />

      <div className="mx-auto mt-8 flex w-full max-w-2xl flex-col gap-8">
        {/* shadcn-style tab list (bg-muted pill, active trigger gets a
            white/shadowed "chip") rather than two full-size block buttons. */}
        <div role="tablist" className="inline-flex h-12 w-fit items-center justify-center rounded-lg bg-[#e9ecef] p-1.5">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'login'}
          onClick={() => setActiveTab('login')}
          className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-6 py-2 text-base font-bold uppercase tracking-wide transition-all ${
            activeTab === 'login' ? 'bg-white text-[#00334d] shadow-sm' : 'text-muted-foreground hover:text-[#00334d]'
          }`}
        >
          Autentificare
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'register'}
          onClick={() => setActiveTab('register')}
          className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-6 py-2 text-base font-bold uppercase tracking-wide transition-all ${
            activeTab === 'register' ? 'bg-white text-[#00334d] shadow-sm' : 'text-muted-foreground hover:text-[#00334d]'
          }`}
        >
          Înregistrare
        </button>
      </div>

      {activeTab === 'login' ? <LoginForm /> : <RegisterForm />}
      </div>
    </>
  );
}

export default function AccountPage() {
  const { isAuthenticated } = useAuth();

  if (isAuthenticated) return <OnboardingPage />;

  return (
    <>
      <Seo title="Contul meu" path="/cont" noindex />
      <AuthGate />
    </>
  );
}
