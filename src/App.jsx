// src/App.jsx
import React from "react";
import ThreeViewer from "./components/ThreeViewer";
import MeasureWidget from "./components/MeasureWidget.jsx";
import MeasureSummaryBar from "./components/MeasureSummaryBar.jsx";

export default function App() {
  return (
    <>
      <ThreeViewer />
      <MeasureWidget  />
      <MeasureSummaryBar  />
    </>
  );
}
