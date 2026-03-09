import React from 'react';

export default function EditLockButton({ locked, onToggle, disabled = false, compact = false, className = '' }) {
  const label = locked ? 'Lacăt activ' : 'Lacăt dezactivat';

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={`inline-flex items-center justify-center border font-semibold uppercase tracking-wide transition ${
        compact
          ? 'h-7 min-w-7 rounded-md px-2 text-sm leading-none'
          : 'rounded-lg px-3 py-1.5 text-[11px]'
      } ${
        locked
          ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
          : 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
      } disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      title={disabled ? `${label} · doar admin poate modifica` : (locked ? 'Deblochează modificările' : 'Blochează modificările')}
      aria-label={label}
    >
      {compact ? (locked ? '🔒' : '🔓') : label}
    </button>
  );
}
