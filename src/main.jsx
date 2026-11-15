import React from "react";
import { createRoot } from "react-dom/client";
import App from "./ui/App.jsx";
import "./ui/styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`)
    .catch((cause) => {
      console.error("The offline app worker could not be registered.", cause);
    });
}
