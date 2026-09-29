import { useRef } from 'react';

/**
 * Derulare cu degetul, pentru galerii pe telefon.
 *
 * Pragurile există ca să deosebească o intenție de o atingere: 50px pe
 * orizontală înseamnă că omul chiar a tras, iar condiția ca mișcarea
 * orizontală s-o depășească pe cea verticală împiedică schimbarea pozei
 * când de fapt încerca să deruleze pagina în jos.
 */
const MIN_DISTANCE = 50;

export function useSwipe({ onLeft, onRight }) {
  const start = useRef(null);

  return {
    onTouchStart: (event) => {
      const touch = event.touches[0];
      start.current = { x: touch.clientX, y: touch.clientY };
    },
    onTouchEnd: (event) => {
      if (!start.current) return;
      const touch = event.changedTouches[0];
      const dx = touch.clientX - start.current.x;
      const dy = touch.clientY - start.current.y;
      start.current = null;

      if (Math.abs(dx) < MIN_DISTANCE || Math.abs(dx) <= Math.abs(dy)) return;
      if (dx < 0) onLeft?.();
      else onRight?.();
    },
  };
}
