import React from 'react';
import { useTooltip } from './Tooltip';

const InletHeader = ({ onRetokenize, onSearch, onDelete, opening, onTooltipUpdate, selectionText, showSelection, start, end }) => {
  const { handleMouseEnter, handleMouseLeave, handleMouseMove } = useTooltip(onTooltipUpdate);

  if (!opening) {
    return (
      <div className="inlet">
        <button 
          onMouseEnter={(e) => handleMouseEnter("Create an Inlet for the current selection.", e)}
          onMouseLeave={handleMouseLeave}
          onMouseMove={handleMouseMove}
          onClick={onSearch}>Create Inlet 🎨</button>
      </div>
    );
  }

  return (
    <>
      <div className="inlet">
        <div style={{ marginBottom: '8px' }}>
        <button 
            onMouseEnter={(e) => handleMouseEnter("Remove Inlet", e)}
            onMouseLeave={handleMouseLeave}
            onMouseMove={handleMouseMove}
            onClick={onDelete}>×</button>
            
          Inlet for 
          <div className="selection-display glass-pane">{selectionText}</div>
          {showSelection && <div className="selection-info">{start} - {end}</div>}
          
          <button 
            onMouseEnter={(e) => handleMouseEnter("Run all Wells. ⌘ + Enter", e)}
            onMouseLeave={handleMouseLeave}
            onMouseMove={handleMouseMove}
            onClick={onSearch}>Run Wells 🖌️</button>
        </div>
      </div>
    </>
  );
};

export default InletHeader;