import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@shared';
import LoginForm from './LoginForm';
import { ChevronDown, LogOut } from 'lucide-react';

/** Header "Cont" dropdown - mirrors the pattern seen on most e-commerce
 * sites (Altex, etc.): a compact quick-login form in a popover when signed
 * out, or account/logout links when signed in. Closes on outside click,
 * Escape, or successful login/navigation. */
export default function AccountNavItem({ mobile = false, onNavigate }) {
  const { isAuthenticated, logout, user, isAdmin, isCoach } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const closeTimer = useRef(null);

  function handleEnter() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  }

  function handleLeave() {
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  }

  useEffect(() => {
    if (!open) return undefined;

    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    function handleEscape(e) {
      if (e.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  if (mobile) {
    if (isAuthenticated) {
      return (
        <>
          {user?.role !== 'supporter' && (
            <Link to="/cont/profil" className="site-mobile-row block px-4 py-4 text-base" onClick={onNavigate}>
              Vezi Profil
            </Link>
          )}
          {(isAdmin || isCoach) && (
            <Link to="/cont/aprobari" className="site-mobile-row block px-4 py-4 text-base" onClick={onNavigate}>
              Aprobări
            </Link>
          )}
          <Link to="/cont" className="site-mobile-row block px-4 py-4 text-base" onClick={onNavigate}>
            Setări
          </Link>
          <button
            type="button"
            className="site-mobile-row block w-full px-4 py-4 text-left text-base uppercase"
            onClick={() => {
              if (onNavigate) onNavigate();
              logout();
            }}
          >
            Deconectare
          </button>
        </>
      );
    }
    return (
      <div className="relative z-10 -mt-8 px-4">
        <Link
          to="/cont"
          className="text-fluid-button flex items-center justify-center gap-2 rounded-lg bg-[#da3b26] px-4 py-4 uppercase tracking-wide text-white transition hover:bg-[#da3b26]/90"
          onClick={onNavigate}
        >
          Contul meu
        </Link>
      </div>
    );
  }

  if (isAuthenticated) {
    return (
      <div className="relative" ref={containerRef} onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
        <button
          type="button"
          className="text-fluid-button ml-2 inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#da3b26] px-4 uppercase tracking-wide text-white transition hover:bg-[#da3b26]/90"
          aria-expanded={open}
          aria-haspopup="true"
          onClick={() => setOpen((v) => !v)}
        >
          {user?.athlete?.first_name || 'Contul meu'}
          <ChevronDown className="h-3 w-3" />
        </button>
        {open && (
          <div className="site-account-popover absolute right-0 top-full z-50 mt-2 flex min-w-[12rem] flex-col gap-1 p-2">
            {user?.role !== 'supporter' && (
              <Link to="/cont/profil" className="site-account-menu-link" onClick={() => setOpen(false)}>
                Vezi Profil
              </Link>
            )}
            {(isAdmin || isCoach) && (
              <Link to="/cont/aprobari" className="site-account-menu-link" onClick={() => setOpen(false)}>
                Aprobări
              </Link>
            )}
            <Link to="/cont" className="site-account-menu-link" onClick={() => setOpen(false)}>
              Setări
            </Link>
            <button
              type="button"
              className="site-account-menu-link flex items-center gap-1.5 text-left"
              onClick={() => {
                setOpen(false);
                logout();
              }}
            >
              <LogOut className="h-3.5 w-3.5" /> Deconectare
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative" ref={containerRef} onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      <button
        type="button"
        className="text-fluid-button ml-2 inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#da3b26] px-4 uppercase tracking-wide text-white transition hover:bg-[#da3b26]/90"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
      >
        Contul meu
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div className="site-account-popover absolute right-0 top-full z-50 mt-2 w-80 p-5">
          <LoginForm compact onSuccess={() => { setOpen(false); navigate('/cont'); }} />
          <p className="mt-3 text-center text-sm text-muted-foreground">
            Nu ai cont?{' '}
            <Link to="/cont?mode=register" className="font-medium underline" onClick={() => setOpen(false)}>
              Înregistrare
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
