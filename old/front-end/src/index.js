import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';

const appState = {
    selection: null,
    userData: null,
    events: [],
    // Add other global state variables you want here
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <ErrorBoundary>
    <App {...appState}/>
  </ErrorBoundary>
);

export { appState };  