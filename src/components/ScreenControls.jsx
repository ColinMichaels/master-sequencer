import React from "react";
import { MoonIcon, PaletteIcon, SunIcon } from "./Icons.jsx";
import { adjustTextScale, TEXT_SCALES, textScaleLabel } from "../lib/appearance.js";

export function ScreenControls({ appearance, resolvedMode, onChange, onOpenSettings }) {
  const atMinimum = appearance.textScale === TEXT_SCALES[0];
  const atMaximum = appearance.textScale === TEXT_SCALES.at(-1);
  const lightTarget = resolvedMode === "dark";

  return (
    <div className="screen-controls" role="group" aria-label="Screen controls">
      <button type="button" disabled={atMinimum} onClick={() => onChange({ textScale: adjustTextScale(appearance.textScale, -1) })} aria-label="Decrease text size" title="Decrease text size">A−</button>
      <output aria-live="polite" aria-label={`Text size ${textScaleLabel(appearance.textScale)}`}>{textScaleLabel(appearance.textScale)}</output>
      <button type="button" disabled={atMaximum} onClick={() => onChange({ textScale: adjustTextScale(appearance.textScale, 1) })} aria-label="Increase text size" title="Increase text size">A+</button>
      <button type="button" onClick={() => onChange({ mode: lightTarget ? "light" : "dark" })} aria-label={`Use ${lightTarget ? "light" : "dark"} mode`} title={`Use ${lightTarget ? "light" : "dark"} mode`}>
        {lightTarget ? <SunIcon /> : <MoonIcon />}
      </button>
      <button type="button" onClick={onOpenSettings} aria-label="Open appearance settings" title="Colors and fonts"><PaletteIcon /></button>
    </div>
  );
}
