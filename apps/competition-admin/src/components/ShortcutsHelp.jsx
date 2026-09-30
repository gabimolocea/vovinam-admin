import { Keyboard } from 'lucide-react';

/**
 * Lista scurtăturilor, deschisă cu „?”. Fără ea, tastele sunt o funcție
 * secretă: nimeni nu apasă o tastă despre care nu știe.
 */
const KEY_CLASS = 'inline-flex min-w-[1.75rem] items-center justify-center rounded border border-white/30 bg-white/10 px-1.5 py-0.5 font-mono text-xs font-bold';

function Row({ keys, label }) {
  return (
    <div className="flex items-center justify-between gap-6 py-1.5">
      <span className="flex items-center gap-1">
        {keys.map(k => <kbd key={k} className={KEY_CLASS}>{k}</kbd>)}
      </span>
      <span className="text-right text-sm text-white/80">{label}</span>
    </div>
  );
}

export const MATCH_SHORTCUTS = [
  { keys: ['Space'], label: 'Pornește repriza / pauză' },
  { keys: ['1'], label: 'Roșu +1' },
  { keys: ['2'], label: 'Roșu +2' },
  { keys: ['3'], label: 'Albastru +1' },
  { keys: ['4'], label: 'Albastru +2' },
  { keys: ['q'], label: 'Roșu — abatere' },
  { keys: ['w'], label: 'Roșu — avertisment' },
  { keys: ['o'], label: 'Albastru — abatere' },
  { keys: ['p'], label: 'Albastru — avertisment' },
  { keys: ['u'], label: 'Anulează ultima acțiune' },
  { keys: ['?'], label: 'Această listă' },
];

export const CATEGORY_SHORTCUTS = [
  // Ecranul evidentiaza deja butonul urmator (inelul care pulseaza);
  // spatiul apasa exact pe ala, ca sa nu existe doua pareri despre ce
  // urmeaza.
  { keys: ['Space'], label: 'Apasă butonul evidențiat: prezintă următorul sportiv sau oprește-l pe cel activ' },
  { keys: ['?'], label: 'Această listă' },
];

/**
 * Indiciul din colț. Fără el nimeni n-ar apăsa „?”, iar tastele ar rămâne
 * o funcție pe care o știe doar cine a scris-o.
 */
export function ShortcutsHint({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Scurtături de tastatură"
      className="fixed bottom-3 left-3 z-40 flex items-center gap-1.5 rounded border border-border/60 bg-card/80 px-2 py-1 text-[11px] font-semibold text-muted-foreground shadow-sm backdrop-blur transition hover:text-foreground"
    >
      <Keyboard className="h-3.5 w-3.5" />
      Scurtături
      <kbd className="rounded border border-border px-1 font-mono">?</kbd>
    </button>
  );
}

export default function ShortcutsHelp({ shortcuts, onClose }) {
  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md border-2 border-white/20 bg-neutral-900 p-5 text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center gap-2 border-b border-white/15 pb-2">
          <Keyboard className="h-5 w-5" />
          <h2 className="font-display text-base font-bold uppercase tracking-wide">Scurtături</h2>
        </div>
        <div className="divide-y divide-white/10">
          {shortcuts.map(s => <Row key={s.label} keys={s.keys} label={s.label} />)}
        </div>
        <p className="mt-3 border-t border-white/15 pt-2 text-xs text-white/50">
          Tastele nu funcționează cât timp scrii într-un câmp. Închide cu <kbd className={KEY_CLASS}>Esc</kbd>.
        </p>
      </div>
    </div>
  );
}
