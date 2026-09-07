import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, onboardingAPI } from '@shared';
import { Alert, Button } from '../components/ui';
import Seo from '../components/Seo';
import LoginForm from '../components/LoginForm';
import OnboardingPage from './OnboardingPage';
import { Check } from 'lucide-react';

const BENEFITS = [
  'Îți gestionezi profilul de sportiv sau antrenor și pagina clubului',
  'Urmărești în timp real statusul cererilor (aprobare, grade, vize)',
  'Depui rezultate, participări la seminarii și vize anuale mai rapid',
];

function RegisterForm() {
  const { register, refetchUser } = useAuth();
  const navigate = useNavigate();
  const [accountType, setAccountType] = useState('athlete');
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
          <Button
            type="button"
            className="flex-1"
            variant={accountType === 'athlete' ? 'default' : 'secondary'}
            onClick={() => setAccountType('athlete')}
          >
            Sportiv
          </Button>
          <Button
            type="button"
            className="flex-1"
            variant={accountType === 'supporter' ? 'default' : 'secondary'}
            onClick={() => setAccountType('supporter')}
          >
            Susținător
          </Button>
        </div>
      </div>

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
        {busy ? 'Se creează contul…' : 'Înregistrare'}
      </Button>
    </form>
  );
}

function AuthGate() {
  return (
    <div className="grid gap-10 lg:grid-cols-2">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">De ce să-ți creezi cont?</h1>
          <ul className="flex flex-col gap-2">
            {BENEFITS.map((benefit) => (
              <li key={benefit} className="flex items-start gap-2 text-sm text-muted-foreground">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-red" />
                <span>{benefit}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-4">
          <h2 className="font-display text-xl font-semibold">Vreau un cont nou</h2>
          <RegisterForm />
        </div>
      </div>

      <div className="flex flex-col gap-4 rounded-xl border p-6 lg:self-start">
        <h2 className="font-display text-xl font-semibold">Am deja cont</h2>
        <LoginForm />
      </div>
    </div>
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
