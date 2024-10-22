import React from 'react';
import { IoPrismOutline, IoColorPaletteOutline } from "react-icons/io5";
import { Prism } from "../base/prism/Prism"
import { deduplicateByKey } from '../scripts/utils'
import { useTooltip } from './Tooltip';

export const PrismSelector = ({ prisms, activePrisms, onAddPrism, onTooltipUpdate }) => {
  const { handleMouseEnter, handleMouseLeave, handleMouseMove } = useTooltip(onTooltipUpdate);

  const inactivePrisms = deduplicateByKey(
    Object.values(prisms).filter(prism => 
      // (prism.duplicatable || !activePrisms.map(p => p.type).includes(prism.type))
      !activePrisms.map(p => p.type).includes(prism.type)
    ),
    'type'
  );

  const canAdd = (prism) => {
    return prism.duplicatable;
  }

  const singlePrism = (prism) => {
    const showAddButton = canAdd(prism);
    const active = prism.active;

    return <div
          key={prism.id}
          className={"prism-item glass-pane" + (active ? ' border' : '')}
          onMouseEnter={(e) => handleMouseEnter(prism.description, e)}
          onMouseLeave={handleMouseLeave}
          onMouseMove={handleMouseMove}
        >
          <div className="prism-info">
            <div className="title">{prism.type}</div>
            <IoColorPaletteOutline className="prism-icon small" />
          </div>
          {/* <button disabled={canAdd(prism)} onClick={() => onAddPrism(prism.type)}>add</button> */}
          {showAddButton && <button onClick={() => onAddPrism(prism.type)}>add</button>}
        </div>
  }

  return (
    <div className="prism-selector">
      {activePrisms.map((prism) => (singlePrism(prism) ))}
      {inactivePrisms.map((prism) => (singlePrism(prism) ))}
    </div>
  );
};