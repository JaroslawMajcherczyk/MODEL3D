import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import './components/actions.jsx'

import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr';

(function connect() {
  const sp = new URLSearchParams(location.search);
  const hubParam = sp.get('hub'); // np. "http://127.0.0.1:5183/nexus"
  const url = hubParam || 'http://127.0.0.1:5177/nexus';

  if (window.__NEXUS_CONN__) return;

  const conn = new HubConnectionBuilder()
    .withUrl(url)
    .withAutomaticReconnect()
    .configureLogging(LogLevel.Information)
    .build();

  conn.on('call', ({ name, args }) => {
    const fn = window?.Nexus?.actions?.[name];
    if (typeof fn === 'function') { try { fn(...(args ?? [])); } catch (e) { console.warn('[SignalR] action error', e); } }
    else { console.warn('[SignalR] missing:', name, 'available:', Object.keys(window?.Nexus?.actions || {})); }
  });

  async function startWithRetry(delayMs = 1000) {
    try {
      await conn.start();
      window.__NEXUS_CONN__ = conn;
      console.log('[SignalR] connected', url);
    } catch (e) {
      console.error('[SignalR] connect failed, retrying…', e);
      setTimeout(() => startWithRetry(Math.min(delayMs * 2, 8000)), delayMs);
    }
  }

  startWithRetry();
})();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
