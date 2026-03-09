import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { fieldAPI } from '@shared/lib/api';

const PUBLIC_DISPLAY_PORT = 5177;

const DisplayPreviewContext = createContext(null);

export function useDisplayPreview() {
  return useContext(DisplayPreviewContext);
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
      {[...openPreviews].map((fId, idx) => {
        const field = fields.find(f => f.id === fId);
        const label = field?.name || `Teren ${fId}`;
        // Stack previews from bottom-right, offset upward
        const bottom = 16 + idx * 245;

        return (
          <div
            key={fId}
            className="fixed right-4 z-[9999] shadow-2xl border-2 border-gray-700 bg-black overflow-hidden rounded"
            style={{ bottom: `${bottom}px`, width: '400px', height: '225px' }}
          >
            <div className="absolute top-0 left-0 right-0 bg-gray-900/90 text-white text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 flex items-center justify-between z-10">
              <span>{label} — Preview</span>
              <button onClick={() => closePreview(fId)} className="text-gray-400 hover:text-white text-xs leading-none px-1">✕</button>
            </div>
            <iframe
              src={`http://localhost:${PUBLIC_DISPLAY_PORT}/display/${fId}`}
              className="border-0 pointer-events-none"
              title={`${label} Preview`}
              style={{ width: '1920px', height: '1080px', transform: 'scale(0.2083)', transformOrigin: 'top left' }}
            />
          </div>
        );
      })}
    </DisplayPreviewContext.Provider>
  );
}
