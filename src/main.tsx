import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// Placeholder for hatching wizard - Wave 3 will implement the full UI
function HatchingWizardApp() {
  return null;
}

const windowLabel = new URLSearchParams(location.search).get("window");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {windowLabel === "hatching-wizard" ? <HatchingWizardApp /> : <App />}
  </React.StrictMode>,
);
