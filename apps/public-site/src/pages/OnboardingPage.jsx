import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@shared';
import { Alert, Button, Skeleton } from '../components/ui';
import { LogOut } from 'lucide-react';
import Seo from '../components/Seo';
import Breadcrumbs from '../components/Breadcrumbs';
import { ATHLETE_STATUS_LABELS } from '../lib/athletes';
import { withSsoHandoff } from '@shared/lib/sso';
import { isApprovedCoach, isApprovedAthlete, APP_URL, DASHBOARDS_DEPLOYED } from '../components/AccountNavItem';

/** Account management (profile, results/grades/etc, notifications,
 * password) has moved entirely to the coach/athlete dashboards - an
 * approved account landing on /cont (e.g. an old bookmark) is sent
 * straight there instead of seeing anything here. `Navigate` only handles
 * internal routes, so a full-page redirect is done by hand. */
function ExternalRedirect({ url }) {
  useEffect(() => {
    window.location.replace(url);
  }, [url]);
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4 py-10">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-24" />
    </div>
  );
}

const STATUS_MESSAGES = {
  pending: 'Contul tău este în așteptarea aprobării unui administrator. Vei primi acces la panoul tău imediat ce este aprobat.',
  rejected: 'Contul tău a fost respins. Contactează federația pentru mai multe detalii.',
  revision_required: 'Profilul tău are nevoie de completări înainte de a putea fi aprobat. Contactează federația pentru detalii.',
};

/** Shown instead of the account-settings UI for anyone without an approved
 * athlete profile (a supporter, or an athlete/coach still pending review) -
 * just the account's status and a way to log out. No shortcuts, no public
 * profile preview: that only exists once the profile is actually approved
 * and visible to others, at which point the account is redirected to its
 * dashboard above instead of landing here at all. */
function AccountStatusPage({ user }) {
  const { logout } = useAuth();
  const status = user.athlete?.status;
  const isApprovedWithoutDashboard = status === 'approved' && !DASHBOARDS_DEPLOYED;
  const label = isApprovedWithoutDashboard ? 'Aprobat' : status ? (ATHLETE_STATUS_LABELS[status] || status) : 'Activ';
  const message = isApprovedWithoutDashboard
    ? 'Contul tău a fost aprobat. Panoul tău este în pregătire și va fi disponibil în curând.'
    : (status && STATUS_MESSAGES[status])
    || 'Contul tău de susținător este activ.';

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-6 py-16 text-center">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status cont</p>
        <p className="font-display text-2xl font-bold text-[#00334d]">{label}</p>
      </div>
      <Alert>{message}</Alert>
      <Button type="button" variant="outline" onClick={logout} className="gap-2">
        <LogOut className="h-4 w-4" /> Deconectare
      </Button>
    </div>
  );
}

export default function OnboardingPage() {
  const { user, loading } = useAuth();

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

  // Account management (profile, results/grades/etc, notifications,
  // password) has moved entirely to the coach/athlete dashboards - an
  // approved account is sent straight there instead of landing on /cont.
  if (DASHBOARDS_DEPLOYED && (isApprovedCoach(user) || isApprovedAthlete(user))) return <ExternalRedirect url={withSsoHandoff(APP_URL)} />;

  // Everyone else (a supporter, or an athlete/coach whose profile isn't
  // approved yet) has nothing to manage here yet - just their account
  // status and a way to log out. No shortcuts, no settings tabs: those only
  // make sense once there's a dashboard to actually use them from.
  return (
    <div className="flex flex-col">
      <Seo title="Contul meu" path="/cont" noindex />
      <Breadcrumbs items={[{ label: 'Contul meu' }]} showCurrent />
      <AccountStatusPage user={user} />
    </div>
  );
}
