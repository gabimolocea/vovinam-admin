import { useEffect, useRef, useState } from 'react';
import { Outlet, Link, NavLink } from 'react-router-dom';
import { ChevronRight, Menu, User, X } from 'lucide-react';
import AccountNavItem from './AccountNavItem';
import NotificationBell from './NotificationBell';

const SOCIAL_LINKS = [
  { href: '#', label: 'Facebook', icon: '/footer-facebook.png' },
  { href: '#', label: 'LinkedIn', icon: '/footer-linkedin.png' },
  { href: '#', label: 'YouTube', icon: '/footer-youtube.png' },
];

// Audience-facing pages the header surfaces separately from the main nav -
// mirrors the "Resources for..." utility row on usavolleyball.org, using
// only sections that actually exist on this site.
const RESOURCE_LINKS = [
  { to: '/staff', label: 'Antrenori' },
  { to: '/sportivi', label: 'Sportivi' },
  { to: '/arbitri', label: 'Arbitri' },
];

// Full menu parity with the live vovinam.ro nav: Acasă / Noutăți / Evenimente
// / Federație (dropdown) / Competiție (dropdown). "Video" is temporarily
// hidden from the header nav (route/page still exist, just unlinked).
const NAV_LINKS = [
  { to: '/', label: 'Acasă', end: true },
  { to: '/noutati', label: 'Noutăți' },
  { to: '/calendar', label: 'Calendar' },
  {
    label: 'Federație',
    children: [
      { to: '/despre', label: 'Despre' },
      { to: '/staff', label: 'Staff' },
      { to: '/arbitri', label: 'Arbitri' },
    ],
  },
  {
    label: 'Competiție',
    children: [
      { to: '/competitie', label: 'Prezentare' },
      { to: '/regulament', label: 'Regulament' },
      { to: '/documente', label: 'Documente' },
    ],
  },
  { to: '/cluburi', label: 'Cluburi' },
];

function desktopLinkClassName({ isActive }) {
  return `site-nav-link inline-flex h-9 items-center px-3 ${isActive ? 'is-active' : ''}`;
}

function mobileLinkClassName({ isActive }) {
  return `site-mobile-link block px-4 py-3 text-xl ${isActive ? 'is-active' : ''}`;
}

