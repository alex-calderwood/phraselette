import React, { useState, useRef, useEffect} from 'react';

export const Tooltip = ({ content, position, options }) => {
  if (!content) return null;
  const doStyle = options == null || options.styled == null || options.styled == true;
  const className = doStyle ? ' styled glass' : '';

  const topLeft = options == null || options.topLeft == null || options.topLeft == true;

  const style = topLeft ? {
    position: 'fixed',
    left: position.x,
    top: position.y,
  } : {
    position: 'fixed',
    left: position.x,
    top: position.y,
    transform: 'translate(-50%, -100%)',
    marginTop: -10, // Add gap above cursor
  }

  return (
    <div
    className={"tooltip" + className}
      style={style}
    >
      {content}
    </div>
  );
};

export const useTooltip = (onTooltipUpdate) => {
  const [tooltipContent, setTooltipContent] = useState(null);

  const handleMouseEnter = (content, event, options={}) => {
    setTooltipContent(content);
    updateTooltip(content, event, options);
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

  const updateTooltip = (content, event, options={}) => {
    onTooltipUpdate({
      content,
      position: { x: event.clientX + 4, y: event.clientY + 4 },
      options,
    });
  };

  return {
    handleMouseEnter,
    handleMouseLeave,
    handleMouseMove
  };
};