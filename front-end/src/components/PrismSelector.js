import React from 'react';
import { IoPrismOutline, IoColorPaletteOutline } from "react-icons/io5";
import { Prism } from "../base/prism/Prism"
import { deduplicateByKey } from '../scripts/utils'
import { useTooltip } from './Tooltip';

export const PrismSelector = ({ prisms, activePrisms, onAddPrism, onTooltipUpdate }) => {
  const { handleMouseEnter, handleMouseLeave, handleMouseMove } = useTooltip(onTooltipUpdate);

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
          onMouseEnter={(e) => handleMouseEnter(prism.description, e)}
          onMouseLeave={handleMouseLeave}
          onMouseMove={handleMouseMove}
        >
          <IoColorPaletteOutline className="prism-icon" />
          <div className="prism-info">
            <div className="title">{prism.type}</div>
          </div>
          <button onClick={() => onAddPrism(prism.type)}>add</button>
        </div>
      ))}
    </div>
  );
};