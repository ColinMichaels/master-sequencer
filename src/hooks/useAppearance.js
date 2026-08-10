import { useEffect, useState } from "react";
import { normalizeAppearance, resolveAppearanceMode } from "../lib/appearance.js";

const systemPrefersDark = () => typeof window === "undefined" || !window.matchMedia
  ? true
  : window.matchMedia("(prefers-color-scheme: dark)").matches;

export function useAppearance(settings) {
  const appearance = normalizeAppearance(settings);
  const [prefersDark, setPrefersDark] = useState(systemPrefersDark);

  useEffect(() => {
    if (appearance.mode !== "system" || !window.matchMedia) return undefined;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const updatePreference = (event) => setPrefersDark(event.matches);
    setPrefersDark(media.matches);
    media.addEventListener("change", updatePreference);
    return () => media.removeEventListener("change", updatePreference);
  }, [appearance.mode]);

  const resolvedMode = resolveAppearanceMode(appearance.mode, prefersDark);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.mode = resolvedMode;
    root.dataset.theme = appearance.colorTheme;
    root.dataset.font = appearance.fontTheme;
    root.style.setProperty("--text-scale", String(appearance.textScale));
    root.style.colorScheme = resolvedMode;
  }, [appearance.colorTheme, appearance.fontTheme, appearance.textScale, resolvedMode]);

  return { appearance, resolvedMode };
}
