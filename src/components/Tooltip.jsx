import React from 'react';

export default function Tooltip({ tooltip }) {
  if (!tooltip?.content) return null;
  const styled = tooltip.styled !== false;
  const style = { left: tooltip.x + 12, top: tooltip.y + 14 };
  return (
    <div className={`tooltip ${styled ? 'styled glass creamy' : ''}`} style={style}>
      {tooltip.content}
    </div>
  );
}

/** Hover helpers: call with a setter from the workspace. */
export function hoverProps(setTooltip, content, opts = {}) {
  if (!content) return {};
  return {
    onMouseEnter: (e) => setTooltip({ content, x: e.clientX, y: e.clientY, ...opts }),
    onMouseMove: (e) => setTooltip({ content, x: e.clientX, y: e.clientY, ...opts }),
    onMouseLeave: () => setTooltip(null),
  };
}
