import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';

// rejestr akcji do window.Nexus.actions (C# -> React)
import './components/modelActions.jsx';

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
// kiedy actions się zarejestrują (actions.jsx wyemituje event), doślij do C#
window.addEventListener('nexus:actions:ready', () => {
  announceActionsReadyIfPossible();
});

  // viewer -> gotowy
  window.addEventListener('nexus:viewer:ready', () => {
    ready.viewer = true;
    console.log('[Nexus] viewer ready');
    // wyślij do C# tak, by Kestrel mógł zwolnić WaitFrontendReadyAsynca
    window.Nexus.send?.('ThreeReady');
    maybeAnnounceReady();
  });

  // model -> wczytany
  window.addEventListener('nexus:model:loaded', async () => {
    ready.model = true;
    console.log('[Nexus] model loaded');
    
    // wyślij do C# tak, by Kestrel mógł zwolnić WaitFrontendReadyAsync
    window.Nexus.send?.('ModelReady');
    maybeAnnounceReady();
    
  });

  // --- SignalR connect ---
  const sp = new URLSearchParams(location.search);
  const hubParam = sp.get('hub'); // np. ?hub=http://127.0.0.1:5183/nexus
  const url =
   hubParam ||
   `${location.protocol}//${location.hostname}:5177/nexus` || // twój dev default
   `${location.origin}/nexus`; // reverse-proxy/same-origin fallback

  if (window.__NEXUS_CONN__) return; // guard na HMR/StrictMode

  const conn = new HubConnectionBuilder()
    .withUrl(url)
    .withAutomaticReconnect()
    .configureLogging(LogLevel.Information)
    .build();

  // C# -> React
 conn.on('call', ({ name, args }) => {
  console.log('[CALL]', name, args);   // <— DODAJ
  const fn = window?.Nexus?.actions?.[name];
  if (typeof fn === 'function') {
    try { fn(...(args ?? [])); } catch (e) { console.warn('[SignalR] action error', e); }
  } else {
    console.warn('[SignalR] missing action:', name, 'available:', Object.keys(window?.Nexus?.actions || {}));
  }
});
// --- nad setup() lub na początku setup():
function announceActionsReadyIfPossible() {
  if (window.Nexus?.actions && window.Nexus?.send) {
    try { window.Nexus.send('ActionsReady'); } catch {/** */}
  }
}

  // React -> C#
  function bindClientSend() {
    window.Nexus ??= {};
window.Nexus.send = async (evt, payload) => {
  try { await conn.invoke('FromClient', evt, payload); }
  catch (e) { console.warn('[SignalR] FromClient failed', evt, e); }
};  }

  async function startWithRetry(delayMs = 800) {
    try {
      await conn.start();
      window.__NEXUS_CONN__ = conn;
      bindClientSend();
      console.log('[SignalR] connected', url);

      ready.signalr = true;
      // JEŚLI actions gotowe wcześniej, doślij teraz:
      announceActionsReadyIfPossible();
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
