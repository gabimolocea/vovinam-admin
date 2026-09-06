import { Outlet, Link, NavLink } from 'react-router-dom';

const NAV_LINKS = [
  { to: '/', label: 'Acasă', end: true },
  { to: '/noutati', label: 'Noutăți' },
  { to: '/video', label: 'Video' },
  { to: '/competitii', label: 'Competiții' },
  { to: '/despre', label: 'Despre noi' },
  { to: '/contact', label: 'Contact' },
];

function navLinkClassName({ isActive }) {
  return `inline-flex h-9 items-center rounded-md px-3 text-sm font-medium transition-colors ${
    isActive ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
  }`;
}

export default function Layout() {
  return (
    <div className="public-site-app flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="font-display text-lg font-semibold text-foreground">
            Federația Română de Vovinam Việt Võ Đạo
          </Link>
          <nav className="flex flex-wrap items-center gap-1" aria-label="Navigație principală">
            {NAV_LINKS.map((link) => (
              <NavLink key={link.to} to={link.to} end={link.end} className={navLinkClassName}>
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>

      <footer className="border-t bg-background/60">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} Federația Română de Vovinam Việt Võ Đạo. Toate drepturile rezervate.</p>
        </div>
      </footer>
    </div>
  );
}
