import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth, onboardingAPI } from '@shared';
import { Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle } from '../components/ui';
import Seo from '../components/Seo';

const STATUS_LABELS = {
  pending: { label: 'În așteptare', variant: 'secondary' },
  approved: { label: 'Aprobat', variant: 'default' },
  rejected: { label: 'Respins', variant: 'outline' },
  revision_required: { label: 'Necesită completări', variant: 'outline' },
};

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

function StatusStep({ user, athlete }) {
  const isSupporter = user.role === 'supporter';
  const status = athlete?.status ? STATUS_LABELS[athlete.status] : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h1">Contul tău</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <p><span className="font-medium">Email:</span> {user.email}</p>
        <p><span className="font-medium">Tip cont:</span> {isSupporter ? 'Susținător' : 'Sportiv / antrenor'}</p>
        {!isSupporter && (
          <p className="flex items-center gap-2">
            <span className="font-medium">Stare profil:</span>
            {status ? <Badge variant={status.variant}>{status.label}</Badge> : <span>–</span>}
          </p>
        )}
        {!isSupporter && athlete?.status === 'pending' && (
          <Alert>Profilul tău a fost trimis și așteaptă aprobarea unui administrator FRVV.</Alert>
        )}
        {!isSupporter && athlete?.status === 'revision_required' && (
          <Alert variant="destructive">
            {athlete.admin_notes || 'Un administrator a cerut completări la profilul tău. Te rugăm să-l actualizezi.'}
          </Alert>
        )}
        {isSupporter && <Alert variant="success">Contul tău este activ. Îți mulțumim pentru susținere!</Alert>}
      </CardContent>
    </Card>
  );
}

export default function OnboardingPage() {
  const { user, refetchUser, loading } = useAuth();
  const navigate = useNavigate();
  const [choosingRole, setChoosingRole] = useState(false);
  const [roleError, setRoleError] = useState('');

  if (loading || !user) return null;

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

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <Seo title="Contul meu" path="/cont" noindex />
      {roleError && <Alert variant="destructive">{roleError}</Alert>}
      {needsRoleChoice && <RoleStep onChoose={chooseRole} busy={choosingRole} />}
      {!needsRoleChoice && <StatusStep user={user} athlete={user.athlete} />}
    </div>
  );
}
