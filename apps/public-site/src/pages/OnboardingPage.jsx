import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth, onboardingAPI, authAPI, notificationSettingsAPI } from '@shared';
import { Alert, Button, Card, CardContent, CardHeader, CardTitle, Checkbox, Input, Label, Skeleton } from '../components/ui';
import Seo from '../components/Seo';
import Breadcrumbs from '../components/Breadcrumbs';

/** Step 1: choose account type. Never offers 'admin' - self-service accounts
 * are only ever athlete/coach or supporter, matched by OnboardingRoleView's
 * server-side whitelist. */
function RoleStep({ onChoose, busy }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h1">Ce fel de cont vrei?</CardTitle>
        <p className="text-sm text-muted-foreground">Poți completa profilul detaliat la pasul următor.</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row">
        <Button className="flex-1" disabled={busy} onClick={() => onChoose('athlete')}>
          Sunt sportiv / antrenor
        </Button>
        <Button className="flex-1" variant="secondary" disabled={busy} onClick={() => onChoose('supporter')}>
          Sunt susținător
        </Button>
      </CardContent>
    </Card>
  );
}

/** "Cont" tab: account type + email + phone. Both reuse the generic
 * /auth/me/ PUT (email uniqueness is enforced by the User model). */
function AccountTab({ user, refetchUser }) {
  const isSupporter = user.role === 'supporter';
  const [email, setEmail] = useState(user.email || '');
  const [phoneNumber, setPhoneNumber] = useState(user.phone_number || '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const hasChanges = email !== user.email || phoneNumber !== (user.phone_number || '');

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage(null);
    if (!hasChanges) return;
    setBusy(true);
    try {
      await authAPI.updateProfile({ email, phone_number: phoneNumber });
      await refetchUser();
      setMessage({ type: 'success', text: 'Datele contului au fost actualizate.' });
    } catch (err) {
      const data = err.response?.data;
      const firstError = data && typeof data === 'object' ? Object.values(data)[0] : null;
      setMessage({ type: 'destructive', text: (Array.isArray(firstError) ? firstError[0] : firstError) || 'Nu am putut actualiza datele contului.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-display text-lg font-bold text-[#00334d]">Cont</h2>
      <p className="text-sm"><span className="font-medium">Tip cont:</span> {isSupporter ? 'Susținător' : 'Sportiv / antrenor'}</p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="account-email">Adresă de email</Label>
          <Input id="account-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="account-phone">Telefon</Label>
          <Input id="account-phone" type="tel" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} />
        </div>
        <Button type="submit" disabled={busy || !hasChanges} className="self-start">
          {busy ? 'Se salvează…' : 'Salvează'}
        </Button>
        {message && <Alert variant={message.type}>{message.text}</Alert>}
      </form>
    </div>
  );
}

/** "Parola" tab: requires the current password to change it. */
function PasswordTab() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage(null);
    if (newPassword !== newPasswordConfirm) {
      setMessage({ type: 'destructive', text: 'Parolele noi nu coincid.' });
      return;
    }
    setBusy(true);
    try {
      await authAPI.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setNewPasswordConfirm('');
      setMessage({ type: 'success', text: 'Parola a fost schimbată cu succes.' });
    } catch (err) {
      setMessage({ type: 'destructive', text: err.response?.data?.error || 'Nu am putut schimba parola.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-display text-lg font-bold text-[#00334d]">Parolă</h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <Label htmlFor="account-current-password">Parolă curentă</Label>
        <Input
          id="account-current-password"
          type="password"
          required
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
        <Label htmlFor="account-new-password">Parolă nouă</Label>
        <Input
          id="account-new-password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <Label htmlFor="account-new-password-confirm">Confirmă parola nouă</Label>
        <Input
          id="account-new-password-confirm"
          type="password"
          required
          autoComplete="new-password"
          value={newPasswordConfirm}
          onChange={(e) => setNewPasswordConfirm(e.target.value)}
        />
        <Button type="submit" disabled={busy} className="self-start">
          {busy ? 'Se schimbă…' : 'Schimbă parola'}
        </Button>
        {message && <Alert variant={message.type}>{message.text}</Alert>}
      </form>
    </div>
  );
}

const NOTIFICATION_FIELDS = [
  {
    group: 'Email',
    items: [
      ['email_on_result_status_change', 'Schimbarea stării unui rezultat'],
      ['email_on_grade_status_change', 'Schimbarea stării unui examen de grad'],
      ['email_on_seminar_status_change', 'Schimbarea stării unei participări la seminar'],
      ['email_on_visa_status_change', 'Schimbarea stării unei vize'],
      ['email_on_competition_updates', 'Actualizări ale competițiilor'],
      ['email_on_system_announcements', 'Anunțuri de sistem'],
    ],
  },
  {
    group: 'WhatsApp',
    items: [
      ['notify_via_whatsapp', 'Trimite-mi și un mesaj WhatsApp la schimbarea stării unei cereri'],
    ],
  },
  {
    group: 'În aplicație',
    items: [
      ['notify_result_submitted', 'Rezultat trimis'],
      ['notify_result_approved', 'Rezultat aprobat'],
      ['notify_result_rejected', 'Rezultat respins'],
      ['notify_result_revision_required', 'Rezultat cu completări solicitate'],
      ['notify_grade_submitted', 'Examen de grad trimis'],
      ['notify_grade_approved', 'Examen de grad aprobat'],
      ['notify_grade_rejected', 'Examen de grad respins'],
      ['notify_grade_revision_required', 'Examen de grad cu completări solicitate'],
      ['notify_seminar_submitted', 'Participare la seminar trimisă'],
      ['notify_seminar_approved', 'Participare la seminar aprobată'],
      ['notify_seminar_rejected', 'Participare la seminar respinsă'],
      ['notify_seminar_revision_required', 'Participare la seminar cu completări solicitate'],
      ['notify_competition_created', 'Competiție nouă'],
      ['notify_competition_updated', 'Competiție actualizată'],
      ['notify_system_announcements', 'Anunțuri de sistem'],
    ],
  },
];

/** "Notificari" tab. */
function NotificationsTab() {
  const [settings, setSettings] = useState(null);
  const [busyField, setBusyField] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    notificationSettingsAPI.get().then((res) => setSettings(res.data)).catch(() => setError('Nu am putut încărca setările de notificare.'));
  }, []);

  async function toggle(field) {
    if (!settings) return;
    const next = !settings[field];
    setSettings((prev) => ({ ...prev, [field]: next }));
    setBusyField(field);
    setError('');
    try {
      await notificationSettingsAPI.update(settings.id, { [field]: next });
    } catch {
      setSettings((prev) => ({ ...prev, [field]: !next }));
      setError('Nu am putut salva preferința. Încearcă din nou.');
    } finally {
      setBusyField(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <h2 className="font-display text-lg font-bold text-[#00334d]">Notificări</h2>
      {error && <Alert variant="destructive">{error}</Alert>}
      {!settings && !error && <p className="text-sm text-muted-foreground">Se încarcă…</p>}
      {settings && NOTIFICATION_FIELDS.map(({ group, items }) => (
        <div key={group} className="flex flex-col gap-2">
          <span className="text-sm font-medium">{group}</span>
          {items.map(([field, label]) => (
            <label key={field} className="flex items-center gap-2 text-sm">
              <Checkbox checked={!!settings[field]} disabled={busyField === field} onCheckedChange={() => toggle(field)} />
              {label}
            </label>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Account settings, split into tabs. Uses its own `section` search param
 * (distinct from AthleteDetailPage's own `tab` param) so the embedded
 * "Profil" tab's internal Info/Rezultate/... sub-tabs don't collide with
 * this page's top-level tab state. */
function StatusStep({ user, refetchUser }) {
  const [searchParams, setSearchParams] = useSearchParams();

  const SECTIONS = [
    { key: 'cont', label: 'Cont' },
    { key: 'notificari', label: 'Notificări' },
    { key: 'parola', label: 'Parolă' },
  ];

  const requested = searchParams.get('section');
  const section = SECTIONS.some((s) => s.key === requested) ? requested : SECTIONS[0].key;

  function goToSection(key) {
    const next = new URLSearchParams(searchParams);
    next.set('section', key);
    setSearchParams(next);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2 border-b">
        {SECTIONS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => goToSection(key)}
            className={`border-b-2 px-3 py-2 text-sm font-medium transition ${section === key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {section === 'cont' && <AccountTab user={user} refetchUser={refetchUser} />}
      {section === 'notificari' && <NotificationsTab />}
      {section === 'parola' && <PasswordTab />}
    </div>
  );
}

export default function OnboardingPage() {
  const { user, refetchUser, loading } = useAuth();
  const navigate = useNavigate();
  const [choosingRole, setChoosingRole] = useState(false);
  const [roleError, setRoleError] = useState('');

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (!user) return null;

  async function chooseRole(role) {
    setRoleError('');
    setChoosingRole(true);
    try {
      await onboardingAPI.setRole(role);
      await refetchUser();
      if (role === 'athlete') navigate('/onboarding/sportiv');
    } catch {
      setRoleError('Nu am putut salva alegerea. Încearcă din nou.');
    } finally {
      setChoosingRole(false);
    }
  }

  const needsRoleChoice = user.role === 'user';
  const needsAthleteProfile = user.role === 'athlete' && !user.profile_completed;

  if (needsAthleteProfile) return <Navigate to="/onboarding/sportiv" replace />;

  if (needsRoleChoice) {
    return (
      <div className="mx-auto flex max-w-lg flex-col gap-6 pt-10 sm:pt-16">
        <Seo title="Setări" path="/cont" noindex />
        {roleError && <Alert variant="destructive">{roleError}</Alert>}
        <RoleStep onChoose={chooseRole} busy={choosingRole} />
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <Seo title="Setări" path="/cont" noindex />

      <Breadcrumbs items={[{ label: 'Contul meu' }]} showCurrent />

      <div className="site-full-bleed bg-[#e9ecef]">
        <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:py-16">
          <h1 className="text-fluid-h2 font-display font-bold text-[#00334d]">Contul meu</h1>
        </div>
      </div>

      <div className="flex flex-col gap-6 pt-8">
        {roleError && <Alert variant="destructive">{roleError}</Alert>}
        <StatusStep user={user} refetchUser={refetchUser} />
      </div>
    </div>
  );
}
