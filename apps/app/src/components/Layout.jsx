import { createContext, useContext, useEffect, useState } from 'react';
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

/** Most pages read comfortably in a centered, max-width, padded column.
 * A data-dense page (e.g. the admin Centralizator matrix) instead wants
 * the full viewport and its own internal scroll area, so it can opt out
 * via useFullBleedLayout() - Layout swaps the wrapper's classes for that
 * page only, and restores the boxed layout on unmount/navigation. */
const SetFullBleedContext = createContext(() => {});

/** `boundedBelowLg` lets a full-bleed page opt into either layout mode
 * per render, based on which of ITS OWN sub-views is active: `true` (the
 * default) keeps the classic height-locked chain (page header pinned, the
 * page's own content area scrolls internally - needed for anything wide
 * enough to also need its own horizontal scroll, since a sticky header
 * breaks once an ancestor's overflow-x turns it into a scroll container
 * that isn't the one actually scrolling vertically). `false` lets the
 * whole page scroll below `lg` instead (the page header scrolls away with
 * the rest), for content with no horizontal-scroll need, that wants its
 * own internal sticky headers to track the page scroll. */
export function useFullBleedLayout(enabled = true, boundedBelowLg = true) {
  const setFullBleedConfig = useContext(SetFullBleedContext);
  useEffect(() => {
    setFullBleedConfig(enabled ? { boundedBelowLg } : null);
    return () => setFullBleedConfig(null);
  }, [enabled, boundedBelowLg, setFullBleedConfig]);
}

export default function Layout() {
  const [fullBleedConfig, setFullBleedConfig] = useState(null);
  const fullBleed = !!fullBleedConfig;
  const boundedBelowLg = fullBleedConfig?.boundedBelowLg ?? true;

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <PendingApprovalBanner />
      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        <Sidebar hideDesktopSidebar={fullBleed} hideMobileBottomNav={fullBleed} />
        <main className={fullBleed ? `flex flex-1 flex-col ${boundedBelowLg ? 'overflow-hidden' : 'overflow-y-auto lg:overflow-hidden'}` : 'flex-1 overflow-y-auto'}>
          {/* A full-bleed page also hides Sidebar's mobile/tablet bottom
              tab bar (it has its own, e.g. Centralizator/Tehnica/Lupta,
              which handles its own safe-area clearance) - so below `lg`
              this needs no bottom padding of its own, unlike the boxed
              layout below. `lg:pb-3` is just desktop breathing room, kept
              regardless of sub-view. When the active sub-view isn't
              height-locked, the page scrolls as a whole below `lg` instead
              (no inner height lock), so its own header isn't pinned in
              place - each table/card keeps its own sticky header instead. */}
          <div className={fullBleed ? `flex flex-1 flex-col pt-2 lg:pb-3 ${boundedBelowLg ? 'min-h-0' : 'lg:min-h-0'}` : 'mx-auto w-full max-w-6xl px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:py-8'}>
            <SetFullBleedContext.Provider value={setFullBleedConfig}>
              <Outlet />
            </SetFullBleedContext.Provider>
          </div>
        </main>
      </div>
    </div>
  );
}
