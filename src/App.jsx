import React, { useState } from 'react';
import Landing from './components/Landing.jsx';
import Workspace from './components/Workspace.jsx';
import Lab from './components/Lab.jsx';

const wantsLab = () => new URLSearchParams(window.location.search).has('lab');

export default function App() {
  const [session, setSession] = useState(null); // { device, cards, slots } once models are loaded
  const [lab, setLab] = useState(wantsLab);

  const setLabUrl = (on) => {
    const url = new URL(window.location.href);
    if (on) url.searchParams.set('lab', ''); else url.searchParams.delete('lab');
    window.history.replaceState(null, '', url);
    setLab(on);
  };

  if (lab) return <Lab onExit={() => setLabUrl(false)} />;
  if (!session) return <Landing onReady={setSession} onLab={() => setLabUrl(true)} />;
  return <Workspace session={session} onChangeModels={() => setSession(null)} />;
}