function DesktopNavItem({ item }) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef(null);

  if (!item.children) {
    return (
      <NavLink to={item.to} end={item.end} className={desktopLinkClassName}>
        {item.label}
      </NavLink>
    );
  }

  function handleEnter() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  }

  function handleLeave() {
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  }

  return (
    <div className="relative" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      <button
        type="button"
        className="site-nav-link inline-flex h-9 items-center gap-1 px-3"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
      >
        {item.label}
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M1.5 4L6 8l4.5-4" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
      {open && (
        <div className="site-submenu absolute left-0 top-full z-50 flex min-w-[18rem] flex-col py-3">
          {item.children.map((child) => (
            <NavLink
              key={child.to}
              to={child.to}
              className="site-submenu-link px-6 py-3.5"
              onClick={() => setOpen(false)}
            >
              {child.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

function MobileNavItem({ item, onNavigate }) {
  const [expanded, setExpanded] = useState(false);

  if (!item.children) {
    return (
      <NavLink
        to={item.to}
        end={item.end}
        className="site-mobile-row flex items-center justify-between px-4 py-4 text-[16px]"
        onClick={onNavigate}
      >
        {item.label}
      </NavLink>
    );
  }

  return (
    <div className="site-mobile-row">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-4 text-[16px] uppercase text-white"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        {item.label}
        <ChevronRight className={`h-5 w-5 shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} aria-hidden="true" />
      </button>
      {expanded && (
        <div className="flex flex-col pb-2">
          {item.children.map((child) => (
            <NavLink
              key={child.to}
              to={child.to}
              className="site-mobile-link px-8 py-2 text-base"
              onClick={onNavigate}
            >
              {child.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const headerRef = useRef(null);

  // Publishes the header's real rendered height as a CSS var so the
  // mobile drawer can start exactly below it (`top: var(--mobile-header-h)`)
  // instead of covering it - the header stays visible while the drawer
  // is open, same technique as the --scrollbar-w var below.
  useEffect(() => {
    function updateHeaderHeight() {
      if (headerRef.current) {
        document.documentElement.style.setProperty('--mobile-header-h', `${headerRef.current.offsetHeight}px`);
      }
    }
    updateHeaderHeight();
    window.addEventListener('resize', updateHeaderHeight);
    return () => window.removeEventListener('resize', updateHeaderHeight);
  }, []);

  // Full-bleed sections break out of `main` using 100vw, but `100vw`
  // includes the scrollbar while the page's own (scrollbar-free) width
  // doesn't - that ~15px gap is what makes them a few px wider/offset
  // vs naturally full-width elements like <footer>. Publish the real
  // scrollbar width as a CSS var so those sections can subtract it back
  // out (see `.site-full-bleed` in styles.css).
  useEffect(() => {
    function updateScrollbarWidth() {
      const width = window.innerWidth - document.documentElement.clientWidth;
      document.documentElement.style.setProperty('--scrollbar-w', `${width}px`);
    }
    updateScrollbarWidth();
    window.addEventListener('resize', updateScrollbarWidth);
    return () => window.removeEventListener('resize', updateScrollbarWidth);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  return (
    <div className="public-site-app flex min-h-screen flex-col">
      <header
        ref={headerRef}
        className="site-header sticky top-0 z-40"
      >
        <div className="site-header-utility hidden lg:block">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-1.5">
            <div className="flex items-center gap-4">
              <span className="site-utility-label">Resurse pentru:</span>
              {RESOURCE_LINKS.map((link) => (
                <Link key={link.to} to={link.to} className="site-utility-link">{link.label}</Link>
              ))}
            </div>
            <AccountNavItem />
          </div>
        </div>

        {/* Mobile/tablet closed-state bar: hamburger left, centered logo.
            The right-hand spacer keeps the logo visually centered against
            the hamburger's width. */}
        <div className="flex w-full items-center justify-between gap-3 px-4 py-2 lg:hidden">
          <button
            type="button"
            className={`-ml-4 -my-2 flex w-14 shrink-0 self-stretch items-center justify-center ${
              mobileOpen ? 'site-mobile-toggle' : 'text-foreground'
            }`}
            aria-label={mobileOpen ? 'Închide meniul' : 'Deschide meniul'}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? <X className="h-6 w-6" aria-hidden="true" /> : <Menu className="h-6 w-6" aria-hidden="true" />}
          </button>
          <Link to="/" className="flex min-w-0 flex-1 items-center justify-center gap-2" onClick={() => setMobileOpen(false)}>
            <div className="relative h-10 w-10 shrink-0">
              <img src="/footer-crest-outer.svg" alt="" className="absolute inset-0 h-full w-full" />
              <img
                src="/footer-crest-inner.svg"
                alt=""
                className="absolute left-1/2 top-1/2 h-[90%] w-[83%] -translate-x-1/2 -translate-y-1/2"
              />
            </div>
            <span className="font-display text-xs font-bold uppercase leading-tight text-foreground">
              Federația Română
              <br />
              de Vovinam Viet-Vo-Dao
            </span>
          </Link>
          <div className="flex shrink-0 items-center justify-center gap-3">
            <NotificationBell />
            <Link
              to="/cont"
              aria-label="Contul meu"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e9ecef] text-foreground"
            >
              <User className="h-5 w-5" aria-hidden="true" />
            </Link>
          </div>
        </div>

        <div className="mx-auto hidden w-full max-w-7xl items-center justify-between gap-3 px-4 py-2 lg:flex">
          <Link to="/" className="flex items-center gap-3">
            <div className="relative h-[clamp(3rem,2.17rem+3.53vw,5rem)] w-[clamp(3rem,2.17rem+3.53vw,5rem)] shrink-0">
              <img src="/footer-crest-outer.svg" alt="" className="absolute inset-0 h-full w-full" />
              <img
                src="/footer-crest-inner.svg"
                alt=""
                className="absolute left-1/2 top-1/2 h-[90%] w-[83%] -translate-x-1/2 -translate-y-1/2"
              />
            </div>
            <span className="text-fluid-logo font-display font-bold uppercase leading-tight text-foreground">
              Federația Română
              <br />
              de Vovinam Viet-Vo-Dao
            </span>
          </Link>

          <nav className="flex flex-1 items-center justify-end gap-1" aria-label="Navigație principală">
            {NAV_LINKS.map((item) => (
              <DesktopNavItem key={item.label} item={item} />
            ))}
            <NotificationBell />
          </nav>
        </div>
      </header>

      {/* Slide-in drawer: starts right below the header (which stays
          visible/fixed above it, see --mobile-header-h) and slides in
          from the left. Always mounted so the transform transition can
          animate; aria-hidden keeps it out of the a11y tree while closed. */}
      <div
        className={`site-mobile-overlay fixed inset-x-0 bottom-0 z-50 flex flex-col overflow-y-auto transition-transform duration-300 ease-out lg:hidden ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ top: 'var(--mobile-header-h, 0px)' }}
        aria-hidden={!mobileOpen}
      >
        <nav className="site-mobile-nav flex flex-col bg-[#0c223d] p-0 m-0" aria-label="Navigație mobilă">
          {NAV_LINKS.map((item) => (
            <MobileNavItem key={item.label} item={item} onNavigate={() => setMobileOpen(false)} />
          ))}
        </nav>

        <div className="site-mobile-secondary flex flex-col">
          <AccountNavItem mobile onNavigate={() => setMobileOpen(false)} />

          <p className="site-mobile-section-label px-4 pt-6">Resurse pentru</p>
          {RESOURCE_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="site-mobile-row px-4 py-4 text-base"
              onClick={() => setMobileOpen(false)}
            >
              {link.label}
            </Link>
          ))}

          <p className="site-mobile-section-label px-4 pb-2 pt-6">Urmărește FRVV</p>
          <div className="flex gap-4 px-4 pb-8">
            {SOCIAL_LINKS.map((social) => (
              <a key={social.label} href={social.href} aria-label={social.label} className="shrink-0">
                <img src={social.icon} alt="" className="h-9 w-9 rounded-full" />
              </a>
            ))}
          </div>
        </div>
      </div>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-8">
        <Outlet />
      </main>

      <footer className="site-footer relative isolate mt-16">
        {/* mt-16 guarantees clearance for the crest badge below, which
            pokes up 64px (half its own height) above the footer's top
            border on every page - without this, pages whose last section
            has little/no bottom padding (e.g. a full-bleed content grid)
            would have the badge overlap real content instead of blank
            space. */}
        {/* Crest badge straddles the gold top border: half over the section
            above, half over the navy footer (matches Figma node 233:722). */}
        <div className="absolute left-1/2 top-0 z-10 h-24 w-24 -translate-x-1/2 -translate-y-1/2">
          <img src="/footer-crest-outer.svg" alt="" className="absolute inset-0 h-full w-full" />
          <img
            src="/footer-crest-inner.svg"
            alt="Emblema Federației Române de Vovinam Việt Võ Đạo"
            className="absolute left-1/2 top-1/2 h-[90%] w-[83%] -translate-x-1/2 -translate-y-1/2"
          />
        </div>

        <div className="pt-10 lg:pt-6">
          <div className="site-footer-divider mx-auto flex w-full max-w-7xl flex-col gap-10 px-4 py-8 lg:flex-row lg:items-start lg:justify-between">
            <p className="max-w-lg text-sm leading-[1.3] text-white lg:max-w-md">
              Folosirea fără acordul Federației Române de Vovinam Viet-Vo-Dao a denumirii integrale sau parțiale
              „Vovinam”, „Viet-Vo-Dao” pe teritoriul României, atrage consecințele legale asupra autorilor.
              Federația Română de Vovinam Viet-Vo-Dao este membră a Federației Europene de Vovinam
              Viet-Vo-Dao(EVVF) și a Federației Mondiale de Vovinam Viet-Vo-Dao(WVVF), fiind unica entitate
              recunoscută de către Ministerul Sportului pentru a reprezenta România la toate evenimentele
              oficiale internaționale.{' '}
              <a
                href="/certificat-inregistrare-marca.jpg"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-secondary"
              >
                Certificat de înregistrare a mărcii.
              </a>
            </p>

            <div className="flex flex-wrap gap-10 lg:flex-nowrap">
              <div className="shrink-0">
                <h3 className="site-footer-heading whitespace-nowrap">Urmărește-ne:</h3>
                <div className="mt-4 flex gap-4">
                  {SOCIAL_LINKS.map((social) => (
                    <a key={social.label} href={social.href} aria-label={social.label} className="shrink-0">
                      <img src={social.icon} alt="" className="h-8 w-8" />
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <p className="px-4 py-5 text-center text-sm text-white">
            © {new Date().getFullYear()} Federația Română de Vovinam Viet-Vo-Dao. Toate drepturile rezervate.
          </p>
        </div>
      </footer>
    </div>
  );
}
