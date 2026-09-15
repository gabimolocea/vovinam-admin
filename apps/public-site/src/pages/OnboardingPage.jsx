import { useEffect, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth, authAPI, notificationSettingsAPI } from '@shared';
import { Alert, Button, Card, Checkbox, Input, Label, Req, Skeleton } from '../components/ui';
import { User, Settings, ExternalLink, LogOut } from 'lucide-react';
import Seo from '../components/Seo';
import Breadcrumbs from '../components/Breadcrumbs';

const COACH_DASHBOARD_URL = import.meta.env.VITE_COACH_DASHBOARD_URL || 'http://localhost:5175';

/** True once an athlete's coach flag has cleared approval - the point at
 * which account management (settings, notifications, password) moves to
 * the coach dashboard and drops off the public site. */
function isApprovedCoach(user) {
  return user.role !== 'supporter' && !!user.athlete?.is_coach && user.athlete?.status === 'approved';
}

/** Quick-nav row shown at the top of /cont: profil public, setări cont,
 * panou antrenor (only for approved coaches). Icon-led, no description -
 * these are shortcuts, not explainers. */
function AccountShortcuts({ user }) {
  const { logout } = useAuth();
  const isSupporter = user.role === 'supporter';
  const isCoach = isApprovedCoach(user);

  const cards = [];
  if (!isSupporter) {
    cards.push({ key: 'public', to: '/cont/profil', icon: User, title: 'Profil public', internal: true });
  }
  if (isCoach) {
    cards.push({ key: 'coach', href: COACH_DASHBOARD_URL, icon: ExternalLink, title: 'Panou antrenor', internal: false });
  }
  cards.push(
    isCoach
      ? { key: 'settings', href: `${COACH_DASHBOARD_URL}/account`, icon: Settings, title: 'Setări cont', internal: false }
      : { key: 'settings', to: '/cont', icon: Settings, title: 'Setări cont', internal: true, active: true },
  );
  cards.push({ key: 'logout', icon: LogOut, title: 'Deconectare', action: logout });

  const colsClass = cards.length >= 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : cards.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2';

  return (
    <div className={`grid gap-4 ${colsClass}`}>
      {cards.map(({ key, to, href, icon: Icon, title, internal, active, action }) => {
        const content = (
          <Card className={`flex h-full flex-col items-center gap-3 p-6 text-center transition hover:border-primary ${active ? 'border-primary' : ''}`}>
            <Icon className="h-9 w-9 text-primary" />
            <span className="font-display font-semibold text-foreground">{title}</span>
          </Card>
        );
        if (action) {
          return (
            <button key={key} type="button" onClick={action} className="text-left">
              {content}
            </button>
          );
        }
        return internal ? (
          <Link key={key} to={to}>{content}</Link>
        ) : (
          <a key={key} href={href} target="_blank" rel="noopener noreferrer">{content}</a>
        );
      })}
    </div>
  );
}

/** "Cont" tab: account type + email + phone. Both reuse the generic
 * /auth/me/ PUT (email uniqueness is enforced by the User model). */
function AccountTab({ user, refetchUser }) {
  const isSupporter = user.role === 'supporter';
  // The account's own phone_number can still be blank for athletes who
  // onboarded before it started syncing from their profile automatically -
  // fall back to the athlete profile's number so the field isn't blank.
  const initialPhone = user.phone_number || user.athlete?.mobile_number || '';
  const [phoneNumber, setPhoneNumber] = useState(initialPhone);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const hasChanges = phoneNumber !== initialPhone;

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage(null);
    if (!hasChanges) return;
    setBusy(true);
    try {
      await authAPI.updateProfile({ phone_number: phoneNumber });
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
          <Input id="account-email" type="email" required disabled value={user.email || ''} />
          <p className="text-xs text-muted-foreground">Adresa de email nu poate fi schimbată din cont.</p>
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
        <Label htmlFor="account-current-password">Parolă curentă<Req /></Label>
        <Input
          id="account-current-password"
          type="password"
          required
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
        <Label htmlFor="account-new-password">Parolă nouă<Req /></Label>
        <Input
          id="account-new-password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <Label htmlFor="account-new-password-confirm">Confirmă parola nouă<Req /></Label>
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

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (!user) return null;

  // Account type (athlete/coach vs supporter) is chosen once, at
  // registration (see AccountPage's RegisterForm) - there's no separate
  // "what kind of account do you want" step here anymore. An athlete who
  // hasn't finished their profile yet goes straight to that form instead
  // of this account-settings page. Gate on `user.athlete` itself, not
  // `user.profile_completed` - that flag can drift out of sync (e.g. a
  // profile created directly rather than through the onboarding submit
  // flow), and AthleteOnboardingPage's own redirect-back-to-/cont already
  // gates on `user.athlete` too. Using different conditions here caused an
  // infinite redirect loop for any account where they disagreed.
  const needsAthleteProfile = user.role === 'athlete' && !user.athlete;
  if (needsAthleteProfile) return <Navigate to="/onboarding/sportiv" replace />;

  // Approved coaches manage everything (profile, notifications, password)
  // from the coach dashboard now - this page reduces to a plain shortcuts
  // launcher for them, with no breadcrumb/hero/tabs clutter.
  const isCoach = isApprovedCoach(user);

  return (
    <div className="flex flex-col">
      <Seo title="Setări" path="/cont" noindex />

      {!isCoach && <Breadcrumbs items={[{ label: 'Contul meu' }]} showCurrent />}

      {!isCoach && (
        <div className="site-full-bleed bg-[#e9ecef]">
          <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:py-16">
            <h1 className="text-fluid-h2 font-display font-bold text-[#00334d]">Contul meu</h1>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-6 pt-8">
        <AccountShortcuts user={user} />
        {!isCoach && <StatusStep user={user} refetchUser={refetchUser} />}
      </div>
    </div>
  );
}
