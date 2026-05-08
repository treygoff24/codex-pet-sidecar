import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { HatchingWizardApp } from "./ui/hatching/HatchingWizardApp";

const windowLabel = new URLSearchParams(location.search).get("window");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {windowLabel === "hatching-wizard" ? <HatchingWizardApp /> : <App />}
  </React.StrictMode>,
);
