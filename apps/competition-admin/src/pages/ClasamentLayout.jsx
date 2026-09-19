import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';

const tabs = [
  { to: 'tehnica', label: 'TEHNICA' },
  { to: 'lupta', label: 'LUPTA' },
  { to: 'cluburi', label: 'CLUBURI' },
  { to: 'sportivi-inscrisi', label: 'SPORTIVI ÎNSCRIȘI' },
];

export default function ClasamentLayout() {
  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-background">
      <div className="shrink-0 border-b border-border bg-muted px-3 pt-3">
        <div className="flex items-center gap-2 overflow-x-auto">
          {tabs.map(tab => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                `inline-flex items-center rounded-t-lg border border-b-0 px-4 py-2 text-xs font-semibold uppercase tracking-wide whitespace-nowrap transition ${
                  isActive
                    ? 'bg-background text-foreground border-border'
                    : 'bg-muted text-muted-foreground border-transparent hover:bg-accent hover:text-foreground'
                }`
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </div>
      </div>
      <Outlet />
    </div>
  );
}