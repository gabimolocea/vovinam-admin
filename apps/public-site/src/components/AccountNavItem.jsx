import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@shared';
import LoginForm from './LoginForm';
import { ChevronDown, LogOut, User } from 'lucide-react';

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
            <Link to="/cont/profil" className="site-mobile-link block px-6 py-3 text-xl" onClick={onNavigate}>
              Vezi Profil
            </Link>
          )}
          {(isAdmin || isCoach) && (
            <Link to="/cont/aprobari" className="site-mobile-link block px-6 py-3 text-xl" onClick={onNavigate}>
              Aprobări
            </Link>
          )}
          <Link to="/cont" className="site-mobile-link block px-6 py-3 text-xl" onClick={onNavigate}>
            Setări
          </Link>
          <button
            type="button"
            className="site-mobile-link block w-full px-6 py-3 text-left text-xl"
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
      <Link to="/cont" className="site-mobile-link block px-6 py-3 text-xl" onClick={onNavigate}>
        Cont
      </Link>
    );
  }

  if (isAuthenticated) {
    return (
      <div className="relative" ref={containerRef} onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
        <button
          type="button"
          className="site-nav-link inline-flex h-9 items-center gap-1.5 px-3"
          aria-expanded={open}
          aria-haspopup="true"
          onClick={() => setOpen((v) => !v)}
        >
          <User className="h-4 w-4" />
          {user?.athlete?.first_name || 'Contul meu'}
          <ChevronDown className="h-3 w-3" />
        </button>
        {open && (
          <div className="site-submenu absolute right-0 top-full z-50 flex min-w-[10rem] flex-col py-2">
            {user?.role !== 'supporter' && (
              <Link to="/cont/profil" className="site-submenu-link px-4 py-2" onClick={() => setOpen(false)}>
                Vezi Profil
              </Link>
            )}
            {(isAdmin || isCoach) && (
              <Link to="/cont/aprobari" className="site-submenu-link px-4 py-2" onClick={() => setOpen(false)}>
                Aprobări
              </Link>
            )}
            <Link to="/cont" className="site-submenu-link px-4 py-2" onClick={() => setOpen(false)}>
              Setări
            </Link>
            <button
              type="button"
              className="site-submenu-link flex items-center gap-1.5 px-4 py-2 text-left"
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
        className="site-nav-link inline-flex h-9 items-center gap-1.5 px-3"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
      >
        <User className="h-4 w-4" />
        Cont
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
