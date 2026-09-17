import { Outlet } from 'react-router-dom';
import { useAuth } from '@shared';
import Sidebar from './Sidebar';
import { Alert } from './ui';

/** Shown on every page while the account itself is still pending admin
 * approval - unlike a rejected/revision-required account (out of scope
 * here, those need the public-site onboarding flow instead), a pending
 * athlete or coach can already use this app fully (their own AthleteDetail
 * edit rights don't depend on status - see get_can_edit/_can_review on the
 * backend), so this is just a heads-up, not a block. */
function PendingApprovalBanner() {
  const { user } = useAuth();
  if (user?.athlete?.status !== 'pending') return null;
  return (
    <Alert variant="destructive" className="mb-6">
      Contul tău este în așteptarea aprobării unui administrator. Poți completa între timp profilul tău (rezultate, grade, vize etc.) - datele trimise vor fi vizibile imediat ce contul este aprobat.
    </Alert>
  );
}

export default function Layout() {
  return (
    <div className="flex h-screen flex-col bg-background text-foreground lg:flex-row">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <PendingApprovalBanner />
          <Outlet />
        </div>
      </main>
    </div>
  );
}
