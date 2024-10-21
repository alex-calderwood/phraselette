import React, { useState, useRef, useEffect} from 'react';

export const Tooltip = ({ content, position }) => {
  if (!content) return null;

  return (
    <div
      className="tooltip glass"
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
      }}
    >
      {content}
    </div>
  );
};

export const useTooltip = (onTooltipUpdate) => {
  const [tooltipContent, setTooltipContent] = useState(null);

  const handleMouseEnter = (content, event) => {
    setTooltipContent(content);
    updateTooltip(content, event);
  };

  const handleMouseLeave = () => {
    setTooltipContent(null);
    onTooltipUpdate(null);
  };

  const handleMouseMove = (event) => {
    if (tooltipContent) {
      updateTooltip(tooltipContent, event);
    }
  };

  const updateTooltip = (content, event) => {
    onTooltipUpdate({
      content,
      position: { x: event.clientX + 4, y: event.clientY + 4 }
    });
  };

  return {
    handleMouseEnter,
    handleMouseLeave,
    handleMouseMove
  };
};