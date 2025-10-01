import React, { useEffect, useRef, useState } from "react";

/**
 * Widget odliczania cofnięcia ostatniego pomiaru.
 * Pokazuje się TYLKO gdy:
 *  - jest to ostatni wymagany etap dla danego modelu
 *  - ostatni pomiar jest poza [min, max]
 *
 * Zdarzenia, których słucha:
 *  - "nexus:model:key"  → zna aktywny model ("1","2","3", lub "default")
 *  - "nexus:measure"    → dostaje { value, min, max, stage }
 *  - "nexus:back"       → NATYCHMIAST chowa widget (cofnięcie z backendu/UI)
 *  - "nexus:undo:cancel"→ NATYCHMIAST chowa widget (anulowanie z backendu)
 */

const TERMINAL_STAGE_BY_MODELKEY = {
  "1": 4,
  "2": 4,
  "3": 2,
  default: 4,
};

export default function UndoCountdownWidget({
  seconds = 12,
  // teksty / wygląd (POZOSTAWIONE BEZ ZMIAN)
  title = "Tempo rimanente prima che l'ultima misurazione venga annullata",
  bg = "rgba(15, 23, 42, 0.55)", // przyciemnienie tła
  cardBg = "#ffffff",
  textColor = "#101828",
  badgeBg = "#EFF8FF",
  badgeColor = "#175CD3",
}) {
  const [visible, setVisible] = useState(false);
  const [remain, setRemain] = useState(seconds);

  const modelKeyRef = useRef("default");
  const lastMeasureTsRef = useRef(0);
  const timerRef = useRef(null);
  const deadlineRef = useRef(0);

  // 1) słuchaj modelu (ustawiany przez loader)
  useEffect(() => {
    const onModelKey = (e) => {
      const key = String(e?.detail ?? "default");
      modelKeyRef.current = key;
    };
    window.addEventListener("nexus:model:key", onModelKey);
    return () => window.removeEventListener("nexus:model:key", onModelKey);
  }, []);

  // 2) słuchaj pomiarów → decyzja o starcie odliczania
  useEffect(() => {
    const onMeasure = (e) => {
      const d = e?.detail || {};
      const v = d.value;
      const min = d.min;
      const max = d.max;
      const stage = d.stage;

      if (typeof v !== "number" || typeof min !== "number" || typeof max !== "number") return;
      if (!Number.isFinite(stage)) return;

      const terminalStage =
        TERMINAL_STAGE_BY_MODELKEY[modelKeyRef.current] ?? TERMINAL_STAGE_BY_MODELKEY.default;
      if (stage !== terminalStage) return;

      const outOfRange = v < min || v > max;

      // Debounce (nie startuj 2x dla tego samego pomiaru)
      const nowTs = Date.now();
      if (outOfRange && nowTs - lastMeasureTsRef.current < 300) return;

      if (outOfRange) {
        lastMeasureTsRef.current = nowTs;
        startCountdown();
      } else {
        stopCountdown();
      }
    };

    window.addEventListener("nexus:measure", onMeasure);
    return () => window.removeEventListener("nexus:measure", onMeasure);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds]);

  // 3) CHOWANIE przy cofnięciu/zamknięciu z backendu
  useEffect(() => {
    const onBack = () => stopCountdown();            // cofnięcie (np. ten sam przycisk co wcześniej)
    const onCancel = () => stopCountdown();          // jawne anulowanie z backendu
    window.addEventListener("nexus:back", onBack);
    window.addEventListener("nexus:undo:cancel", onCancel);
    return () => {
      window.removeEventListener("nexus:back", onBack);
      window.removeEventListener("nexus:undo:cancel", onCancel);
    };
  }, []);

  // 4) obsługa timera
  function startCountdown() {
    stopCountdown(); // reset, jeśli już coś leciało
    setRemain(seconds);
    setVisible(true);
    deadlineRef.current = performance.now() + seconds * 1000;

    timerRef.current = requestAnimationFrame(tick);
  }

  function stopCountdown() {
    if (timerRef.current) cancelAnimationFrame(timerRef.current);
    timerRef.current = null;
    setVisible(false);
  }

  function tick() {
    const now = performance.now();
    const leftMs = Math.max(0, deadlineRef.current - now);
    const leftSec = Math.ceil(leftMs / 1000);
    setRemain(leftSec);

    if (leftMs > 0) {
      timerRef.current = requestAnimationFrame(tick);
    } else {
      stopCountdown(); // koniec czasu → znikamy
    }
  }

  if (!visible) return null;

  // UI (overlay + karta z licznikiem) — WYGLĄD POZOSTAJE IDENTYCZNY
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: bg,
        zIndex: 999999, // nad innymi widgetami
        display: "grid",
        placeItems: "center",
        pointerEvents: "auto",
      }}
    >
      <div
        style={{
          width: "min(90vw, 520px)",
          borderRadius: 16,
          background: cardBg,
          boxShadow: "0 16px 48px rgba(16,24,40,0.24)",
          border: "1px solid #EAECF0",
          padding: 20,
          display: "grid",
          gap: 14,
          fontFamily: "system-ui,Segoe UI,Roboto,sans-serif",
          color: textColor,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              background: badgeBg,
              color: badgeColor,
              fontWeight: 700,
              fontSize: 22,
              borderRadius: 999,
              padding: "4px 10px",
              letterSpacing: 0.3,
            }}
          >
            MISURAZIONE FUORI RANGE
          </span>
          <div style={{ flex: 1 }} />
          <div
            aria-label="remaining-time"
            style={{
              fontVariantNumeric: "tabular-nums",
              fontWeight: 800,
              fontSize: 28,
              lineHeight: "28px",
            }}
          >
            {remain}s
          </div>
        </div>

        <div style={{ fontSize: 28, fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: 22, color: "#475467" }}>
          L'ultima misurazione era al di fuori dell'intervallo consentito. Puoi annullare e
          ripetere l'operazione: andremo avanti una volta trascorso il tempo impostato.
        </div>
      </div>
    </div>
  );
}
