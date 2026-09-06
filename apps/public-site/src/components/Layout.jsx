import { useEffect, useRef, useState } from 'react';
import { Outlet, Link, NavLink } from 'react-router-dom';

// Full menu parity with the live vovinam.ro nav: Acasă / Noutăți / Evenimente
// / Federație (dropdown) / Competiție (dropdown), plus Video and Contact -
// two top-level items that don't exist on the live WP site but were kept
// here since they were explicit, already-built Etapa 1 deliverables (see
// PR #6 description for the full note on this decision).
const NAV_LINKS = [
  { to: '/', label: 'Acasă', end: true },
  { to: '/noutati', label: 'Noutăți' },
  { to: '/video', label: 'Video' },
  { to: '/competitii', label: 'Evenimente' },
  {
    label: 'Federație',
    children: [
      { to: '/despre', label: 'Despre' },
      { to: '/cluburi', label: 'Cluburi' },
      { to: '/staff', label: 'Staff' },
      { to: '/arbitri', label: 'Arbitri' },
    ],
  },
  {
    label: 'Competiție',
    children: [
      { to: '/regulament', label: 'Regulament' },
      { to: '/documente', label: 'Documente' },
    ],
  },
  { to: '/contact', label: 'Contact' },
];

function desktopLinkClassName({ isActive }) {
  return `site-nav-link inline-flex h-9 items-center px-3 ${isActive ? 'is-active' : ''}`;
}

function mobileLinkClassName({ isActive }) {
  return `site-mobile-link block px-6 py-3 text-xl ${isActive ? 'is-active' : ''}`;
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
        <div className="site-submenu absolute left-0 top-full z-50 flex min-w-[10rem] flex-col py-2">
          {item.children.map((child) => (
            <NavLink
              key={child.to}
              to={child.to}
              className="site-submenu-link px-4 py-2"
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
      <NavLink to={item.to} end={item.end} className={mobileLinkClassName} onClick={onNavigate}>
        {item.label}
      </NavLink>
    );
  }

  return (
    <div>
      <button
        type="button"
        className="site-mobile-link flex w-full items-center justify-between px-6 py-3 text-xl"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        {item.label}
        <span aria-hidden="true">{expanded ? '−' : '+'}</span>
      </button>
      {expanded && (
        <div className="flex flex-col">
          {item.children.map((child) => (
            <NavLink
              key={child.to}
              to={child.to}
              className="site-mobile-link px-10 py-2 text-base"
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
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 8);
    }
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
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
        className={`site-header sticky top-0 z-40 transition-shadow ${scrolled ? 'shadow-md' : 'shadow-none'}`}
      >
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-2">
          <Link to="/" className="flex items-center" onClick={() => setMobileOpen(false)}>
            <img
              src="/frvv-logo.png"
              alt="Federația Română de Vovinam Việt Võ Đạo"
              className="h-12 w-auto sm:h-16"
            />
          </Link>

          <nav className="hidden flex-1 items-center justify-end gap-1 md:flex" aria-label="Navigație principală">
            {NAV_LINKS.map((item) => (
              <DesktopNavItem key={item.label} item={item} />
            ))}
          </nav>

          <button
            type="button"
            className="site-nav-link inline-flex h-10 w-10 items-center justify-center md:hidden"
            aria-label="Deschide meniul"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(true)}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </header>

      {mobileOpen && (
        <div className="site-mobile-overlay fixed inset-0 z-50 flex flex-col overflow-y-auto md:hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <img src="/frvv-logo.png" alt="FRVV" className="h-10 w-auto" />
            <button
              type="button"
              className="site-mobile-link inline-flex h-10 w-10 items-center justify-center text-3xl"
              aria-label="Închide meniul"
              onClick={() => setMobileOpen(false)}
            >
              ×
            </button>
          </div>
          <nav className="flex flex-1 flex-col justify-center" aria-label="Navigație mobilă">
            {NAV_LINKS.map((item) => (
              <MobileNavItem key={item.label} item={item} onNavigate={() => setMobileOpen(false)} />
            ))}
          </nav>
        </div>
      )}

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>

      <footer className="site-footer">
        <div className="mx-auto w-full max-w-6xl px-4 py-8 text-sm">
          <p>© {new Date().getFullYear()} Federația Română de Vovinam Việt Võ Đạo. Toate drepturile rezervate.</p>
        </div>
      </footer>
    </div>
  );
}
