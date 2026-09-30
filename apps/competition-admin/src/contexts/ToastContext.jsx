import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

/**
 * Mesaje scurte în colț, în locul dialogurilor native.
 *
 * Aplicația anunța fiecare eroare cu `window.alert`, care oprește ecranul
 * până dă cineva click - exact ce nu vrei la masa centrală în timpul unei
 * probe. Aici mesajul apare lângă conținut, se poate ignora și pleacă
 * singur. Erorile stau mai mult decât confirmările, fiindcă de obicei ai
 * ceva de făcut cu ele.
 */
const ToastContext = createContext(null);

const DURATIONS = { error: 8000, success: 3500, info: 5000 };

const VARIANTS = {
  error: {
    icon: AlertTriangle,
    className: 'border-destructive/40 bg-destructive/10 text-foreground',
    iconClassName: 'text-destructive',
    live: 'assertive',
  },
  success: {
    icon: CheckCircle2,
    className: 'border-emerald-500/40 bg-emerald-50 text-foreground dark:bg-emerald-950/40',
    iconClassName: 'text-emerald-600',
    live: 'polite',
  },
  info: {
    icon: Info,
    className: 'border-border bg-card text-foreground',
    iconClassName: 'text-muted-foreground',
    live: 'polite',
  },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());
  const nextId = useRef(1);

  const dismiss = useCallback((id) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const show = useCallback((message, variant = 'info') => {
    const text = typeof message === 'string' ? message : String(message ?? '');
    if (!text.trim()) return null;
    const id = nextId.current++;
    // Cel mult patru deodată: peste asta acoperă ecranul, iar al cincilea
    // mesaj identic nu spune nimic în plus.
    setToasts(prev => [...prev.slice(-3), { id, text, variant }]);
    timers.current.set(id, setTimeout(() => dismiss(id), DURATIONS[variant] ?? DURATIONS.info));
    return id;
  }, [dismiss]);

  const value = useMemo(() => ({
    show,
    dismiss,
    error: (message) => show(message, 'error'),
    success: (message) => show(message, 'success'),
    info: (message) => show(message, 'info'),
  }), [show, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Deasupra barei de tab-uri, ca să nu acopere navigarea. */}
      <div className="pointer-events-none fixed bottom-16 right-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map(toast => {
          const variant = VARIANTS[toast.variant] || VARIANTS.info;
          const Icon = variant.icon;
          return (
            <div
              key={toast.id}
              role="status"
              aria-live={variant.live}
              className={`pointer-events-auto flex items-start gap-2 border-2 px-3 py-2 shadow-lg ${variant.className}`}
            >
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${variant.iconClassName}`} />
              <p className="min-w-0 flex-1 text-sm leading-snug">{toast.text}</p>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label="Închide mesajul"
                className="shrink-0 text-muted-foreground transition hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Întoarce mereu un obiect utilizabil. Fără provider (teste, un ecran
 * montat separat) mesajele ajung în consolă în loc să arunce - un mesaj
 * de eroare pierdut e mai bun decât un ecran alb.
 */
export function useToast() {
  const ctx = useContext(ToastContext);
  return useMemo(() => ctx || {
    show: (m) => console.warn('[toast]', m),
    dismiss: () => {},
    error: (m) => console.error('[toast]', m),
    success: (m) => console.info('[toast]', m),
    info: (m) => console.info('[toast]', m),
  }, [ctx]);
}
