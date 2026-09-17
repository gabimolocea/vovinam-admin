import { Outlet } from 'react-router-dom';
import { useAuth } from '@shared';
import Sidebar from './Sidebar';

/** Shown on every page while the account itself is still pending admin
 * approval - unlike a rejected/revision-required account (out of scope
 * here, those need the public-site onboarding flow instead), a pending
 * athlete or coach can already use this app fully (their own AthleteDetail
 * edit rights don't depend on status - see get_can_edit/_can_review on the
 * backend), so this is just a heads-up, not a block. A full-bleed solid
 * bar outside <main>'s own scroll area (not a boxed Alert inside the page
 * content), so it stays pinned at the very top above the sidebar too and
 * never scrolls out of view. */
function PendingApprovalBanner() {
  const { user } = useAuth();
  if (user?.athlete?.status !== 'pending') return null;
  return (
    <div role="alert" className="w-full shrink-0 bg-destructive px-4 py-3 text-center text-sm font-medium text-destructive-foreground">
      Contul tău este în așteptarea aprobării unui administrator. Poți completa între timp profilul tău (rezultate, grade, vize etc.) - datele trimise vor fi vizibile imediat ce contul este aprobat.
    </div>
  );
}

export default function Layout() {
  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <PendingApprovalBanner />
      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
