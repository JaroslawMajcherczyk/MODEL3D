// src/components/FinalQualityWidget.jsx
import { useEffect, useMemo, useState } from "react";

export default function FinalQualityWidget({
  defaultRequired = 4, // fallback, jeśli frontend nie ustawi inaczej
}) {
  const [slots, setSlots] = useState(() =>
    (window.Nexus?.summary?.slots ?? [null, null, null, null]).slice()
  );
  const [summaryVisible, setSummaryVisible] = useState(
    () => !!window.Nexus?.summary?.visible
  );
  const [required, setRequired] = useState(
    () => window.Nexus?.ui?.summaryRequiredSlots ?? defaultRequired
  );

  useEffect(() => {
    const onUpd  = (e) => setSlots((e.detail ?? []).slice());
    const onShow = () => setSummaryVisible(true);
    const onHide = () => setSummaryVisible(false);
    const onReq  = () =>
      setRequired(window.Nexus?.ui?.summaryRequiredSlots ?? defaultRequired);

    window.addEventListener("nexus:summary:update", onUpd);
    window.addEventListener("nexus:summary:show", onShow);
    window.addEventListener("nexus:summary:hide", onHide);
    window.addEventListener("nexus:summary:required", onReq);

    return () => {
      window.removeEventListener("nexus:summary:update", onUpd);
      window.removeEventListener("nexus:summary:show", onShow);
      window.removeEventListener("nexus:summary:hide", onHide);
      window.removeEventListener("nexus:summary:required", onReq);
    };
  }, [defaultRequired]);

  const { ready, outOf } = useMemo(() => {
    const bad = [];
    let countComplete = 0;

    (slots || []).forEach((m, i) => {
      const complete =
        m && Number.isFinite(m.value) && Number.isFinite(m.min) && Number.isFinite(m.max);
      if (complete) {
        countComplete++;
        if (!(m.value >= m.min && m.value <= m.max)) bad.push(i + 1); // 1..N
      }
    });

    return {
      ready: countComplete >= (required || defaultRequired),
      outOf: bad,
    };
  }, [slots, required, defaultRequired]);

  if (!summaryVisible || !ready) return null;

  const ok = outOf.length === 0;
  const bg = ok ? "rgba(0,160,80,0.92)" : "rgba(200,0,40,0.92)";

  const plural = outOf.length === 1 ? "zacisku" : "zacisków";
  const list = outOf.join(", ");

  const msgOk =
    "Pomiary przeprowadzone na wszystkich zaciskach mieszczą się w podanej normie, można kontynuować produkcję.";
  const msgBad = `Pomiary z ${plural} ${list} nie mieszczą się w normie, proszę o poinformowanie działu konserwacji w celu rozwiązania zaistniałej sytuacji.`;

  return (
    <div
      style={{
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 1002,
        pointerEvents: "none",
        background: bg,
        color: "white",
        padding: "20px 26px",
        borderRadius: 16,
        minWidth: 520,
        maxWidth: "80vw",
        textAlign: "center",
        boxShadow: "0 12px 30px rgba(0,0,0,0.35)",
        fontFamily: "system-ui, Segoe UI, Roboto, sans-serif",
        backdropFilter: "blur(2px)",
      }}
    >
      <div style={{ fontSize: 34, fontWeight: 800, lineHeight: 1.25 }}>
        {ok ? msgOk : msgBad}
      </div>
    </div>
  );
}
