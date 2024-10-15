import React from 'react';

const ControlButtons = ({ onRetokenize, onSearch, onDelete, opening}) => {
  return (
    <div className="control-buttons">
      {opening != null && <button onClick={onDelete}>{"×"}</button>}
      <button onClick={onSearch}>{opening ? "Run All Palettes ▶" : "Create Opening"}</button>
    </div>
  );
};

export default ControlButtons;