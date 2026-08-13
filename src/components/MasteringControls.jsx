import React, { useEffect, useMemo, useRef, useState } from "react";
import { MASTER_BUS_DEFAULTS, MASTERING_LIMITS } from "../lib/mastering.js";
import { handleOptionReset, handleOptionResetKey, hasResetDefault, optionResetTitle } from "../lib/option-reset.js";
import { compressorGainReductionDb, equalizerLiveImpact, equalizerResponseDbAtFrequency, MAX_LIVE_COMPRESSOR_REDUCTION_DB, MAX_LIVE_LIMITER_REDUCTION_DB } from "../lib/live-mastering.js";
import { MasterOutputMeters } from "./MasterOutputMeters.jsx";
import { MasteringPresetControls } from "./MasteringPresetControls.jsx";

export function MasteringNumberField({ label, value, defaultValue, minimum = 0, maximum, step = 0.1, suffix = "seconds", onCommit, disabled = false }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);
  const commit = () => {
    const parsed = Number(draft);
    if (Number.isFinite(parsed)) onCommit(Math.min(maximum ?? parsed, Math.max(minimum, parsed)));
    else setDraft(String(value));
  };
  const reset = (nextValue) => { setDraft(String(nextValue)); onCommit(nextValue); };
  const resetOptions = { defaultValue, disabled, onReset: reset };
  return <label className="mastering-number-field"><span>{label}</span><div><input type="number" min={minimum} max={maximum} step={step} value={draft} disabled={disabled} data-option-reset={hasResetDefault(defaultValue) ? "true" : undefined} data-default-value={hasResetDefault(defaultValue) ? String(defaultValue) : undefined} title={optionResetTitle(defaultValue)} aria-keyshortcuts={hasResetDefault(defaultValue) ? "Alt+Enter" : undefined} onPointerDown={(event) => handleOptionReset(event, resetOptions)} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (handleOptionResetKey(event, resetOptions)) return; if (event.key === "Enter") event.currentTarget.blur(); }} /><small>{suffix}</small></div></label>;
}

const NumberField = ({ limits, minimum, maximum, ...props }) => (
  <MasteringNumberField minimum={limits?.minimum ?? minimum} maximum={limits?.maximum ?? maximum} {...props} />
);

const EMPTY_PRESET_LIBRARY = Object.freeze({});

export const ModuleSwitch = ({ label, checked, defaultChecked, disabled = false, onChange }) => (
  <label className={`master-module-switch ${checked ? "is-enabled" : ""}`} data-tooltip={checked ? label.replace(/^Enable/, "Disable") : label}>
    <input type="checkbox" checked={checked} disabled={disabled} aria-label={label} data-option-reset={hasResetDefault(defaultChecked) ? "true" : undefined} data-default-value={hasResetDefault(defaultChecked) ? String(defaultChecked) : undefined} title={optionResetTitle(defaultChecked)} aria-keyshortcuts={hasResetDefault(defaultChecked) ? "Alt+Enter" : undefined} onClick={(event) => handleOptionReset(event, { defaultValue: defaultChecked, disabled, onReset: onChange })} onKeyDown={(event) => handleOptionResetKey(event, { defaultValue: defaultChecked, disabled, onReset: onChange })} onChange={(event) => onChange(event.target.checked)} />
    <span aria-hidden="true"><i /></span>
  </label>
);

