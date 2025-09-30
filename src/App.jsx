// src/App.jsx
import React from "react";
import ThreeViewer from "./components/ThreeViewer";
import MeasureWidget from "./widgets/MeasureWidget.jsx";
import MeasureSummaryBar from "./components/MeasureSummaryBar.jsx";
import TaskBannerWidget from "./widgets/TaskBannerWidget.jsx";
import ArrowHudWidget from "./widgets/ArrowHudWidget.jsx";
import FinalQualityWidget from "./widgets/FinalQualityWidget.jsx";
import UndoCountdownWidget from "./widgets/UndoCountdownWidget.jsx";


export default function App() {
  return (
    <>
    <div    style={{
        maxHeight: 1000,
        maxWidth: 1500,
        color: "white",
        boxShadow: "0 10px 28px rgba(0,0,0,0.35)",
      }}>
      <ThreeViewer />
      <MeasureSummaryBar  />
      <FinalQualityWidget topOffset={72} />
      <MeasureWidget  />
      <TaskBannerWidget />
      <ArrowHudWidget arrowSize={64} />
      <UndoCountdownWidget seconds={12} />    
    </div>
    </>
  );
}
