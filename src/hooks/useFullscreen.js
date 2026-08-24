import { useCallback, useEffect, useState } from "react";

export const useFullscreen = () => {
  const [isFullscreen, setIsFullscreen] = useState(() => typeof document !== "undefined" && Boolean(document.fullscreenElement));
  const [error, setError] = useState("");
  const supported = typeof document !== "undefined"
    && typeof document.documentElement?.requestFullscreen === "function"
    && typeof document.exitFullscreen === "function";

  useEffect(() => {
    if (!supported) return undefined;
    const syncState = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
      if (document.fullscreenElement) setError("");
    };
    const reportError = () => setError("Full screen was blocked by the browser. Use the button again from this tab.");
    document.addEventListener("fullscreenchange", syncState);
    document.addEventListener("fullscreenerror", reportError);
    return () => {
      document.removeEventListener("fullscreenchange", syncState);
      document.removeEventListener("fullscreenerror", reportError);
    };
  }, [supported]);

  const toggleFullscreen = useCallback(async () => {
    if (!supported) {
      setError("This browser does not provide an app full-screen control.");
      return false;
    }
    try {
      setError("");
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen({ navigationUI: "hide" });
      return true;
    } catch (reason) {
      setError(reason?.message || "Full screen was blocked by the browser.");
      return false;
    }
  }, [supported]);

  return { supported, isFullscreen, error, toggleFullscreen };
};
