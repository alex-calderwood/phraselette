import React, { useState, useEffect } from "react";

export function Modal({ onSubmit, addEvent, eventName}) {
    const [userId, setUserId] = useState('');
    // const [narrative, setNarrative] = useState('');
  
    const handleSubmit = (e) => {
        e.preventDefault();

        const event = {
        eventName: eventName,
        timestamp: Date.now(),
        eventDetails: {
            userId,
        //   narrativeType: narrative
        }
        };
        addEvent(event);
  
    //   onSubmit({ userId, narrative });
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
          />
          {/* <select
            value={narrative}
            onChange={(e) => setNarrative(e.target.value)}
            required
          >
            <option value="">Select a story</option>
            <option value="blank">Blank</option>
          </select> */}
          <button type="submit">Begin</button>
        </form>
      </div>
    );
  }