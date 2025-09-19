// src/App.jsx
import React from "react";
import ThreeViewer from "./components/ThreeViewer";
import MeasureWidget from "./widgets/MeasureWidget.jsx";
import MeasureSummaryBar from "./components/MeasureSummaryBar.jsx";
import TaskBannerWidget from "./widgets/TaskBannerWidget.jsx";
import ArrowHudWidget from "./widgets/ArrowHudWidget.jsx";
import FinalQualityWidget from "./widgets/FinalQualityWidget.jsx";


export default function App() {
  return (
    <>
      <ThreeViewer />
      <MeasureSummaryBar  />
      <FinalQualityWidget topOffset={72} />
      <MeasureWidget  />
      <TaskBannerWidget />
      <ArrowHudWidget arrowSize={64} />
    </>
  );
}
