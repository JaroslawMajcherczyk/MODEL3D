import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// musi się wykonać side-effect z window.Nexus.actions:
import './components/actions.jsx'

;(function setupBridge(){
  if (typeof window === 'undefined') return;
  if (window.__NEXUS_BRIDGE_BOUND__) return;
  window.__NEXUS_BRIDGE_BOUND__ = true;

  function parseCallFromLocation() {
    // 1) hash: #!call=<json url-encoded>
    const h = window.location.hash || '';
    const mh = /^#!call=(.+)$/i.exec(h);
    if (mh) {
      try { return JSON.parse(decodeURIComponent(mh[1])); } catch { /* empty */ }
    }

    // 2) query: ?__nexusCall=<json url-encoded>
    const sp = new URLSearchParams(window.location.search);
    const q = sp.get('__nexusCall');
    if (q) {
      try { return JSON.parse(decodeURIComponent(q)); } catch { /* empty */ }
    }
    return null;
  }

  function clearConsumedCommand() {
    // nie psuj routingu: czyść tylko fragment/param polecenia
    const url = new URL(window.location.href);
    url.hash = '';              // czyścimy hash komend
    url.searchParams.delete('__nexusCall');
    window.history.replaceState({}, '', url);
  }

  async function handleCall(payload) {
    const { id, name, args } = payload || {};
    const fn = window?.Nexus?.actions?.[name];
    console.log('[NexusBridge] incoming:', payload, 'available:', Object.keys(window?.Nexus?.actions || {}));

    if (typeof fn === 'function') {
      try {
        await Promise.resolve(fn(...(args ?? [])));
        document.title = '__ACK__ ' + JSON.stringify({ id, ok:true });
        console.log('[NexusBridge] OK:', name);
      } catch (err) {
        document.title = '__ACK__ ' + JSON.stringify({ id, ok:false, error:String(err) });
        console.warn('[NexusBridge] FAIL:', name, err);
      }
    } else {
      console.warn('[NexusBridge] function not found:', name);
    }
  }

  function pump() {
    const payload = parseCallFromLocation();
    if (payload) {
      handleCall(payload).finally(clearConsumedCommand);
    }
  }

  window.addEventListener('hashchange', pump);
  window.addEventListener('load', pump);
  console.log('[NexusBridge] ready');
  pump();

  window.Nexus ??= {};
  window.Nexus.test = (name, ...args) => {
    const p = { id:'test', name, args };
    location.hash = '#!call=' + encodeURIComponent(JSON.stringify(p));
  };
})();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
