import { useEffect, useState } from "react";

export function PwaStatus() {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [online, setOnline] = useState(globalThis.navigator?.onLine ?? true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    const handleInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    globalThis.addEventListener("online", handleOnline);
    globalThis.addEventListener("offline", handleOffline);
    globalThis.addEventListener("beforeinstallprompt", handleInstallPrompt);
    return () => {
      globalThis.removeEventListener("online", handleOnline);
      globalThis.removeEventListener("offline", handleOffline);
      globalThis.removeEventListener("beforeinstallprompt", handleInstallPrompt);
    };
  }, []);

  async function installApp() {
    if (!installPrompt) return;
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      setMessage(choice.outcome === "accepted" ? "App installed." : "Install dismissed.");
    } catch (cause) {
      setMessage(`Install prompt failed. ${cause instanceof Error ? cause.message : String(cause)}`);
    } finally {
      setInstallPrompt(null);
    }
  }

  return (
    <div className="pwa-status">
      {!online && <span role="status">Offline · saved editor data is still available</span>}
      {installPrompt && (
        <button type="button" onClick={installApp}>Install app</button>
      )}
      {message && <span role="status">{message}</span>}
    </div>
  );
}
