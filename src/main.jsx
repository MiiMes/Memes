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

if (typeof window.launchQueue?.setConsumer === "function") {
  window.launchQueue.setConsumer(async (launchParams) => {
    const fileHandle = launchParams.files?.[0];
    if (!fileHandle) return;
    try {
      const file = await fileHandle.getFile();
      window.__memesPendingFile = file;
      window.dispatchEvent(new CustomEvent("memes:file-open", { detail: file }));
    } catch (cause) {
      console.error("The selected file could not be opened in Memes.", cause);
      const message = cause instanceof Error ? cause.message : String(cause);
      window.__memesFileOpenError = message;
      window.dispatchEvent(new CustomEvent("memes:file-open-error", {
        detail: message,
      }));
    }
  });
}
