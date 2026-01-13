import "@fontsource/inter/latin.css";
import "@hearth/ui/theme.css";
import "weather-icons/css/weather-icons.min.css";
import "./styles.css";

import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
