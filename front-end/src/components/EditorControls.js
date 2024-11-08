import React, { useState } from 'react';

export const EditorControls = ({ onRestart }) => {
  const [showModal, setShowModal] = useState(false);

  const Modal = () => (
    <div className="modal">
      <form onSubmit={(e) => {
        e.preventDefault();
        onRestart();
        setShowModal(false);
      }}>
        <h2 className="major-text">Are you sure?</h2>
        <p className="text">This action will delete all your current work. This cannot be undone.</p>
        <div className="control-buttons">
          <button type="button" onClick={() => setShowModal(false)} className="light-button">
            Cancel
          </button>
          <button className="setting-button" type="submit">
            Yes, refresh
          </button>
        </div>
      </form>
    </div>
  );

  return (
    <div className="control-buttons editor-controls">
      <button className="setting-button" onClick={() => setShowModal(true)}>
        Refresh
      </button>
      {showModal && <Modal />}
    </div>
  );
};