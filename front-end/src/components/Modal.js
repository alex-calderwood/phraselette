import React, { useState, useEffect } from "react";

export function Modal({ onSubmit }) {
    const [userId, setUserId] = useState('');
  
    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit({userId});
    };
  
    return (
      <div className="modal">
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="User ID"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            required
            id="User ID"
            name="User ID"
            autocomplete="on"
          />
          <button className="setting-button" type="submit">Begin</button>
        </form>
      </div>
    );
  }