import React, { useState, useRef, useEffect} from 'react';
import { IoPrismOutline } from "react-icons/io5";
import { Prism } from "../base/prism/Prism"
import { deduplicateByKey } from '../scripts/utils'

export const PrismSelector = ({ prisms, activePrisms, onAddPrism, onTooltipUpdate }) => {
  const handleMouseEnter = (prism, event) => {
    onTooltipUpdate({
      content: prism.description,
      position: { x: event.clientX, y: event.clientY }
    });
  };

  const handleMouseLeave = (prism, event) => {
    onTooltipUpdate(null);
  };

  const handleMouseMove = (prism, event) => {
    onTooltipUpdate({
      content: prism.description,
      position: { x: event.clientX + 4, y: event.clientY + 4}
    });
  };

  const displayPrisms = deduplicateByKey(
    Object.values(prisms).filter(prism => 
      (prism.duplicatable || !activePrisms.map(p => p.type).includes(prism.type))
      && !Prism.isWordType(prism.type)
    ),
    'type'
  );


  return (
    <div className="prism-selector">
      {displayPrisms.map((prism) => (
        <div
          key={prism.id}
          className="prism-item glass-pane"
          onMouseEnter={(e) => handleMouseEnter(prism, e)}
          onMouseLeave={(e) => handleMouseLeave(prism, e)}
          onMouseMove={(e) => handleMouseMove(prism, e)}
        >
          <IoPrismOutline className="prism-icon" />
          <div className="prism-info">
            <div className="title">{prism.type}</div>
          </div>
          <button onClick={() => onAddPrism(prism.type)}>Add Prism</button>
        </div>
      ))}
    </div>
  );
};
