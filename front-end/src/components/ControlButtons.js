import React from 'react';
import { useTooltip } from './Tooltip';

const ControlButtons = ({ onRetokenize, onSearch, onDelete, opening, onTooltipUpdate}) => {

  const { handleMouseEnter, handleMouseLeave, handleMouseMove } = useTooltip(onTooltipUpdate);

  return (
    <div className="control-buttons">
      {opening != null && <button 
        onMouseEnter={(e) => handleMouseEnter("Remove Inlet", e)}
        onMouseLeave={handleMouseLeave}
        onMouseMove={handleMouseMove}onClick={onDelete}>{"×"}</button>}
      <button 
        onMouseEnter={(e) => handleMouseEnter(opening ? "Run all Wells. ⌘ + Enter" : "Create an Inlet for the current selection.", e)}
        onMouseLeave={handleMouseLeave}
        onMouseMove={handleMouseMove}
        onClick={onSearch}>{opening ? "Run All Wells 🖌️" : "Create Inlet 🎨"}</button> 
    </div>
  );
};

export default ControlButtons;