// MeasureWidget.jsx
import { useEffect, useState, useMemo } from "react";

export default function MeasureWidget({ topOffset = 18 }) {
  const [m, setM] = useState(() =>
    window.Nexus?.lastMeasure ?? { value: null, unit: "mm", min: null, max: null }
  );

  useEffect(() => {
    function onMeasure(e) { setM(e.detail); }
    window.addEventListener("nexus:measure", onMeasure);
    return () => window.removeEventListener("nexus:measure", onMeasure);
  }, []);

  const { value, unit, min, max } = m;

  const inRange = useMemo(() => {
    if (typeof value !== "number" || Number.isNaN(value)) return null;
    if (typeof min !== "number" || Number.isNaN(min)) return null;
    if (typeof max !== "number" || Number.isNaN(max)) return null;
    return value >= min && value <= max;
  }, [value, min, max]);

  const bg = (inRange === null)
    ? "rgba(0,0,0,0.60)"      // brak danych → neutralny
    : inRange
      ? "rgba(0,160,80,0.85)" // w zakresie → zielony
      : "rgba(200,0,40,0.85)";// poza zakresem → czerwony

  const shown = (typeof value === "number" && !Number.isNaN(value))
    ? value.toFixed(2)
    : "—";

  return (
    <div
      style={{
        position: "absolute",
        top: topOffset,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 1000,
        pointerEvents: "none",                // nie blokuje 3D
        background: bg,
        color: "white",
        padding: "14px 18px",
        borderRadius: 12,
        minWidth: 240,
        textAlign: "center",
        boxShadow: "0 10px 28px rgba(0,0,0,0.35)",
        fontFamily: "system-ui, Segoe UI, Roboto, sans-serif",
        backdropFilter: "blur(2px)",
      }}
    >
      <div style={{ fontSize: 14, opacity: 0.9, marginBottom: 4 }}>Pomiar</div>
      <div style={{ fontSize: 36, fontWeight: 800, lineHeight: 1.0 }}>
        {shown}&nbsp;<span style={{ fontSize: 20, fontWeight: 600 }}>{unit || ""}</span>
      </div>
      {(typeof min === "number" && typeof max === "number") && (
        <div style={{ fontSize: 14, opacity: 0.95, marginTop: 6 }}>
          Zakres: {min.toFixed(2)} – {max.toFixed(2)} {unit || ""}
        </div>
      )}
    </div>
  );
}
