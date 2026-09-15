import { useLayoutEffect, useState } from 'react';

/**
 * Fixed-position coordinates for a popover anchored under a button, kept
 * inside the viewport (shifted left when it would run off the right edge,
 * flipped above the button when there is no room below).
 */
export function usePopoverPosition(open, buttonRef, width = 440, height = 420) {
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    if (!open || !buttonRef.current) { setPos(null); return; }
    const place = () => {
      const r = buttonRef.current.getBoundingClientRect();
      const vw = window.innerWidth; const vh = window.innerHeight;
      const w = Math.min(width, vw - 16);
      const left = Math.max(8, Math.min(r.left, vw - w - 8));
      const below = r.bottom + 8 + Math.min(height, vh * 0.7) <= vh;
      setPos(below ? { left, top: r.bottom + 8, width: w } : { left, bottom: vh - r.top + 8, width: w });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open, buttonRef, width, height]);
  return pos;
}