export function MasteringSelectField({ label, value, defaultValue, options, disabled = false, onChange }) {
  const resetOptions = { defaultValue, disabled, onReset: onChange };
  return (
    <label className="master-select-field">
      <span>{label}</span>
      <select value={value} disabled={disabled} data-option-reset={hasResetDefault(defaultValue) ? "true" : undefined} data-default-value={hasResetDefault(defaultValue) ? String(defaultValue) : undefined} title={optionResetTitle(defaultValue)} aria-keyshortcuts={hasResetDefault(defaultValue) ? "Alt+Enter" : undefined} onPointerDown={(event) => handleOptionReset(event, resetOptions)} onKeyDown={(event) => handleOptionResetKey(event, resetOptions)} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

const normalizedValue = (value, minimum, maximum, scale = "linear") => {
  if (scale === "log") {
    return (Math.log(value) - Math.log(minimum)) / (Math.log(maximum) - Math.log(minimum));
  }
  return (value - minimum) / (maximum - minimum);
};

const valueFromPosition = (position, minimum, maximum, scale = "linear") => {
  if (scale === "log") return Math.exp(Math.log(minimum) + position * (Math.log(maximum) - Math.log(minimum)));
  return minimum + position * (maximum - minimum);
};

const displayControlValue = (value, suffix, precision) => {
  const number = Number(value);
  const digits = precision ?? (Math.abs(number) >= 100 ? 0 : Math.abs(number) >= 10 ? 1 : 2);
  const separator = suffix?.startsWith(":") ? "" : " ";
  return `${number.toFixed(digits)}${suffix ? `${separator}${suffix}` : ""}`;
};

const angleFromDialMarks = (value, dialMarks, fallback) => {
  if (!dialMarks?.length) return fallback;
  const marks = [...dialMarks].sort((left, right) => left.value - right.value);
  if (value <= marks[0].value) return marks[0].angle;
  if (value >= marks.at(-1).value) return marks.at(-1).angle;
  const upperIndex = marks.findIndex((mark) => mark.value >= value);
  const lower = marks[upperIndex - 1];
  const upper = marks[upperIndex];
  const progress = (value - lower.value) / (upper.value - lower.value);
  return lower.angle + progress * (upper.angle - lower.angle);
};

export function RotaryControl({ label, value, defaultValue, limits, minimum, maximum, step = 0.1, suffix = "", precision, scale = "linear", dialMarks, disabled = false, compact = false, className = "", onChange }) {
  const [adjusting, setAdjusting] = useState(false);
  const min = limits?.minimum ?? minimum;
  const max = limits?.maximum ?? maximum;
  const safeValue = clamp(Number(value), min, max);
  const position = clamp(normalizedValue(safeValue, min, max, scale), 0, 1);
  const angle = angleFromDialMarks(safeValue, dialMarks, -135 + position * 270);
  const rangeStep = scale === "log" ? 0.001 : step;
  const rangeValue = scale === "log" ? position : safeValue;
  const rangeMin = scale === "log" ? 0 : min;
  const rangeMax = scale === "log" ? 1 : max;
  const displayValue = displayControlValue(safeValue, suffix, precision);
  const defaultDisplayValue = hasResetDefault(defaultValue) ? displayControlValue(defaultValue, suffix, precision) : undefined;
  const resetOptions = { defaultValue, disabled, onReset: onChange };
  const isAdjustmentKey = (key) => ["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp", "End", "Home", "PageDown", "PageUp"].includes(key);
  const change = (event) => {
    const raw = Number(event.target.value);
    const next = scale === "log" ? valueFromPosition(raw, min, max, scale) : raw;
    const rounded = step >= 1 ? Math.round(next / step) * step : Number(next.toFixed(Math.max(0, String(step).split(".")[1]?.length || 0)));
    onChange(clamp(rounded, min, max));
  };

  return (
    <label className={`rotary-control ${compact ? "rotary-control--compact" : ""} ${disabled ? "is-disabled" : ""} ${adjusting ? "is-adjusting" : ""} ${className}`} style={{ "--knob-angle": `${angle}deg` }} data-control-value={displayValue} data-knob-angle={Number(angle.toFixed(2))}>
      <span className="rotary-control-label">{label}</span>
      <span className="rotary-knob-wrap">
        <span className="rotary-ticks" aria-hidden="true" />
        <span className="rotary-knob" aria-hidden="true"><i /></span>
        <input
          type="range"
          draggable="false"
          min={rangeMin}
          max={rangeMax}
          step={rangeStep}
          value={rangeValue}
          disabled={disabled}
          aria-label={`${label} graphical control`}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={safeValue}
          aria-valuetext={displayValue}
          data-option-reset={hasResetDefault(defaultValue) ? "true" : undefined}
          data-default-value={hasResetDefault(defaultValue) ? String(defaultValue) : undefined}
          title={optionResetTitle(defaultValue, defaultDisplayValue)}
          aria-keyshortcuts={hasResetDefault(defaultValue) ? "Alt+Enter" : undefined}
          onDragStart={(event) => event.preventDefault()}
          onPointerDown={(event) => { if (!handleOptionReset(event, resetOptions)) setAdjusting(true); }}
          onPointerUp={() => setAdjusting(false)}
          onPointerCancel={() => setAdjusting(false)}
          onKeyDown={(event) => { if (handleOptionResetKey(event, resetOptions)) return; if (isAdjustmentKey(event.key)) setAdjusting(true); }}
          onKeyUp={(event) => { if (isAdjustmentKey(event.key)) setAdjusting(false); }}
          onBlur={() => setAdjusting(false)}
          onChange={change}
        />
      </span>
      <output aria-live="off">{displayValue}</output>
    </label>
  );
}

const pathFromValues = (values, width, height, minimum, maximum) => values.map((value, index) => {
  const x = (index / (values.length - 1)) * width;
  const y = height - ((clamp(value, minimum, maximum) - minimum) / (maximum - minimum)) * height;
  return `${index ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`;
}).join(" ");

const areaFromValues = (values, width, height, minimum, maximum, baseline = 0) => {
  const baselineY = height - ((clamp(baseline, minimum, maximum) - minimum) / (maximum - minimum)) * height;
  return `${pathFromValues(values, width, height, minimum, maximum)} L${width},${baselineY.toFixed(2)} L0,${baselineY.toFixed(2)} Z`;
};

function CurveFrame({ className, label, path, horizontalLabels, verticalLabels, markerX, markerY, status = "Settings curve", figureProps, children }) {
  return (
    <figure {...figureProps} className={`settings-curve ${className || ""}`}>
      <svg viewBox="0 0 200 112" role="img" aria-label={label} preserveAspectRatio="none">
        <g className="settings-curve-grid" aria-hidden="true">
          {[0, 50, 100, 150, 200].map((x) => <line key={`x-${x}`} x1={x} y1="0" x2={x} y2="112" />)}
          {[0, 28, 56, 84, 112].map((y) => <line key={`y-${y}`} x1="0" y1={y} x2="200" y2={y} />)}
        </g>
        <line className="settings-curve-zero" x1="0" y1="56" x2="200" y2="56" aria-hidden="true" />
        {children}
        {markerX !== undefined && <line className="settings-curve-marker" x1={markerX} y1="0" x2={markerX} y2="112" aria-hidden="true" />}
        {markerY !== undefined && <line className="settings-curve-marker" x1="0" y1={markerY} x2="200" y2={markerY} aria-hidden="true" />}
        <path className="settings-curve-line" d={path} />
      </svg>
      <figcaption><span>{verticalLabels}</span><strong>{status}</strong><span>{horizontalLabels}</span></figcaption>
    </figure>
  );
}

const LIVE_EFFECT_SAMPLE_MS = 80;
const EQ_LIVE_POINT_COUNT = 81;
const IDLE_EQ_VALUES = Object.freeze(Array.from({ length: EQ_LIVE_POINT_COUNT }, () => 0));
const IDLE_EQ_IMPACT = Object.freeze({ values: IDLE_EQ_VALUES, activity: IDLE_EQ_VALUES, impactDb: 0 });

function useLiveEqImpact({ active, meteringRef, eq }) {
  const [impact, setImpact] = useState(() => IDLE_EQ_IMPACT);
  const dataRef = useRef(null);
  const signatureRef = useRef("");

  useEffect(() => {
    if (!active) {
      dataRef.current = null;
      signatureRef.current = "";
      setImpact((current) => current === IDLE_EQ_IMPACT ? current : IDLE_EQ_IMPACT);
      return undefined;
    }
    const sample = () => {
      const analyser = meteringRef?.current?.eqInputAnalyser;
      if (!analyser || typeof analyser.getFloatFrequencyData !== "function") return;
      if (dataRef.current?.length !== analyser.frequencyBinCount) dataRef.current = new Float32Array(analyser.frequencyBinCount);
      analyser.getFloatFrequencyData(dataRef.current);
      const next = equalizerLiveImpact({ frequencyData: dataRef.current, sampleRate: meteringRef.current?.sampleRate, eq, pointCount: EQ_LIVE_POINT_COUNT });
      const signature = `${next.impactDb.toFixed(2)}:${next.values.filter((_, index) => index % 8 === 0).map((value) => value.toFixed(2)).join(":")}:${next.activity.filter((_, index) => index % 8 === 0).map((value) => value.toFixed(2)).join(":")}`;
      if (signature === signatureRef.current) return;
      signatureRef.current = signature;
      setImpact(next);
    };
    sample();
    const interval = window.setInterval(sample, LIVE_EFFECT_SAMPLE_MS);
    return () => window.clearInterval(interval);
  }, [active, eq, meteringRef]);

  return impact;
}

export function EqResponseGraph({ eq, meteringRef, active }) {
  const liveImpact = useLiveEqImpact({ active, meteringRef, eq });
  const values = useMemo(() => Array.from({ length: EQ_LIVE_POINT_COUNT }, (_, index) => {
    const frequency = 20 * (1_000 ** (index / (EQ_LIVE_POINT_COUNT - 1)));
    return equalizerResponseDbAtFrequency(eq, frequency);
  }), [eq]);
  const status = active ? `Live impact ${liveImpact.impactDb.toFixed(1)} dB` : "EQ idle";
  return (
    <CurveFrame
      className={`settings-curve--eq ${active ? "is-live" : ""}`}
      label={`MASTER EQ response settings curve. ${active ? `Live signal weighted impact ${liveImpact.impactDb.toFixed(1)} decibels` : "Live impact idle"}`}
      path={pathFromValues(values, 200, 112, -12, 12)}
      horizontalLabels="20 Hz — 20 kHz"
      verticalLabels="+12 / −12 dB"
      status={status}
      figureProps={{
        "data-testid": "eq-live-impact",
        "data-live-active": active ? "true" : "false",
        "data-impact-db": liveImpact.impactDb.toFixed(2),
      }}
    >
      <path className="eq-live-spectrum-area" d={areaFromValues(liveImpact.activity || IDLE_EQ_VALUES, 200, 112, 0, 1)} aria-hidden="true" />
      <path className="eq-live-spectrum-line" d={pathFromValues(liveImpact.activity || IDLE_EQ_VALUES, 200, 112, 0, 1)} aria-hidden="true" />
      <path className="eq-live-impact-area" d={areaFromValues(liveImpact.values, 200, 112, -12, 12)} aria-hidden="true" />
      <path className="eq-live-impact-line" d={pathFromValues(liveImpact.values, 200, 112, -12, 12)} aria-hidden="true" />
    </CurveFrame>
  );
}

function useLiveGainReduction({ active, meteringRef, nodeKey }) {
  const [reductionDb, setReductionDb] = useState(0);
  const displayedRef = useRef(0);

  useEffect(() => {
    if (!active) {
      displayedRef.current = 0;
      setReductionDb((current) => current === 0 ? current : 0);
      return undefined;
    }
    const sample = () => {
      const next = compressorGainReductionDb(meteringRef?.current?.[nodeKey]?.reduction);
      if (Math.abs(next - displayedRef.current) < 0.05) return;
      displayedRef.current = next;
      setReductionDb(next);
    };
    sample();
    const interval = window.setInterval(sample, LIVE_EFFECT_SAMPLE_MS);
    return () => window.clearInterval(interval);
  }, [active, meteringRef, nodeKey]);

  return reductionDb;
}

export function HardwareGainReductionMeter({ meteringRef, meterNodeKey = "compressor", active, variant = "" }) {
  const reductionDb = useLiveGainReduction({ active, meteringRef, nodeKey: meterNodeKey });
  const displayReduction = clamp(reductionDb, 0, 20);
  // The photographed scale places 0 dB at +14° and 20 dB at −34° from vertical.
  const needleAngle = 14 - (displayReduction / 20) * 48;
  return (
    <div
      className={`premium-vu ${variant ? `premium-vu--${variant}` : ""} ${active ? "is-live" : ""}`}
      role="meter"
      aria-label={`Gain reduction ${displayReduction.toFixed(1)} decibels`}
      aria-valuemin="0"
      aria-valuemax="20"
      aria-valuenow={displayReduction.toFixed(1)}
      style={{ "--vu-needle-angle": `${needleAngle}deg` }}
    >
      <span>GAIN REDUCTION</span>
      <div className="premium-vu-scale" aria-hidden="true"><i>20</i><i>10</i><i>5</i><i>3</i><i>1</i><i>0</i></div>
      <b className="premium-vu-needle premium-vu-needle--left" aria-hidden="true" />
      {variant === "mockup-dual" ? <b className="premium-vu-needle premium-vu-needle--right" aria-hidden="true" /> : null}
      <em aria-hidden="true" />
      <output>{active ? `−${displayReduction.toFixed(1)} dB` : "GR IDLE"}</output>
    </div>
  );
}

const LIMITER_LED_THRESHOLDS = Object.freeze([30, 20, 15, 10, 7, 5, 3, 2, 1, 0.5, 0.1]);

export function HardwareGainReductionLeds({ meteringRef, meterNodeKey = "limiter", active }) {
  const reductionDb = useLiveGainReduction({ active, meteringRef, nodeKey: meterNodeKey });
  const displayReduction = clamp(reductionDb, 0, LIMITER_LED_THRESHOLDS[0]);
  return (
    <div className={`premium-gr-leds ${active ? "is-live" : ""}`} role="meter" aria-label={`Limiter gain reduction ${displayReduction.toFixed(1)} decibels`} aria-valuemin="0" aria-valuemax={LIMITER_LED_THRESHOLDS[0]} aria-valuenow={displayReduction.toFixed(1)}>
      {LIMITER_LED_THRESHOLDS.map((threshold) => <i key={threshold} className={displayReduction >= threshold ? "is-lit" : ""} aria-hidden="true" />)}
    </div>
  );
}

export function CompressorTransferGraph({ compressor, meteringRef, active, meterNodeKey = "compressor" }) {
  const reductionDb = useLiveGainReduction({ active, meteringRef, nodeKey: meterNodeKey });
  const values = Array.from({ length: 61 }, (_, index) => {
    const input = -60 + index;
    const compressed = input <= compressor.thresholdDb
      ? input
      : compressor.thresholdDb + (input - compressor.thresholdDb) / compressor.ratio;
    return input * (1 - compressor.mix) + (compressed + compressor.makeupGainDb) * compressor.mix;
  });
  const markerX = ((compressor.thresholdDb + 60) / 60) * 200;
  const reductionHeight = (clamp(reductionDb, 0, MAX_LIVE_COMPRESSOR_REDUCTION_DB) / MAX_LIVE_COMPRESSOR_REDUCTION_DB) * 112;
  const reductionY = 112 - reductionHeight;
  const status = active ? `Live GR −${reductionDb.toFixed(1)} dB` : "GR idle";
  return (
    <CurveFrame
      className={`settings-curve--compressor ${active ? "is-live" : ""}`}
      label={`MASTER compressor input output settings curve. ${active ? `Live gain reduction ${reductionDb.toFixed(1)} decibels` : "Gain reduction idle"}`}
      path={pathFromValues(values, 200, 112, -60, 0)}
      horizontalLabels="Input −60 — 0 dB"
      verticalLabels="Output"
      markerX={markerX}
      status={status}
      figureProps={{
        "data-testid": "compressor-gain-reduction",
        "data-live-active": active ? "true" : "false",
        "data-reduction-db": reductionDb.toFixed(2),
      }}
    >
      <path className="settings-curve-reference" d="M0,112 L200,0" />
      <g className="compressor-gain-reduction" aria-hidden="true">
        <rect className="compressor-gain-reduction-track" x="189" y="0" width="8" height="112" />
        <rect className="compressor-gain-reduction-fill" x="189" y={reductionY} width="8" height={reductionHeight} />
        {active ? <line className="compressor-gain-reduction-marker" x1="183" y1={reductionY} x2="200" y2={reductionY} /> : null}
      </g>
    </CurveFrame>
  );
}

export function LimiterTransferGraph({ limiter, meteringRef, active, meterNodeKey = "limiter" }) {
  const reductionDb = useLiveGainReduction({ active, meteringRef, nodeKey: meterNodeKey });
  const values = Array.from({ length: 61 }, (_, index) => Math.min(-60 + index, limiter.ceilingDbfs));
  const markerY = 112 - ((limiter.ceilingDbfs + 60) / 60) * 112;
  const reductionHeight = (clamp(reductionDb, 0, MAX_LIVE_LIMITER_REDUCTION_DB) / MAX_LIVE_LIMITER_REDUCTION_DB) * 112;
  const reductionY = 112 - reductionHeight;
  const status = active ? `Live limit −${reductionDb.toFixed(1)} dB` : "Limiter idle";
  return (
    <CurveFrame
      className={`settings-curve--limiter ${active ? "is-live" : ""}`}
      label={`MASTER limiter ceiling settings curve. ${active ? `Live gain reduction ${reductionDb.toFixed(1)} decibels` : "Gain reduction idle"}`}
      path={pathFromValues(values, 200, 112, -60, 0)}
      horizontalLabels="Input −60 — 0 dBFS"
      verticalLabels="Output"
      markerY={markerY}
      status={status}
      figureProps={{
        "data-testid": "limiter-gain-reduction",
        "data-live-active": active ? "true" : "false",
        "data-reduction-db": reductionDb.toFixed(2),
      }}
    >
      <path className="settings-curve-reference" d="M0,112 L200,0" />
      <g className="limiter-gain-reduction" aria-hidden="true">
        <rect className="limiter-gain-reduction-track" x="189" y="0" width="8" height="112" />
        <rect className="limiter-gain-reduction-fill" x="189" y={reductionY} width="8" height={reductionHeight} />
        {active ? <line className="limiter-gain-reduction-marker" x1="183" y1={reductionY} x2="200" y2={reductionY} /> : null}
      </g>
    </CurveFrame>
  );
}

export const ManualValues = ({ children }) => (
  <details className="manual-control-bank">
    <summary><strong>Exact values</strong><small><span>Show text controls</span><span>Hide text controls</span></small></summary>
    <div className="manual-control-content">{children}</div>
  </details>
);

export function TrackLevelControl({ value, onChange }) {
  const limits = MASTERING_LIMITS.trackGainDb;
  return (
    <section className="mastering-control-section track-level-control">
      <div className="mastering-section-title">
        <span className="signal-badge" aria-hidden="true">TRK</span>
        <div><h3>Track Level</h3><p>Applied to this track before fades, transitions, and the album MASTER bus.</p></div>
      </div>
      <div className="track-level-console">
        <label className="track-level-fader"><span>Track level fader</span><input type="range" min={limits.minimum} max={limits.maximum} step="0.1" value={value} data-option-reset="true" data-default-value="0" title="Option-click to reset to 0 dB" aria-keyshortcuts="Alt+Enter" onPointerDown={(event) => handleOptionReset(event, { defaultValue: 0, onReset: onChange })} onKeyDown={(event) => handleOptionResetKey(event, { defaultValue: 0, onReset: onChange })} onChange={(event) => onChange(Number(event.target.value))} /><small>{Number(value).toFixed(1)} dB</small></label>
        <NumberField label="Track gain" value={Number(value).toFixed(1)} defaultValue={0} limits={limits} step={0.1} suffix="dB" onCommit={onChange} />
      </div>
    </section>
  );
}

export function MasterBusControls({ bus, presets = EMPTY_PRESET_LIBRARY, onChange, onReset, onSavePreset, onLoadPreset, onDeletePreset, meteringRef, meteringAvailable, playing, liveProcessing = false, monitorLabel }) {
  const processors = useMemo(() => [
    bus.eq.enabled && "EQ",
    bus.compressor.enabled && "Compressor",
    Math.abs(bus.outputGainDb) > 0.0001 && "Output gain",
    bus.limiter.enabled && "Limiter",
  ].filter(Boolean), [bus]);
  const status = bus.bypass
    ? "Bypassed"
    : processors.length
      ? `${processors.length} processor${processors.length === 1 ? "" : "s"} active`
      : "Neutral pass-through";
  const eqDisabled = bus.bypass || !bus.eq.enabled;
  const compressorDisabled = bus.bypass || !bus.compressor.enabled;
  const limiterDisabled = bus.bypass || !bus.limiter.enabled;
  const meteringLive = Boolean(liveProcessing && playing && meteringAvailable !== false);
  const eqLive = meteringLive && !eqDisabled;
  const compressorLive = meteringLive && !compressorDisabled;
  const limiterLive = meteringLive && !limiterDisabled;

  return (
    <section className={`master-bus-panel ${bus.bypass ? "is-bypassed" : ""}`} aria-labelledby="master-bus-title">
      <header className="master-bus-heading">
        <div className="master-bus-title">
          <span aria-hidden="true">MASTER</span>
          <div className="master-bus-title-copy">
            <h3 id="master-bus-title">Album Master Bus</h3>
            <button type="button" className="master-bus-help" aria-label="About Album Master Bus" aria-describedby="master-bus-help-text">i<span id="master-bus-help-text" role="tooltip">Every preview and exported track passes through this shared chain.</span></button>
          </div>
        </div>
        <MasteringPresetControls type="master" label="MASTER chain" presets={presets.master} prominent inline onSave={onSavePreset} onLoad={onLoadPreset} onDelete={onDeletePreset} />
        <div className="master-bus-actions">
          <span className="master-bus-status">{status}</span>
          <label className={`master-bypass-switch ${bus.bypass ? "is-enabled" : ""}`}><input type="checkbox" checked={bus.bypass} data-option-reset="true" data-default-value={String(MASTER_BUS_DEFAULTS.bypass)} title="Option-click to reset MASTER bypass" aria-keyshortcuts="Alt+Enter" onClick={(event) => handleOptionReset(event, { defaultValue: MASTER_BUS_DEFAULTS.bypass, onReset: (value) => onChange(["bypass"], value) })} onKeyDown={(event) => handleOptionResetKey(event, { defaultValue: MASTER_BUS_DEFAULTS.bypass, onReset: (value) => onChange(["bypass"], value) })} onChange={(event) => onChange(["bypass"], event.target.checked)} /><span>Bypass MASTER</span></label>
          <button type="button" className="text-button" onClick={onReset}>Reset MASTER</button>
        </div>
      </header>

      <div className="master-signal-flow" aria-label="Master signal flow"><span>Album program</span><i>→</i><span>EQ</span><i>→</i><span>Compressor</span><i>→</i><span>Output</span><i>→</i><span>Limiter</span><i>→</i><span>Meter / analyzer</span><i>→</i><span>Track print</span></div>

      <MasterOutputMeters meteringRef={meteringRef} available={meteringAvailable} playing={playing} monitorLabel={monitorLabel} />

      <div className="master-module-grid">
        <section className={`master-module master-module--eq ${bus.eq.enabled ? "is-enabled" : ""}`}>
          <header><div><span>01</span><h4>Equalizer</h4></div><MasteringPresetControls type="eq" label="EQ" presets={presets.eq} inline onSave={onSavePreset} onLoad={onLoadPreset} onDelete={onDeletePreset} /><ModuleSwitch label="Enable MASTER EQ" checked={bus.eq.enabled} defaultChecked={MASTER_BUS_DEFAULTS.eq.enabled} onChange={(value) => onChange(["eq", "enabled"], value)} /></header>
          <div className="analog-faceplate analog-faceplate--eq">
            <EqResponseGraph eq={bus.eq} meteringRef={meteringRef} active={eqLive} />
            <div className="eq-band-bank">
              <section><strong>LF Shelf</strong><div><RotaryControl label="Low shelf frequency" value={bus.eq.lowShelf.frequencyHz} defaultValue={MASTER_BUS_DEFAULTS.eq.lowShelf.frequencyHz} limits={MASTERING_LIMITS.lowShelfFrequencyHz} step={1} suffix="Hz" scale="log" disabled={eqDisabled} onChange={(value) => onChange(["eq", "lowShelf", "frequencyHz"], value)} /><RotaryControl label="Low shelf gain" value={bus.eq.lowShelf.gainDb} defaultValue={MASTER_BUS_DEFAULTS.eq.lowShelf.gainDb} limits={MASTERING_LIMITS.eqGainDb} step={0.1} suffix="dB" precision={1} disabled={eqDisabled} onChange={(value) => onChange(["eq", "lowShelf", "gainDb"], value)} /></div></section>
              <section><strong>MF Bell</strong><div><RotaryControl label="Mid frequency" value={bus.eq.midBand.frequencyHz} defaultValue={MASTER_BUS_DEFAULTS.eq.midBand.frequencyHz} limits={MASTERING_LIMITS.midBandFrequencyHz} step={1} suffix="Hz" scale="log" disabled={eqDisabled} onChange={(value) => onChange(["eq", "midBand", "frequencyHz"], value)} /><RotaryControl label="Mid gain" value={bus.eq.midBand.gainDb} defaultValue={MASTER_BUS_DEFAULTS.eq.midBand.gainDb} limits={MASTERING_LIMITS.eqGainDb} step={0.1} suffix="dB" precision={1} disabled={eqDisabled} onChange={(value) => onChange(["eq", "midBand", "gainDb"], value)} /><RotaryControl label="Mid Q" value={bus.eq.midBand.q} defaultValue={MASTER_BUS_DEFAULTS.eq.midBand.q} limits={MASTERING_LIMITS.midBandQ} step={0.1} suffix="Q" precision={1} scale="log" disabled={eqDisabled} onChange={(value) => onChange(["eq", "midBand", "q"], value)} /></div></section>
              <section><strong>HF Shelf</strong><div><RotaryControl label="High shelf frequency" value={bus.eq.highShelf.frequencyHz} defaultValue={MASTER_BUS_DEFAULTS.eq.highShelf.frequencyHz} limits={MASTERING_LIMITS.highShelfFrequencyHz} step={1} suffix="Hz" scale="log" disabled={eqDisabled} onChange={(value) => onChange(["eq", "highShelf", "frequencyHz"], value)} /><RotaryControl label="High shelf gain" value={bus.eq.highShelf.gainDb} defaultValue={MASTER_BUS_DEFAULTS.eq.highShelf.gainDb} limits={MASTERING_LIMITS.eqGainDb} step={0.1} suffix="dB" precision={1} disabled={eqDisabled} onChange={(value) => onChange(["eq", "highShelf", "gainDb"], value)} /></div></section>
            </div>
          </div>
          <ManualValues><div className="master-module-fields master-module-fields--eq">
            <NumberField label="Low shelf frequency" value={bus.eq.lowShelf.frequencyHz} defaultValue={MASTER_BUS_DEFAULTS.eq.lowShelf.frequencyHz} limits={MASTERING_LIMITS.lowShelfFrequencyHz} step={1} suffix="Hz" disabled={eqDisabled} onCommit={(value) => onChange(["eq", "lowShelf", "frequencyHz"], value)} />
            <NumberField label="Low shelf gain" value={bus.eq.lowShelf.gainDb} defaultValue={MASTER_BUS_DEFAULTS.eq.lowShelf.gainDb} limits={MASTERING_LIMITS.eqGainDb} step={0.1} suffix="dB" disabled={eqDisabled} onCommit={(value) => onChange(["eq", "lowShelf", "gainDb"], value)} />
            <NumberField label="Mid frequency" value={bus.eq.midBand.frequencyHz} defaultValue={MASTER_BUS_DEFAULTS.eq.midBand.frequencyHz} limits={MASTERING_LIMITS.midBandFrequencyHz} step={1} suffix="Hz" disabled={eqDisabled} onCommit={(value) => onChange(["eq", "midBand", "frequencyHz"], value)} />
            <NumberField label="Mid gain" value={bus.eq.midBand.gainDb} defaultValue={MASTER_BUS_DEFAULTS.eq.midBand.gainDb} limits={MASTERING_LIMITS.eqGainDb} step={0.1} suffix="dB" disabled={eqDisabled} onCommit={(value) => onChange(["eq", "midBand", "gainDb"], value)} />
            <NumberField label="Mid Q" value={bus.eq.midBand.q} defaultValue={MASTER_BUS_DEFAULTS.eq.midBand.q} limits={MASTERING_LIMITS.midBandQ} step={0.1} suffix="Q" disabled={eqDisabled} onCommit={(value) => onChange(["eq", "midBand", "q"], value)} />
            <NumberField label="High shelf frequency" value={bus.eq.highShelf.frequencyHz} defaultValue={MASTER_BUS_DEFAULTS.eq.highShelf.frequencyHz} limits={MASTERING_LIMITS.highShelfFrequencyHz} step={1} suffix="Hz" disabled={eqDisabled} onCommit={(value) => onChange(["eq", "highShelf", "frequencyHz"], value)} />
            <NumberField label="High shelf gain" value={bus.eq.highShelf.gainDb} defaultValue={MASTER_BUS_DEFAULTS.eq.highShelf.gainDb} limits={MASTERING_LIMITS.eqGainDb} step={0.1} suffix="dB" disabled={eqDisabled} onCommit={(value) => onChange(["eq", "highShelf", "gainDb"], value)} />
          </div></ManualValues>
        </section>

        <section className={`master-module master-module--compressor ${bus.compressor.enabled ? "is-enabled" : ""}`}>
          <header><div><span>02</span><h4>Compressor</h4></div><MasteringPresetControls type="compressor" label="Compressor" presets={presets.compressor} inline onSave={onSavePreset} onLoad={onLoadPreset} onDelete={onDeletePreset} /><ModuleSwitch label="Enable MASTER compressor" checked={bus.compressor.enabled} defaultChecked={MASTER_BUS_DEFAULTS.compressor.enabled} onChange={(value) => onChange(["compressor", "enabled"], value)} /></header>
          <div className="analog-faceplate analog-faceplate--compressor">
            <CompressorTransferGraph compressor={bus.compressor} meteringRef={meteringRef} active={compressorLive} />
            <div className="rotary-control-bank rotary-control-bank--compressor">
              <RotaryControl label="Threshold" value={bus.compressor.thresholdDb} defaultValue={MASTER_BUS_DEFAULTS.compressor.thresholdDb} limits={MASTERING_LIMITS.compressorThresholdDb} step={0.1} suffix="dB" precision={1} disabled={compressorDisabled} onChange={(value) => onChange(["compressor", "thresholdDb"], value)} />
              <RotaryControl label="Ratio" value={bus.compressor.ratio} defaultValue={MASTER_BUS_DEFAULTS.compressor.ratio} limits={MASTERING_LIMITS.compressorRatio} step={0.1} suffix=":1" precision={1} scale="log" disabled={compressorDisabled} onChange={(value) => onChange(["compressor", "ratio"], value)} />
              <RotaryControl label="Attack" value={bus.compressor.attackMs} defaultValue={MASTER_BUS_DEFAULTS.compressor.attackMs} limits={MASTERING_LIMITS.compressorAttackMs} step={0.1} suffix="ms" scale="log" disabled={compressorDisabled} onChange={(value) => onChange(["compressor", "attackMs"], value)} />
              <RotaryControl label="Release" value={bus.compressor.releaseMs} defaultValue={MASTER_BUS_DEFAULTS.compressor.releaseMs} limits={MASTERING_LIMITS.compressorReleaseMs} step={1} suffix="ms" scale="log" disabled={compressorDisabled} onChange={(value) => onChange(["compressor", "releaseMs"], value)} />
              <RotaryControl label="Knee" value={bus.compressor.knee} defaultValue={MASTER_BUS_DEFAULTS.compressor.knee} limits={MASTERING_LIMITS.compressorKnee} step={0.1} precision={1} disabled={compressorDisabled} onChange={(value) => onChange(["compressor", "knee"], value)} />
              <RotaryControl label="Makeup gain" value={bus.compressor.makeupGainDb} defaultValue={MASTER_BUS_DEFAULTS.compressor.makeupGainDb} limits={MASTERING_LIMITS.compressorMakeupGainDb} step={0.1} suffix="dB" precision={1} disabled={compressorDisabled} onChange={(value) => onChange(["compressor", "makeupGainDb"], value)} />
              <RotaryControl label="Parallel mix" value={Math.round(bus.compressor.mix * 100)} defaultValue={Math.round(MASTER_BUS_DEFAULTS.compressor.mix * 100)} minimum={0} maximum={100} step={1} suffix="%" precision={0} disabled={compressorDisabled} onChange={(value) => onChange(["compressor", "mix"], value / 100)} />
            </div>
          </div>
          <ManualValues><div className="master-module-fields">
            <NumberField label="Threshold" value={bus.compressor.thresholdDb} defaultValue={MASTER_BUS_DEFAULTS.compressor.thresholdDb} limits={MASTERING_LIMITS.compressorThresholdDb} step={0.1} suffix="dB" disabled={compressorDisabled} onCommit={(value) => onChange(["compressor", "thresholdDb"], value)} />
            <NumberField label="Ratio" value={bus.compressor.ratio} defaultValue={MASTER_BUS_DEFAULTS.compressor.ratio} limits={MASTERING_LIMITS.compressorRatio} step={0.1} suffix=":1" disabled={compressorDisabled} onCommit={(value) => onChange(["compressor", "ratio"], value)} />
            <NumberField label="Attack" value={bus.compressor.attackMs} defaultValue={MASTER_BUS_DEFAULTS.compressor.attackMs} limits={MASTERING_LIMITS.compressorAttackMs} step={0.1} suffix="ms" disabled={compressorDisabled} onCommit={(value) => onChange(["compressor", "attackMs"], value)} />
            <NumberField label="Release" value={bus.compressor.releaseMs} defaultValue={MASTER_BUS_DEFAULTS.compressor.releaseMs} limits={MASTERING_LIMITS.compressorReleaseMs} step={1} suffix="ms" disabled={compressorDisabled} onCommit={(value) => onChange(["compressor", "releaseMs"], value)} />
            <NumberField label="Knee" value={bus.compressor.knee} defaultValue={MASTER_BUS_DEFAULTS.compressor.knee} limits={MASTERING_LIMITS.compressorKnee} step={0.1} suffix="" disabled={compressorDisabled} onCommit={(value) => onChange(["compressor", "knee"], value)} />
            <NumberField label="Makeup gain" value={bus.compressor.makeupGainDb} defaultValue={MASTER_BUS_DEFAULTS.compressor.makeupGainDb} limits={MASTERING_LIMITS.compressorMakeupGainDb} step={0.1} suffix="dB" disabled={compressorDisabled} onCommit={(value) => onChange(["compressor", "makeupGainDb"], value)} />
            <NumberField label="Parallel mix" value={Math.round(bus.compressor.mix * 100)} defaultValue={Math.round(MASTER_BUS_DEFAULTS.compressor.mix * 100)} minimum={0} maximum={100} step={1} suffix="%" disabled={compressorDisabled} onCommit={(value) => onChange(["compressor", "mix"], value / 100)} />
            <MasteringSelectField label="Detection" value={bus.compressor.detection} defaultValue={MASTER_BUS_DEFAULTS.compressor.detection} disabled={compressorDisabled} options={[{ value: "rms", label: "RMS" }, { value: "peak", label: "Peak" }]} onChange={(value) => onChange(["compressor", "detection"], value)} />
            <MasteringSelectField label="Stereo link" value={bus.compressor.link} defaultValue={MASTER_BUS_DEFAULTS.compressor.link} disabled={compressorDisabled} options={[{ value: "maximum", label: "Maximum" }, { value: "average", label: "Average" }]} onChange={(value) => onChange(["compressor", "link"], value)} />
          </div></ManualValues>
        </section>

        <section className={`master-module master-module--output ${Math.abs(bus.outputGainDb) > 0.0001 ? "is-enabled" : ""}`}>
          <header><div><span>03</span><h4>Output</h4></div><MasteringPresetControls type="output" label="Output" presets={presets.output} inline onSave={onSavePreset} onLoad={onLoadPreset} onDelete={onDeletePreset} /><small>Post compression</small></header>
          <div className="analog-faceplate analog-faceplate--output">
            <RotaryControl label="MASTER output gain" value={bus.outputGainDb} defaultValue={MASTER_BUS_DEFAULTS.outputGainDb} limits={MASTERING_LIMITS.outputGainDb} step={0.1} suffix="dB" precision={1} disabled={bus.bypass} onChange={(value) => onChange(["outputGainDb"], value)} />
            <p>Final gain before the safety limiter</p>
          </div>
          <ManualValues><div className="master-module-fields">
            <NumberField label="MASTER output gain" value={bus.outputGainDb} defaultValue={MASTER_BUS_DEFAULTS.outputGainDb} limits={MASTERING_LIMITS.outputGainDb} step={0.1} suffix="dB" disabled={bus.bypass} onCommit={(value) => onChange(["outputGainDb"], value)} />
          </div></ManualValues>
        </section>

        <section className={`master-module master-module--limiter ${bus.limiter.enabled ? "is-enabled" : ""}`}>
          <header><div><span>04</span><h4>Limiter</h4></div><MasteringPresetControls type="limiter" label="Limiter" presets={presets.limiter} inline onSave={onSavePreset} onLoad={onLoadPreset} onDelete={onDeletePreset} /><ModuleSwitch label="Enable MASTER limiter" checked={bus.limiter.enabled} defaultChecked={MASTER_BUS_DEFAULTS.limiter.enabled} onChange={(value) => onChange(["limiter", "enabled"], value)} /></header>
          <div className="analog-faceplate analog-faceplate--limiter">
            <LimiterTransferGraph limiter={bus.limiter} meteringRef={meteringRef} active={limiterLive} />
            <div className="rotary-control-bank rotary-control-bank--limiter">
              <RotaryControl compact label="Ceiling" value={bus.limiter.ceilingDbfs} defaultValue={MASTER_BUS_DEFAULTS.limiter.ceilingDbfs} limits={MASTERING_LIMITS.limiterCeilingDbfs} step={0.1} suffix="dBFS" precision={1} disabled={limiterDisabled} onChange={(value) => onChange(["limiter", "ceilingDbfs"], value)} />
              <RotaryControl compact label="Limiter attack" value={bus.limiter.attackMs} defaultValue={MASTER_BUS_DEFAULTS.limiter.attackMs} limits={MASTERING_LIMITS.limiterAttackMs} step={0.1} suffix="ms" scale="log" disabled={limiterDisabled} onChange={(value) => onChange(["limiter", "attackMs"], value)} />
              <RotaryControl compact label="Limiter release" value={bus.limiter.releaseMs} defaultValue={MASTER_BUS_DEFAULTS.limiter.releaseMs} limits={MASTERING_LIMITS.limiterReleaseMs} step={1} suffix="ms" scale="log" disabled={limiterDisabled} onChange={(value) => onChange(["limiter", "releaseMs"], value)} />
            </div>
          </div>
          <ManualValues><div className="master-module-fields">
            <NumberField label="Ceiling" value={bus.limiter.ceilingDbfs} defaultValue={MASTER_BUS_DEFAULTS.limiter.ceilingDbfs} limits={MASTERING_LIMITS.limiterCeilingDbfs} step={0.1} suffix="dBFS" disabled={limiterDisabled} onCommit={(value) => onChange(["limiter", "ceilingDbfs"], value)} />
            <NumberField label="Limiter attack" value={bus.limiter.attackMs} defaultValue={MASTER_BUS_DEFAULTS.limiter.attackMs} limits={MASTERING_LIMITS.limiterAttackMs} step={0.1} suffix="ms" disabled={limiterDisabled} onCommit={(value) => onChange(["limiter", "attackMs"], value)} />
            <NumberField label="Limiter release" value={bus.limiter.releaseMs} defaultValue={MASTER_BUS_DEFAULTS.limiter.releaseMs} limits={MASTERING_LIMITS.limiterReleaseMs} step={1} suffix="ms" disabled={limiterDisabled} onCommit={(value) => onChange(["limiter", "releaseMs"], value)} />
          </div></ManualValues>
        </section>
      </div>
    </section>
  );
}
