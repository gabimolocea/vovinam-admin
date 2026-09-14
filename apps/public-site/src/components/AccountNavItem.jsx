import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@shared';
import { ChevronDown, LogOut, User } from 'lucide-react';

/** Header "Cont" nav item - a plain link to /cont when signed out, or an
 * account/logout dropdown when signed in. The dropdown closes on outside
 * click, Escape, or navigation. */
export default function AccountNavItem({ mobile = false, onNavigate }) {
  const { isAuthenticated, logout, user, isAdmin, isCoach } = useAuth();
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
    // Signed out: no row here - the mobile header's account icon already
    // links straight to /cont for login/register.
    return null;
  }

  if (isAuthenticated) {
    return (
      <div className="relative" ref={containerRef} onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
        <button
          type="button"
          className="site-utility-link inline-flex items-center gap-1"
          aria-expanded={open}
          aria-haspopup="true"
          onClick={() => setOpen((v) => !v)}
        >
          {user?.athlete?.first_name || 'Contul meu'}
          <ChevronDown className="h-3 w-3" />
        </button>
        {open && (
          <div className="site-submenu absolute right-0 top-full z-50 mt-2 flex min-w-[14rem] flex-col py-3">
            {user?.role !== 'supporter' && (
              <Link to="/cont/profil" className="site-submenu-link px-6 py-3.5" onClick={() => setOpen(false)}>
                Vezi Profil
              </Link>
            )}
            {(isAdmin || isCoach) && (
              <Link to="/cont/aprobari" className="site-submenu-link px-6 py-3.5" onClick={() => setOpen(false)}>
                Aprobări
              </Link>
            )}
            <Link to="/cont" className="site-submenu-link px-6 py-3.5" onClick={() => setOpen(false)}>
              Setări
            </Link>
            <button
              type="button"
              className="site-submenu-link flex items-center gap-1.5 px-6 py-3.5 text-left"
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
    <Link to="/cont" className="site-utility-link inline-flex items-center gap-1.5">
      <User className="h-3.5 w-3.5" fill="currentColor" />
      Contul meu
    </Link>
  );
}
