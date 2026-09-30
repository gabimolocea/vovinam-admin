import { useEffect, useRef } from 'react';

const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/**
 * Scurtături de tastatură pentru ecranul de la masa centrală.
 *
 * Acolo se lucrează contra cronometru, iar mouse-ul e cea mai lentă
 * unealtă din sală: până găsești butonul potrivit dintre douăzeci,
 * sportivul a terminat mișcarea. Legăturile se citesc dintr-un ref, ca
 * un obiect recreat la fiecare randare să nu reînregistreze ascultătorul
 * de fiecare dată.
 *
 * `bindings` e {tastă: funcție}. Tastele ajung la noi doar dacă nu scrie
 * nimeni într-un câmp și nu e apăsat un modificator - Ctrl+1 rămâne al
 * browserului.
 */
export default function useHotkeys(bindings, { enabled = true } = {}) {
  const ref = useRef(bindings);
  ref.current = bindings;

  useEffect(() => {
    if (!enabled) return undefined;

    const handler = (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || TYPING_TAGS.has(target.tagName))) return;

      const action = ref.current[event.key];
      if (typeof action !== 'function') return;
      event.preventDefault();
      action(event);
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled]);
}
