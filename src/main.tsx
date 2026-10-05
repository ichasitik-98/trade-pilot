import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Development HMR Resilience: Handle benign Vite development WebSocket disconnects
// in reverse-proxied / iframe preview environments to prevent uncaught app crashes.
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const msg = typeof reason === 'string' ? reason : reason?.message || '';
    if (
      msg.includes('WebSocket closed without opened') ||
      msg.includes('failed to connect to websocket') ||
      (reason && typeof reason === 'object' && reason.constructor?.name === 'CloseEvent')
    ) {
      // Gracefully prevent unhandled rejection warning from crashing dev preview
      event.preventDefault();
      console.debug('[Vite HMR] Development WebSocket notice:', msg);
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
