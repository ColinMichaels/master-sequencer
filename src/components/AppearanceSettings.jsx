import React from "react";
import { CheckIcon, MoonIcon, PaletteIcon, RefreshIcon, SunIcon } from "./Icons.jsx";
import {
  adjustTextScale,
  APPEARANCE_MODES,
  COLOR_THEMES,
  DEFAULT_APPEARANCE,
  DEFAULT_STUDIO_APPEARANCE,
  FONT_THEMES,
  STUDIO_ATMOSPHERES,
  STUDIO_LIGHTS,
  STUDIO_MATERIALS,
  TEXT_SCALES,
  textScaleLabel,
} from "../lib/appearance.js";

function StudioChoiceGroup({ label, options, value, field, onChange }) {
  return (
    <div className="studio-choice-group" role="group" aria-label={label}>
      <span>{label}</span>
      <div className="studio-choice-options">
        {options.map((option) => (
          <button key={option.id} type="button" className={value === option.id ? "is-selected" : ""} aria-pressed={value === option.id} onClick={() => onChange({ [field]: option.id })}>
            <i className={`studio-choice-swatch studio-choice-swatch--${option.id}`} aria-hidden="true" />
            <span><strong>{option.label}</strong><small>{option.description}</small></span>
            {value === option.id ? <CheckIcon /> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

export function AppearanceSettings({ appearance, resolvedMode, onChange }) {
  return (
    <section className="settings-section appearance-settings" id="appearance-settings">
      <div className="settings-section-heading">
        <div><h3>Screen Appearance</h3><p>Preview changes instantly. Your choice is saved with this local project.</p></div>
        <button type="button" className="text-button" onClick={() => onChange(DEFAULT_APPEARANCE)}><RefreshIcon /> Reset Original</button>
      </div>

      <div className="appearance-layout">
        <div className="appearance-controls-grid">
          <fieldset className="appearance-group">
            <legend>Light and dark mode</legend>
            <div className="mode-switch" role="group" aria-label="Appearance mode">
              {APPEARANCE_MODES.map((option) => (
                <button key={option.id} type="button" className={appearance.mode === option.id ? "is-selected" : ""} aria-pressed={appearance.mode === option.id} onClick={() => onChange({ mode: option.id })}>
                  {option.id === "light" ? <SunIcon /> : option.id === "dark" ? <MoonIcon /> : <PaletteIcon />}
                  <span><strong>{option.label}</strong><small>{option.description}</small></span>
                </button>
              ))}
            </div>
            <p className="appearance-resolution">Currently showing <strong>{resolvedMode}</strong> mode.</p>
          </fieldset>

          <fieldset className="appearance-group">
            <legend>Text size</legend>
            <div className="text-size-control">
              <button type="button" disabled={appearance.textScale === TEXT_SCALES[0]} onClick={() => onChange({ textScale: adjustTextScale(appearance.textScale, -1) })} aria-label="Decrease text size">A−</button>
              <div><strong>{textScaleLabel(appearance.textScale)}</strong><small>Interface text and controls</small></div>
              <button type="button" disabled={appearance.textScale === TEXT_SCALES.at(-1)} onClick={() => onChange({ textScale: adjustTextScale(appearance.textScale, 1) })} aria-label="Increase text size">A+</button>
            </div>
            <div className="text-scale-steps" aria-label="Choose text size">
              {TEXT_SCALES.map((scale) => <button key={scale} type="button" className={appearance.textScale === scale ? "is-selected" : ""} aria-pressed={appearance.textScale === scale} onClick={() => onChange({ textScale: scale })}>{Math.round(scale * 100)}</button>)}
            </div>
          </fieldset>

          <fieldset className="appearance-group appearance-group--wide">
            <legend>Color theme</legend>
            <div className="color-theme-grid">
              {COLOR_THEMES.map((theme) => (
                <button key={theme.id} type="button" className={appearance.colorTheme === theme.id ? "is-selected" : ""} aria-pressed={appearance.colorTheme === theme.id} onClick={() => onChange({ colorTheme: theme.id })}>
                  <span className={`theme-swatch theme-swatch--${theme.id}`} aria-hidden="true"><i /><i /><i /></span>
                  <span><strong>{theme.label}</strong><small>{theme.description}</small></span>
                  {appearance.colorTheme === theme.id ? <CheckIcon /> : null}
                </button>
              ))}
            </div>
          </fieldset>

          {["studio", "dusty-studio"].includes(appearance.colorTheme) ? (
            <fieldset className="appearance-group appearance-group--wide studio-customizer">
              <legend>Studio character</legend>
              <div className="studio-customizer-heading">
                <div><strong>Shape the control room</strong><small>Material, signal light, and atmosphere are saved with this project.</small></div>
                <button type="button" className="text-button" onClick={() => onChange(DEFAULT_STUDIO_APPEARANCE)}><RefreshIcon /> Reset Studio</button>
              </div>
              <div className="studio-customizer-grid">
                <StudioChoiceGroup label="Console material" options={STUDIO_MATERIALS} value={appearance.studioMaterial} field="studioMaterial" onChange={onChange} />
                <StudioChoiceGroup label="Signal light" options={STUDIO_LIGHTS} value={appearance.studioLight} field="studioLight" onChange={onChange} />
                <StudioChoiceGroup label="Room atmosphere" options={STUDIO_ATMOSPHERES} value={appearance.studioAtmosphere} field="studioAtmosphere" onChange={onChange} />
              </div>
            </fieldset>
          ) : null}

          <fieldset className="appearance-group appearance-group--wide">
            <legend>Font pairing</legend>
            <div className="font-theme-grid">
              {FONT_THEMES.map((theme) => (
                <button key={theme.id} type="button" className={`${appearance.fontTheme === theme.id ? "is-selected" : ""} font-option--${theme.id}`} aria-pressed={appearance.fontTheme === theme.id} onClick={() => onChange({ fontTheme: theme.id })}>
                  <span className="font-option-sample">{theme.sample}</span>
                  <span><strong>{theme.label}</strong><small>{theme.description}</small></span>
                  {appearance.fontTheme === theme.id ? <CheckIcon /> : null}
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        <aside className="appearance-preview" aria-label="Appearance preview">
          <span className="preview-kicker">Live Preview · {resolvedMode}</span>
          <h4>No Planet to Call Home</h4>
          <p>Sequence candidate 07 with an immediate view of contrast, hierarchy, and readable body copy.</p>
          <div className="preview-track"><strong>07</strong><span><b>Title Track</b><small>Master candidate pending</small></span><em>04:23</em></div>
          <div className="preview-signals"><span>Approved</span><span>Review</span><span>Missing</span></div>
          <button type="button" tabIndex={-1}>Primary Action</button>
        </aside>
      </div>
    </section>
  );
}
