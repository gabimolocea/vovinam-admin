import { useEffect, useState } from 'react';
import { Outlet, Link, NavLink } from 'react-router-dom';

const NAV_LINKS = [
  { to: '/', label: 'Acasă', end: true },
  { to: '/noutati', label: 'Noutăți' },
  { to: '/video', label: 'Video' },
  { to: '/competitii', label: 'Evenimente' },
  { to: '/despre', label: 'Despre' },
  { to: '/contact', label: 'Contact' },
];

function desktopLinkClassName({ isActive }) {
  return `site-nav-link inline-flex h-9 items-center px-3 ${isActive ? 'is-active' : ''}`;
}

function mobileLinkClassName({ isActive }) {
  return `site-mobile-link block px-6 py-4 text-2xl ${isActive ? 'is-active' : ''}`;
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
            {NAV_LINKS.map((link) => (
              <NavLink key={link.to} to={link.to} end={link.end} className={desktopLinkClassName}>
                {link.label}
              </NavLink>
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
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={mobileLinkClassName}
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </NavLink>
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
