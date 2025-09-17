// src/components/MeasureSummaryBar.jsx
import { useEffect, useState } from "react";

export default function MeasureSummaryBar({ topOffset = 12 }) {
  const [slots, setSlots] = useState(() => (window.Nexus?.summary?.slots ?? [null,null,null,null]).slice());
  const [visible, setVisible] = useState(() => !!window.Nexus?.summary?.visible);

  useEffect(() => {
    const onUpd  = (e) => setSlots((e.detail ?? []).slice());
    const onShow = () => setVisible(true);
    const onHide = () => setVisible(false);
    window.addEventListener("nexus:summary:update", onUpd);
    window.addEventListener("nexus:summary:show", onShow);
    window.addEventListener("nexus:summary:hide", onHide);
    return () => {
      window.removeEventListener("nexus:summary:update", onUpd);
      window.removeEventListener("nexus:summary:show", onShow);
      window.removeEventListener("nexus:summary:hide", onHide);
    };
  }, []);

  if (!visible) return null;

  return (
    <div style={{
      position: "absolute",
      top: topOffset,
      left: "50%",
      transform: "translateX(-50%)",
      display: "flex",
      gap: 12,
      zIndex: 1002,
      pointerEvents: "none"
    }}>
      {slots.map((m, i) => {
        const has = !!m && Number.isFinite(m.value);
        const inRange = has && Number.isFinite(m.min) && Number.isFinite(m.max)
          ? (m.value >= m.min && m.value <= m.max) : null;

        const bg = (inRange === null)
          ? "rgba(0,0,0,0.6)"
          : inRange ? "rgba(0,160,80,0.85)" : "rgba(200,0,40,0.85)";

        return (
          <div key={i} style={{
            background: bg,
            color: "white",
            padding: "12px 14px",
            borderRadius: 10,
            minWidth: 150,
            textAlign: "center",
            boxShadow: "0 10px 28px rgba(0,0,0,0.35)",
            fontFamily: "system-ui, Segoe UI, Roboto, sans-serif"
          }}>
            <div style={{ fontSize: 12, opacity: 0.9, marginBottom: 2 }}>
              Etap {i + 1}
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1 }}>
              {has ? m.value.toFixed(2) : "—"}{" "}
              <span style={{ fontSize: 16, fontWeight: 600 }}>{m?.unit || "mm"}</span>
            </div>
            {has && Number.isFinite(m.min) && Number.isFinite(m.max) && (
              <div style={{ fontSize: 12, opacity: 0.9, marginTop: 4 }}>
                {m.min.toFixed(2)} – {m.max.toFixed(2)} {m.unit || "mm"}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
