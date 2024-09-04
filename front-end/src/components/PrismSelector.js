import React, { useState, useRef, useEffect} from 'react';
import { IoPrismOutline } from "react-icons/io5";

const PrismSelector = ({ prisms, activePrisms, onAddPrism }) => {
  const [hoveredPrism, setHoveredPrism] = useState(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const selectorRef = useRef(null);

  const handleMouseEnter = (prismId, event) => {
    setHoveredPrism(prismId);
    setTooltipPosition({ x: event.clientX, y: event.clientY });
  };

  const handleMouseLeave = () => {
    setHoveredPrism(null);
  };

  const handleMouseMove = (event) => {
    setTooltipPosition({ x: event.clientX, y: event.clientY });
  };

  useEffect(() => {
    const selector = selectorRef.current;
    if (selector) {
      const handleWheel = (e) => {
        e.preventDefault();
        selector.scrollLeft += e.deltaY + e.deltaX;
      };
      selector.addEventListener('wheel', handleWheel, { passive: false });
      return () => selector.removeEventListener('wheel', handleWheel);
    }
  }, []);

  const displayPrisms = Object.values(prisms).filter(prism => 
    prism.editable || !activePrisms.includes(prism.type)
  )

  return (
    <div className="prism-selector" ref={selectorRef}>
      {displayPrisms.map((prism) => (
        <div 
          key={prism.id} 
          className="prism-item glass-pane"
          onMouseEnter={(e) => handleMouseEnter(prism.id, e)}
          onMouseLeave={handleMouseLeave}
          onMouseMove={handleMouseMove}
        >
          <IoPrismOutline className="prism-icon" />
          <div className="prism-info">
            <div className="title">{prism.type}</div>
          </div>
          <button onClick={() => onAddPrism(prism.type)}>Add Prism</button>
          {hoveredPrism === prism.id && (
            <div 
              className="prism-tooltip" 
              style={{ 
                left: `${tooltipPosition.x + 10}px`, 
                top: `${tooltipPosition.y + 10}px` 
              }}
            >
              {prism.description}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default PrismSelector;