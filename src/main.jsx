import "./storage-shim.js"; // debe cargarse antes que App, que usa window.storage
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { registerSW } from "virtual:pwa-register";

// iOS casi nunca revisa por su cuenta si hay una versión nueva de una app
// instalada en pantalla de inicio — por eso, sin esto, hacía falta borrar y
// volver a instalar la app para ver los cambios publicados. Aquí forzamos
// la revisión activamente: apenas se abre/vuelve a primer plano la app, y
// también cada cierto tiempo mientras sigue abierta. Si hay una versión
// nueva, se activa y recarga sola.
const updateSW = registerSW({
  immediate: true,
  onRegisteredSW(swUrl, registration) {
    if (!registration) return;
    registration.update();
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") registration.update();
    });
    window.addEventListener("focus", () => registration.update());
    setInterval(() => registration.update(), 30 * 60 * 1000); // cada 30 min mientras está abierta
  },
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
