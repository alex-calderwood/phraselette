import React from 'react';

const ControlButtons = ({ onRetokenize, onSearch }) => {
  return (
    <div className="control-buttons">
      {/* <button onClick={onRetokenize}>Retokenize</button> */}
      <button onClick={onSearch}>Run Prisms</button>
    </div>
  );
};

export default ControlButtons;