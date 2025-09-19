// src/components/FinalQualityWidget.jsx
import { useEffect, useMemo, useState } from "react";

export default function FinalQualityWidget({
  topOffset = 0,          // przesunięcie od środka ekranu (px; dodatnie = w dół)
  minSlotsRequired = 4,   // wymagamy kompletu pomiarów
}) {
  const [slots, setSlots] = useState(() =>
    (window.Nexus?.summary?.slots ?? [null, null, null, null]).slice()
  );
  const [summaryVisible, setSummaryVisible] = useState(
    () => !!window.Nexus?.summary?.visible
  );

  useEffect(() => {
    const onUpd  = (e) => setSlots((e.detail ?? []).slice());
    const onShow = () => setSummaryVisible(true);
    const onHide = () => setSummaryVisible(false);
    window.addEventListener("nexus:summary:update", onUpd);
    window.addEventListener("nexus:summary:show", onShow);
    window.addEventListener("nexus:summary:hide", onHide);
    return () => {
      window.removeEventListener("nexus:summary:update", onUpd);
      window.removeEventListener("nexus:summary:show", onShow);
      window.removeEventListener("nexus:summary:hide", onHide);
    };
  }, []);

  const { ready, outOf } = useMemo(() => {
    const bad = [];
    let countComplete = 0;

    (slots || []).forEach((m, i) => {
      const complete =
        m &&
        Number.isFinite(m.value) &&
        Number.isFinite(m.min) &&
        Number.isFinite(m.max);
      if (complete) {
        countComplete++;
        if (!(m.value >= m.min && m.value <= m.max)) bad.push(i + 1); // 1..4
      }
    });

    return { ready: countComplete >= minSlotsRequired, outOf: bad };
  }, [slots, minSlotsRequired]);

  if (!summaryVisible || !ready) return null;

  const ok = outOf.length === 0;
  const bg = ok ? "rgba(0,160,80,0.92)" : "rgba(200,0,40,0.92)";

  const plural = outOf.length === 1 ? "zacisku" : "zacisków";
  const list   = outOf.join(", ");

  const msgOk =
    "Pomiary przeprowadzone na wszystkich zaciskach mieszczą się w podanej normie, można kontynuować produkcję.";
  const msgBad =
    `Pomiary z ${plural} ${list} nie mieszczą się w normie, proszę o poinformowanie działu konserwacji w celu rozwiązania zaistniałej sytuacji.`;

  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: `translate(-50%, calc(-50% + ${topOffset}px))`,
        zIndex: 1002,
        pointerEvents: "none",
        background: bg,
        color: "white",
        padding: "28px 34px",
        borderRadius: 16,
        minWidth: 560,
        maxWidth: "min(90vw, 980px)",
        textAlign: "center",
        boxShadow: "0 18px 48px rgba(0,0,0,0.35)",
        fontFamily: "system-ui, Segoe UI, Roboto, sans-serif",
        backdropFilter: "blur(2px)",
      }}
    >
      <div style={{ fontSize: 30, fontWeight: 900, lineHeight: 1.35, wordBreak: "break-word" }}>
        {ok ? msgOk : msgBad}
      </div>
    </div>
  );
}
