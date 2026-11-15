import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// The service worker is what makes the phone share sheet work. It is optional:
// on http:// or an unsupported browser the app runs exactly the same.
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  // When a new worker takes over, reload once so the page runs the build that
  // matches it. Without this, an update can sit invisible behind the old shell.
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // A missing worker only costs the share target, never the library.
    });
  });
}
