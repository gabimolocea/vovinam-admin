import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';

const tabs = [
  { to: 'tehnica', label: 'TEHNICA' },
  { to: 'lupta', label: 'LUPTA' },
  { to: 'cluburi', label: 'CLUBURI' },
];

export default function ClasamentLayout() {
  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-white">
      <div className="shrink-0 border-b border-gray-200 bg-gray-50 px-3 pt-3">
        <div className="flex items-center gap-2 overflow-x-auto">
          {tabs.map(tab => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                `inline-flex items-center rounded-t-lg border border-b-0 px-4 py-2 text-xs font-semibold uppercase tracking-wide whitespace-nowrap transition ${
                  isActive
                    ? 'bg-white text-gray-900 border-gray-300'
                    : 'bg-gray-100 text-gray-500 border-transparent hover:bg-gray-200 hover:text-gray-700'
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