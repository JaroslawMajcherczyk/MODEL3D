// MeasureWidget.jsx
import { useEffect, useState, useMemo } from "react";

export default function MeasureWidget({ topOffset = 18 }) {
  const [m, setM] = useState(() =>
    window.Nexus?.lastMeasure ?? { value: null, unit: "mm", min: null, max: null }
  );
  const [visible, setVisible] = useState(() => window.Nexus?.ui?.measureVisible ?? false);

  useEffect(() => {
    function onMeasure(e) { setM(e.detail); }
    function onShow() { setVisible(true); }
    function onHide() { setVisible(false); }
    function onClear() {
      setM({ value: null, unit: "mm", min: null, max: null });
    }

    window.addEventListener("nexus:measure", onMeasure);
    window.addEventListener("nexus:measure:show", onShow);
    window.addEventListener("nexus:measure:hide", onHide);
    window.addEventListener("nexus:measure:clear", onClear);
    return () => {
      window.removeEventListener("nexus:measure", onMeasure);
      window.removeEventListener("nexus:measure:show", onShow);
      window.removeEventListener("nexus:measure:hide", onHide);
      window.removeEventListener("nexus:measure:clear", onClear);
    };
  }, []);

  const { value, unit, min, max } = m;

  const inRange = useMemo(() => {
    if (typeof value !== "number" || Number.isNaN(value)) return null;
    if (typeof min !== "number" || Number.isNaN(min)) return null;
    if (typeof max !== "number" || Number.isNaN(max)) return null;
    return value >= min && value <= max;
  }, [value, min, max]);

  const bg = (inRange === null)
    ? "rgba(0,0,0,0.60)"
    : inRange
      ? "rgba(0,160,80,0.85)"
      : "rgba(200,0,40,0.85)";

  const shown = (typeof value === "number" && !Number.isNaN(value))
    ? value.toFixed(2)
    : "—";

  // ⬇️ jeśli ukryty – nie renderuj w ogóle:
  if (!visible) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: topOffset,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 1000,
        pointerEvents: "none",
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
