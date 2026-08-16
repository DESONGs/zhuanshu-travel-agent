import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { TravelApp } from "./travel-app.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode><TravelApp /></StrictMode>,
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => null));
}
