import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';

// rejestr akcji do window.Nexus.actions (C# -> React)
import './components/actions.jsx';

import { HubConnectionBuilder, LogLevel, HttpTransportType  } from '@microsoft/signalr';

(function setup() {
  // --- handshake flags ---
  window.Nexus ??= {};
  const ready = (window.Nexus._ready ??= { signalr: false, viewer: false, model: false });

  function maybeAnnounceReady() {
    if (ready.signalr && ready.viewer && ready.model) {
      window.Nexus.send?.('ready', { ts: Date.now() });
      console.log('[Nexus] READY announced to C#');
    }
  }

  // viewer -> gotowy
  window.addEventListener('nexus:viewer:ready', () => {
    ready.viewer = true;
    console.log('[Nexus] viewer ready');
    // wyślij do C# tak, by Kestrel mógł zwolnić WaitFrontendReadyAsync
    window.Nexus.send?.('ThreeReady');
    maybeAnnounceReady();
  });

  // model -> wczytany
  window.addEventListener('nexus:model:loaded', () => {
    ready.model = true;
    console.log('[Nexus] model loaded');
    // wyślij do C# tak, by Kestrel mógł zwolnić WaitFrontendReadyAsync
    window.Nexus.send?.('ModelReady');
    maybeAnnounceReady();
  });

  // --- SignalR connect ---
  const sp = new URLSearchParams(location.search);
  const hubParam = sp.get('hub'); // np. ?hub=http://127.0.0.1:5183/nexus
  const url = hubParam || 'http://127.0.0.1:5177/nexus';

  if (window.__NEXUS_CONN__) return; // guard na HMR/StrictMode

  const conn = new HubConnectionBuilder()
    .withUrl(url, {
     transport: HttpTransportType.WebSockets,
     skipNegotiation: true
   })
    .withAutomaticReconnect()
    .configureLogging(LogLevel.Information)
    .build();

  // C# -> React
  conn.on('call', ({ name, args }) => {
    const fn = window?.Nexus?.actions?.[name];
    if (typeof fn === 'function') {
      try { fn(...(args ?? [])); } catch (e) { console.warn('[SignalR] action error', e); }
    } else {
      console.warn('[SignalR] missing action:', name, 'available:', Object.keys(window?.Nexus?.actions || {}));
    }
  });

  // React -> C#
  function bindClientSend() {
    window.Nexus ??= {};
    window.Nexus.send = (evt, payload) => conn.invoke('FromClient', evt, payload);
  }

  async function startWithRetry(delayMs = 800) {
    try {
      await conn.start();
      window.__NEXUS_CONN__ = conn;
      bindClientSend();
      console.log('[SignalR] connected', url);

      ready.signalr = true;

      // jeśli viewer/model były gotowe zanim SignalR wystartował – doślij sygnały teraz
      if (ready.viewer) window.Nexus.send?.('ThreeReady');
      if (ready.model)  window.Nexus.send?.('ModelReady');

      maybeAnnounceReady();
    } catch (e) {
      console.error('[SignalR] connect failed, retrying…', e);
      setTimeout(() => startWithRetry(Math.min(delayMs * 2, 4000)), delayMs);
    }
  }

  startWithRetry();
})();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
