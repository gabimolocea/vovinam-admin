import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { fieldAPI } from '@shared/lib/api';

const PUBLIC_DISPLAY_PORT = 5177;

// Same-host, different-port - not hardcoded to localhost, since this admin
// app and public-display may be opened from different devices on the venue
// LAN (e.g. admin laptop vs. the machine driving the scoreboard TV).
function publicDisplayOrigin() {
  const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  const protocol = typeof window !== 'undefined' ? window.location.protocol : 'http:';
  return `${protocol}//${host}:${PUBLIC_DISPLAY_PORT}`;
}

const DisplayPreviewContext = createContext(null);

// If the public-display dev server isn't up yet the moment a preview opens
// (a very common ordering - the admin app tends to start first), the
// iframe's connection is refused and it never retries on its own, leaving
// the panel permanently black even once the server comes online. An
// iframe's own `onLoad` can't tell us whether that happened - Chrome (and
// others) fire `load` for the internal "can't be reached" error page too,
// so a refused connection looks identical to a real success from here.
// Instead, poll the target with a no-cors fetch (resolves the instant
// *anything* answers on that port, rejects only on an actual connection
// failure) and don't mount the iframe until one succeeds.
function PreviewIframe({ src, title }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer;
    setReady(false);

    const check = () => {
      fetch(src, { mode: 'no-cors', cache: 'no-store' })
        .then(() => { if (!cancelled) setReady(true); })
        .catch(() => { if (!cancelled) timer = setTimeout(check, 3000); });
    };
    check();

    return () => { cancelled = true; clearTimeout(timer); };
  }, [src]);

  if (!ready) {
    return (
      <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold uppercase tracking-wide text-gray-400">
        Se conectează…
      </div>
    );
  }

  return (
    <iframe
      src={src}
      className="border-0 pointer-events-none"
      title={title}
      style={{ width: '1920px', height: '1080px', transform: 'scale(0.2083)', transformOrigin: 'top left' }}
    />
  );
}

export function useDisplayPreview() {
  return useContext(DisplayPreviewContext);
}

const PREVIEW_W = 400;
const PREVIEW_H = 225;

/**
 * O fereastră de preview, mutabilă cu mouse-ul de bara de titlu.
 *
 * Preview-ul stătea fix în dreapta jos, exact peste coloana de acțiuni a
 * ultimilor sportivi din tabel - iar operatorul nu avea cum să-l dea la o
 * parte fără să-l închidă. Se trage de bara de sus; poziția e ținută per
 * teren, așa că rămâne unde ai pus-o cât ține pagina.
 */
function FloatingPreview({ fieldId, label, index, onClose }) {
  // Poziția implicită: stivuite din dreapta jos, ca până acum.
  const [pos, setPos] = useState(null);
  const dragRef = useRef(null);

  const startDrag = (event) => {
    // Doar butonul principal, și nu de pe ✕.
    if (event.button !== 0 || event.target.closest('button')) return;
    event.preventDefault();

    const rect = event.currentTarget.parentElement.getBoundingClientRect();
    dragRef.current = { dx: event.clientX - rect.left, dy: event.clientY - rect.top };

    const onMove = (moveEvent) => {
      if (!dragRef.current) return;
      // Ținem fereastra în ecran: altfel se poate trage sub marginea de
      // jos și nu mai ai de ce s-o apuci înapoi.
      const maxLeft = window.innerWidth - PREVIEW_W;
      const maxTop = window.innerHeight - PREVIEW_H;
      setPos({
        left: Math.min(Math.max(0, moveEvent.clientX - dragRef.current.dx), Math.max(0, maxLeft)),
        top: Math.min(Math.max(0, moveEvent.clientY - dragRef.current.dy), Math.max(0, maxTop)),
      });
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const placement = pos
    ? { left: `${pos.left}px`, top: `${pos.top}px` }
    : { right: '16px', bottom: `${16 + index * (PREVIEW_H + 20)}px` };

  return (
    <div
      className="fixed z-[9999] shadow-2xl border-2 border-gray-700 bg-black overflow-hidden rounded"
      style={{ ...placement, width: `${PREVIEW_W}px`, height: `${PREVIEW_H}px` }}
    >
      <div
        onMouseDown={startDrag}
        title="Trage ca să muți preview-ul"
        className="absolute top-0 left-0 right-0 bg-gray-900/90 text-white text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 flex items-center justify-between z-10 cursor-move select-none"
      >
        <span>{label} — Preview</span>
        <button onClick={onClose} className="cursor-pointer text-gray-400 hover:text-white text-xs leading-none px-1">✕</button>
      </div>
      <PreviewIframe src={`${publicDisplayOrigin()}/display/${fieldId}`} title={`${label} Preview`} />
    </div>
  );
}

/**
 * Global provider for floating public-display previews.
 * Tracks which field previews are open; renders iframes fixed on screen.
 * Can be toggled from any page (CategoriesLayout nav, LiveFullscreenPage, etc.).
 */
export function DisplayPreviewProvider({ children }) {
  const [fields, setFields] = useState([]);
  const [openPreviews, setOpenPreviews] = useState(new Set()); // Set of fieldId numbers
  const [currentEventId, setCurrentEventId] = useState(null);

  // Load fields when event changes
  const loadFields = useCallback(async (eventId) => {
    if (!eventId) { setFields([]); return; }
    if (eventId === currentEventId && fields.length > 0) return;
    try {
      const res = await fieldAPI.list({ event_id: eventId });
      const list = res.data?.results || res.data || [];
      setFields(list);
      setCurrentEventId(eventId);
    } catch (err) {
      console.error('DisplayPreview: failed to load fields', err);
    }
  }, [currentEventId, fields.length]);

  const togglePreview = useCallback((fieldId) => {
    setOpenPreviews(prev => {
      const next = new Set(prev);
      if (next.has(fieldId)) next.delete(fieldId);
      else next.add(fieldId);
      return next;
    });
  }, []);

  const closePreview = useCallback((fieldId) => {
    setOpenPreviews(prev => {
      const next = new Set(prev);
      next.delete(fieldId);
      return next;
    });
  }, []);

  const isOpen = useCallback((fieldId) => openPreviews.has(fieldId), [openPreviews]);

  const value = { fields, loadFields, openPreviews, togglePreview, closePreview, isOpen };

  return (
    <DisplayPreviewContext.Provider value={value}>
      {children}

      {/* ── Floating preview iframes ── */}
      {[...openPreviews].map((fId, idx) => (
        <FloatingPreview
          key={fId}
          fieldId={fId}
          label={fields.find(f => f.id === fId)?.name || `Teren ${fId}`}
          index={idx}
          onClose={() => closePreview(fId)}
        />
      ))}
    </DisplayPreviewContext.Provider>
  );
}
