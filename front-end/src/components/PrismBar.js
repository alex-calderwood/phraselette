import React from 'react';
import { IoPrismOutline, IoColorPaletteOutline } from "react-icons/io5";
import { Prism } from "../base/prism/Prism"
import { deduplicateByKey } from '../scripts/utils'
import { useTooltip } from './Tooltip';

export const PrismBar = ({ prisms, activePrisms, onAddPrism, onTooltipUpdate, onRemovePrism}) => {
  const { handleMouseEnter, handleMouseLeave, handleMouseMove } = useTooltip(onTooltipUpdate);

  const inactivePrisms = deduplicateByKey(
    Object.values(prisms).filter(prism => 
      // (prism.duplicatable || !activePrisms.map(p => p.type).includes(prism.type))
      !activePrisms.map(p => p.type).includes(prism.type)
    ),
    'type'
  );

  const canAdd = (prism) => {
    return prism.duplicatable || !activePrisms.map(p => p.type).includes(prism.type);
  }

  const canDelete = (prism) => {
    console.log('can delete:', {prism, active: prism.active, undestroyable: prism.undestroyable})
    return prism.active && !prism.undestroyable;
  }

  const singlePrism = (prism) => {
    const showAddButton = canAdd(prism);
    const showDeleteButton = canDelete(prism);
    const active = prism.active;

    return <div
            key={prism.id}
            className={"prism-bar-item glass-pane" + (active ? ' border' : '')}
            onMouseEnter={(e) => handleMouseEnter(prism.description, e)}
            onMouseLeave={handleMouseLeave}
            onMouseMove={handleMouseMove}
          >
          <div className="prism-info">
            <div className="title">{prism.type}</div>
            <IoColorPaletteOutline className="prism-icon small" />
          </div>
          <div className="prism-bar-buttons">
          {showDeleteButton && (<button className={`light-button big-button`} onClick={() => onRemovePrism(prism)}>×</button>)}
          {/* <button disabled={canAdd(prism)} onClick={() => onAddPrism(prism.type)}>add</button> */}
          {showAddButton && <button className='big-button' onClick={() => onAddPrism(prism.type)}>+</button>}
          </div>
          
        </div>
  }

  const handleWheel = (e) => {
    if (e.deltaY !== 0) {
      e.preventDefault();
      e.currentTarget.scrollLeft += e.deltaY;
    }
  };


  return (
    <div className="prism-bar" onWheel={handleWheel}>
      {activePrisms.map((prism) => (singlePrism(prism) ))}
      {inactivePrisms.map((prism) => (singlePrism(prism) ))}
    </div>
  );
};