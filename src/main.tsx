import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { initTheme } from "./lib/theme";
import { warmupVoices } from "./lib/tts";
import { ensureEcdictLoaded } from "./lib/dict/ecdict";
import { requestPersistentStorage } from "./lib/storagePersist";
import "./styles.css";

// Round 14: apply stored / OS theme before first paint to avoid flash.
initTheme();
// Round 15: kick off voice list load (some browsers lazy-load).
warmupVoices();

// Dictionary (~13 MB) and the persistent-storage request wait until the
// browser is idle so they do not compete with first paint.
function startBackgroundWork() {
  const kick = () => {
    void requestPersistentStorage();
    void ensureEcdictLoaded();
    if (location.protocol !== "file:" && "serviceWorker" in navigator) {
      const swUrl = `${import.meta.env.BASE_URL}sw.js`;
      void navigator.serviceWorker.register(swUrl).catch((err) => {
        console.warn("[pwa] service worker registration failed", err);
      });
    }
  };
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void }).requestIdleCallback;
  if (typeof idle === "function") idle(kick, { timeout: 2000 });
  else window.addEventListener("load", () => { window.setTimeout(kick, 400); });
}
startBackgroundWork();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
