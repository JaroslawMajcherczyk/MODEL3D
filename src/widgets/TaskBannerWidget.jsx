import { useEffect, useState } from "react";

export default function TaskBannerWidget({
  topOffset = 18,
  initialVisible = true,
  message: initialMessage = "Misurare tutti i morsetti sull'elemento completato passo dopo passo sulla visualizzazione fornita.",
}) {
  const [visible, setVisible] = useState(initialVisible);
  const [message, setMessage] = useState(initialMessage);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    function onModelLoaded() { setVisible(true); }
    function onStageFirst() { setVisible(false); }
    function onShow() { setVisible(true); }
    function onHide() { setVisible(false); }
    function onToggle() { setVisible(v => !v); }
    function onSet(e) {
      if (typeof e.detail === "string" && e.detail.trim()) {
        setMessage(e.detail.trim());
        setVisible(true);
      }
    }

    // NEW: pause/resume
    const onPause = () => setPaused(true);
    const onResume = () => setPaused(false);

    window.addEventListener("nexus:model:loaded", onModelLoaded);
    window.addEventListener("nexus:stage:first", onStageFirst);
    window.addEventListener("nexus:taskbanner:show", onShow);
    window.addEventListener("nexus:taskbanner:hide", onHide);
    window.addEventListener("nexus:taskbanner:toggle", onToggle);
    window.addEventListener("nexus:taskbanner:set", onSet);

    window.addEventListener("nexus:ui:taskbanner:pause", onPause);
    window.addEventListener("nexus:ui:taskbanner:resume", onResume);

    return () => {
      window.removeEventListener("nexus:model:loaded", onModelLoaded);
      window.removeEventListener("nexus:stage:first", onStageFirst);
      window.removeEventListener("nexus:taskbanner:show", onShow);
      window.removeEventListener("nexus:taskbanner:hide", onHide);
      window.removeEventListener("nexus:taskbanner:toggle", onToggle);
      window.removeEventListener("nexus:taskbanner:set", onSet);

      window.removeEventListener("nexus:ui:taskbanner:pause", onPause);
      window.removeEventListener("nexus:ui:taskbanner:resume", onResume);
    };
  }, []);

  if (!visible || paused) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: topOffset,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 1000,
        pointerEvents: "none",
        background: "rgba(120,120,120,0.85)",
        color: "white",
        padding: "18px 28px",
        borderRadius: 14,
        minWidth: 300,
        maxWidth: "min(92vw, 900px)",
        display: "inline-block",
        textAlign: "center",
        boxShadow: "0 12px 32px rgba(0,0,0,0.35)",
        fontFamily: "system-ui, Segoe UI, Roboto, sans-serif",
        backdropFilter: "blur(2px)",
        fontSize: 32,
        fontWeight: 700,
        letterSpacing: 0.4,
        whiteSpace: "normal",
        wordBreak: "break-word",
        overflowWrap: "anywhere",
        lineHeight: 1.35,
      }}
    >
      {message}
    </div>
  );
}
