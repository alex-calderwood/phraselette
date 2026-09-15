import React, { useState } from 'react';
import Landing from './components/Landing.jsx';
import Workspace from './components/Workspace.jsx';
import { request } from './models/client.js';

export default function App() {
  const [session, setSession] = useState(null); // { device, cards, slots } once models are loaded
  if (!session) return <Landing onReady={setSession} />;
  // Going back to the landing page frees every loaded model so a new choice
  // does not stack on top of the old one in GPU / wasm memory.
  const changeModels = async () => {
    setSession(null);
    try { await request('unloadAll'); } catch (e) { console.warn('unload failed', e); }
  };
  return <Workspace session={session} onChangeModels={changeModels} />;
}
