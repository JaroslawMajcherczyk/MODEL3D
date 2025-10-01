// src/components/widgets/ArrowHudWidget.jsx
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
// Jeśli masz helper getViewportMetrics w threeUtils, możesz go też użyć.
// import { getViewportMetrics } from "../../threeUtils";

function worldToScreen(world, camera, w, h) {
  if (!world || !camera || !Number.isFinite(w) || !Number.isFinite(h)) {
    return { x: -9999, y: -9999, off: true };
  }
  const v = new THREE.Vector3(world.x, world.y, world.z).project(camera);
  const x = (v.x + 1) * 0.5 * w;
  const y = (1 - v.y) * 0.5 * h;
  const off = (v.z > 1 || v.z < -1 || Number.isNaN(x) || Number.isNaN(y));
  return { x, y, off };
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export default function ArrowHudWidget({
  color = "#129e5b",
  labelBg = "rgba(0,0,0,0.72)",
  labelColor = "#fff",
  labelPadding = "10px 14px",
  arrowSize = 90,
  labelFontSize = 20,
  labelFontWeight = 800,
  gapPx = 12,
  offsetPx = { x: 0, y: 0 },

  // anty-mruganie
  stickToEdge = true,
  edgePadding = 12,
  hideDelayFrames = 10,
}) {
  // React state tylko do widoczności i treści
  const [visible, setVisible] = useState(false);
  const [text, setText] = useState("");

  // refy na runtime bez re-renderów
  const rootRef = useRef(null);
  const arrowRef = useRef(null);
  const labelRef = useRef(null);

  const modeRef = useRef("world");          // world | screen | percent
  const anchorRef = useRef({});             // {world|screen|percent}
  const optsRef = useRef({
    arrowSize, labelFontSize, gapPx, offsetPx
  });

  const rafRef = useRef(0);
  const lastGoodRef = useRef({ x: -9999, y: -9999 });
  const offFramesRef = useRef(0);

  // Eventy (bez setState dla pozycji)
  useEffect(() => {
    function show(e) {
      const d = e?.detail ?? {};
      modeRef.current = (d.mode || "world").toLowerCase();

      if (modeRef.current === "world" && d.world) anchorRef.current = { world: d.world };
      if (modeRef.current === "screen" && d.screen) anchorRef.current = { screen: d.screen };
      if (modeRef.current === "percent" && d.percent) anchorRef.current = { percent: d.percent };

      setText(typeof d.text === "string" ? d.text : "");
      setVisible(true);

      // nadpisywalne rozmiary/odstępy (używane od razu w stylach elementów)
      optsRef.current = {
        arrowSize: Number.isFinite(d.arrowSize) ? d.arrowSize : arrowSize,
        labelFontSize: Number.isFinite(d.labelFontSize) ? d.labelFontSize : labelFontSize,
        gapPx: Number.isFinite(d.gapPx) ? d.gapPx : gapPx,
        offsetPx: d.offsetPx ?? offsetPx,
      };
      // zaktualizuj wymiary bez re-renderu
      if (arrowRef.current) {
        const s = optsRef.current.arrowSize;
        arrowRef.current.setAttribute("width", s * 0.8);
        arrowRef.current.setAttribute("height", s);
        arrowRef.current.setAttribute("viewBox", `0 0 ${s * 0.8} ${s}`);
        const w = s * 0.8, n = s * 0.35;
        arrowRef.current.querySelector("path").setAttribute(
          "d",
          `M ${w*0.5} 0 L ${w} ${n} L ${w*0.62} ${n} L ${w*0.62} ${s} L ${w*0.38} ${s} L ${w*0.38} ${n} L 0 ${n} Z`
        );
      }
      if (labelRef.current) {
        labelRef.current.style.fontSize = `${optsRef.current.labelFontSize}px`;
        labelRef.current.style.marginTop = `${optsRef.current.gapPx}px`;
      }
    }

    function setEvt(e){ show(e); }
    function hide() {
      setVisible(false);
      anchorRef.current = {};
      offFramesRef.current = 0;
    }

    window.addEventListener("nexus:arrowhud:show", show);
    window.addEventListener("nexus:arrowhud:set",  setEvt);
    window.addEventListener("nexus:arrowhud:hide", hide);
    return () => {
      window.removeEventListener("nexus:arrowhud:show", show);
      window.removeEventListener("nexus:arrowhud:set",  setEvt);
      window.removeEventListener("nexus:arrowhud:hide", hide);
    };
  }, [arrowSize, labelFontSize, gapPx, offsetPx]);

  // Pętla pozycji – imperatywnie, bez setState
  useEffect(() => {
    function loop() {
      rafRef.current = requestAnimationFrame(loop);
      const el = rootRef.current;
      if (!el || !visible) { return; }

      const refs = window?.Nexus?.refs || {};
      const camera   = refs?.cameraRef?.current;
      const renderer = refs?.rendererRef?.current;
      const mount    = refs?.mountRef?.current;

      // 🟢 ZAMIANA: bierzemy rozmiar z renderera w CSS px (spójny dla WebView/CEF/Chrome)
      let w = 0, h = 0;
      if (renderer) {
        const css = new THREE.Vector2();
        renderer.getSize(css); // CSS px
        w = css.x;
        h = css.y;
      }
      // fallbacki (gdyby renderer nie był jeszcze gotów)
      if (!w || !h) {
        w = mount?.clientWidth  ?? document.documentElement.clientWidth  ?? 1;
        h = mount?.clientHeight ?? document.documentElement.clientHeight ?? 1;
      }

      const { offsetPx: off } = optsRef.current;

      let px = -9999, py = -9999, offscreen = false;
      const m = modeRef.current;
      const a = anchorRef.current;

      if (m === "world" && a.world) {
        const res = worldToScreen(a.world, camera, w, h);
        px = res.x; py = res.y; offscreen = res.off;
      } else if (m === "screen" && a.screen) {
        px = a.screen.x; py = a.screen.y; offscreen = false;
      } else if (m === "percent" && a.percent) {
        px = (a.percent.x ?? 0.5) * w;
        py = (a.percent.y ?? 0.5) * h;
        offscreen = false;
      } else {
        offscreen = true;
      }

      if (off && typeof off.x === "number") px += off.x;
      if (off && typeof off.y === "number") py += off.y;

      // histereza + ewent. przyklejenie do krawędzi
      if (!offscreen && Number.isFinite(px) && Number.isFinite(py)) {
        offFramesRef.current = 0;
        lastGoodRef.current = { x: px, y: py };
      } else {
        offFramesRef.current += 1;
        if (offFramesRef.current < hideDelayFrames) {
          px = lastGoodRef.current.x;
          py = lastGoodRef.current.y;
        } else if (stickToEdge && Number.isFinite(px) && Number.isFinite(py)) {
          px = clamp(px, edgePadding, w - edgePadding);
          py = clamp(py, edgePadding, h - edgePadding);
        } else {
          // ukryj wizualnie (bez re-renderu)
          el.style.visibility = "hidden";
          return;
        }
      }

      // pokaż (jeśli był ukryty)
      if (el.style.visibility !== "visible") el.style.visibility = "visible";

      // przesuwamy bez setState
      el.style.transform = `translate3d(${Math.round(px)}px, ${Math.round(py)}px, 0)`;
    }

    if (visible) {
      loop();
      return () => cancelAnimationFrame(rafRef.current);
    } else {
      cancelAnimationFrame(rafRef.current);
      if (rootRef.current) {
        rootRef.current.style.visibility = "hidden";
      }
    }
  }, [visible, hideDelayFrames, stickToEdge, edgePadding]);

  if (!visible) return null;

  const s = optsRef.current.arrowSize;
  const w = s * 0.8;
  const n = s * 0.35;

  return (
    <div
      ref={rootRef}
      style={{
        position: "absolute",
        left: 0, top: 0,
        transform: "translate3d(-9999px, -9999px, 0)",
        zIndex: 1000,
        pointerEvents: "none",
        willChange: "transform",
        visibility: "hidden",
      }}
    >
      {/* Strzałka (grot ma być w punkcie, więc całość kotwiczymy nad nim) */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", transform: "translate(-50%, -100%)" }}>
        <svg
          ref={arrowRef}
          width={w}
          height={s}
          viewBox={`0 0 ${w} ${s}`}
          style={{ pointerEvents: "none" }}
        >
          <path
            d={`M ${w*0.5} 0 L ${w} ${n} L ${w*0.62} ${n} L ${w*0.62} ${s} L ${w*0.38} ${s} L ${w*0.38} ${n} L 0 ${n} Z`}
            fill={color}
          />
        </svg>

        {text ? (
          <div
            ref={labelRef}
            style={{
              marginTop: `${optsRef.current.gapPx}px`,
              background: labelBg,
              color: labelColor,
              fontFamily: "system-ui, Segoe UI, Roboto, sans-serif",
              fontSize: `${optsRef.current.labelFontSize}px`,
              fontWeight: labelFontWeight,
              padding: labelPadding,
              borderRadius: 10,
              boxShadow: "0 8px 24px rgba(0,0,0,0.28)",
              pointerEvents: "none",
              whiteSpace: "nowrap",
            }}
          >
            {text}
          </div>
        ) : null}
      </div>
    </div>
  );
}
