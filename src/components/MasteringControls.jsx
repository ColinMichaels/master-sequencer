import React, { useEffect, useMemo, useState } from "react";
import { MASTERING_LIMITS } from "../lib/mastering.js";
import { MasterOutputMeters } from "./MasterOutputMeters.jsx";

export function MasteringNumberField({ label, value, minimum = 0, maximum, step = 0.1, suffix = "seconds", onCommit, disabled = false }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);
  const commit = () => {
    const parsed = Number(draft);
    if (Number.isFinite(parsed)) onCommit(Math.min(maximum ?? parsed, Math.max(minimum, parsed)));
    else setDraft(String(value));
  };
  return <label className="mastering-number-field"><span>{label}</span><div><input type="number" min={minimum} max={maximum} step={step} value={draft} disabled={disabled} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /><small>{suffix}</small></div></label>;
}

const NumberField = ({ limits, minimum, maximum, ...props }) => (
  <MasteringNumberField minimum={limits?.minimum ?? minimum} maximum={limits?.maximum ?? maximum} {...props} />
);

const ModuleSwitch = ({ label, checked, onChange }) => (
  <label className={`master-module-switch ${checked ? "is-enabled" : ""}`}>
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    <span>{label}</span>
    <strong>{checked ? "In" : "Out"}</strong>
  </label>
);

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

function RotaryControl({ label, value, limits, minimum, maximum, step = 0.1, suffix = "", precision, scale = "linear", disabled = false, compact = false, onChange }) {
  const min = limits?.minimum ?? minimum;
  const max = limits?.maximum ?? maximum;
  const safeValue = clamp(Number(value), min, max);
  const position = clamp(normalizedValue(safeValue, min, max, scale), 0, 1);
  const angle = -135 + position * 270;
  const rangeStep = scale === "log" ? 0.001 : step;
  const rangeValue = scale === "log" ? position : safeValue;
  const rangeMin = scale === "log" ? 0 : min;
  const rangeMax = scale === "log" ? 1 : max;
  const change = (event) => {
    const raw = Number(event.target.value);
    const next = scale === "log" ? valueFromPosition(raw, min, max, scale) : raw;
    const rounded = step >= 1 ? Math.round(next / step) * step : Number(next.toFixed(Math.max(0, String(step).split(".")[1]?.length || 0)));
    onChange(clamp(rounded, min, max));
  };

  return (
    <label className={`rotary-control ${compact ? "rotary-control--compact" : ""} ${disabled ? "is-disabled" : ""}`} style={{ "--knob-angle": `${angle}deg` }}>
      <span className="rotary-control-label">{label}</span>
      <span className="rotary-knob-wrap">
        <span className="rotary-ticks" aria-hidden="true" />
        <span className="rotary-knob" aria-hidden="true"><i /></span>
        <input
          type="range"
          min={rangeMin}
          max={rangeMax}
          step={rangeStep}
          value={rangeValue}
          disabled={disabled}
          aria-label={`${label} graphical control`}
          aria-valuetext={displayControlValue(safeValue, suffix, precision)}
          onChange={change}
        />
      </span>
      <output>{displayControlValue(safeValue, suffix, precision)}</output>
    </label>
  );
}

const pathFromValues = (values, width, height, minimum, maximum) => values.map((value, index) => {
  const x = (index / (values.length - 1)) * width;
  const y = height - ((clamp(value, minimum, maximum) - minimum) / (maximum - minimum)) * height;
  return `${index ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`;
}).join(" ");

function CurveFrame({ className, label, path, horizontalLabels, verticalLabels, markerX, markerY, children }) {
  return (
    <figure className={`settings-curve ${className || ""}`}>
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
      <figcaption><span>{verticalLabels}</span><strong>Settings curve</strong><span>{horizontalLabels}</span></figcaption>
    </figure>
  );
}

function EqResponseGraph({ eq }) {
  const values = Array.from({ length: 81 }, (_, index) => {
    const frequency = 20 * (1_000 ** (index / 80));
    const lowWeight = 1 / (1 + (frequency / eq.lowShelf.frequencyHz) ** 4);
    const highWeight = 1 / (1 + (eq.highShelf.frequencyHz / frequency) ** 4);
    const octaves = Math.log2(frequency / eq.midBand.frequencyHz);
    const midWidth = 1.25 / Math.sqrt(eq.midBand.q);
    const midWeight = Math.exp(-0.5 * (octaves / midWidth) ** 2);
    return eq.lowShelf.gainDb * lowWeight + eq.midBand.gainDb * midWeight + eq.highShelf.gainDb * highWeight;
  });
  return <CurveFrame className="settings-curve--eq" label="MASTER EQ response settings curve" path={pathFromValues(values, 200, 112, -12, 12)} horizontalLabels="20 Hz — 20 kHz" verticalLabels="+12 / −12 dB" />;
}

function CompressorTransferGraph({ compressor }) {
  const values = Array.from({ length: 61 }, (_, index) => {
    const input = -60 + index;
    const compressed = input <= compressor.thresholdDb
      ? input
      : compressor.thresholdDb + (input - compressor.thresholdDb) / compressor.ratio;
    return input * (1 - compressor.mix) + (compressed + compressor.makeupGainDb) * compressor.mix;
  });
  const markerX = ((compressor.thresholdDb + 60) / 60) * 200;
  return <CurveFrame className="settings-curve--compressor" label="MASTER compressor input output settings curve" path={pathFromValues(values, 200, 112, -60, 0)} horizontalLabels="Input −60 — 0 dB" verticalLabels="Output" markerX={markerX}><path className="settings-curve-reference" d="M0,112 L200,0" /></CurveFrame>;
}

function LimiterTransferGraph({ limiter }) {
  const values = Array.from({ length: 61 }, (_, index) => Math.min(-60 + index, limiter.ceilingDbfs));
  const markerY = 112 - ((limiter.ceilingDbfs + 60) / 60) * 112;
  return <CurveFrame className="settings-curve--limiter" label="MASTER limiter ceiling settings curve" path={pathFromValues(values, 200, 112, -60, 0)} horizontalLabels="Input −60 — 0 dBFS" verticalLabels="Output" markerY={markerY}><path className="settings-curve-reference" d="M0,112 L200,0" /></CurveFrame>;
}

const ManualValues = ({ children }) => (
  <section className="manual-control-bank">
    <header><strong>Manual values</strong><small>Type exact settings</small></header>
    {children}
  </section>
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
        <label className="track-level-fader"><span>Track level fader</span><input type="range" min={limits.minimum} max={limits.maximum} step="0.1" value={value} onChange={(event) => onChange(Number(event.target.value))} /><small>{Number(value).toFixed(1)} dB</small></label>
        <NumberField label="Track gain" value={Number(value).toFixed(1)} limits={limits} step={0.1} suffix="dB" onCommit={onChange} />
      </div>
    </section>
  );
}

export function MasterBusControls({ bus, onChange, onReset, meteringRef, meteringAvailable, playing, monitorLabel }) {
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

  return (
    <section className={`master-bus-panel ${bus.bypass ? "is-bypassed" : ""}`} aria-labelledby="master-bus-title">
      <header className="master-bus-heading">
        <div className="master-bus-title">
          <span aria-hidden="true">MASTER</span>
          <div><h3 id="master-bus-title">Album Master Bus</h3><p>Every preview and exported track passes through this shared chain.</p></div>
        </div>
        <div className="master-bus-actions">
          <span className="master-bus-status">{status}</span>
          <label className={`master-bypass-switch ${bus.bypass ? "is-enabled" : ""}`}><input type="checkbox" checked={bus.bypass} onChange={(event) => onChange(["bypass"], event.target.checked)} /><span>Bypass MASTER</span></label>
          <button type="button" className="text-button" onClick={onReset}>Reset MASTER</button>
        </div>
      </header>

      <div className="master-signal-flow" aria-label="Master signal flow"><span>Album program</span><i>→</i><span>EQ</span><i>→</i><span>Compressor</span><i>→</i><span>Output</span><i>→</i><span>Limiter</span><i>→</i><span>Meter / analyzer</span><i>→</i><span>Track print</span></div>

      <MasterOutputMeters meteringRef={meteringRef} available={meteringAvailable} playing={playing} monitorLabel={monitorLabel} />

      <div className="master-module-grid">
        <section className={`master-module master-module--eq ${bus.eq.enabled ? "is-enabled" : ""}`}>
          <header><div><span>01</span><h4>Equalizer</h4></div><ModuleSwitch label="Enable MASTER EQ" checked={bus.eq.enabled} onChange={(value) => onChange(["eq", "enabled"], value)} /></header>
          <div className="analog-faceplate analog-faceplate--eq">
            <EqResponseGraph eq={bus.eq} />
            <div className="eq-band-bank">
              <section><strong>LF Shelf</strong><div><RotaryControl label="Low shelf frequency" value={bus.eq.lowShelf.frequencyHz} limits={MASTERING_LIMITS.lowShelfFrequencyHz} step={1} suffix="Hz" scale="log" disabled={eqDisabled} onChange={(value) => onChange(["eq", "lowShelf", "frequencyHz"], value)} /><RotaryControl label="Low shelf gain" value={bus.eq.lowShelf.gainDb} limits={MASTERING_LIMITS.eqGainDb} step={0.1} suffix="dB" precision={1} disabled={eqDisabled} onChange={(value) => onChange(["eq", "lowShelf", "gainDb"], value)} /></div></section>
              <section><strong>MF Bell</strong><div><RotaryControl label="Mid frequency" value={bus.eq.midBand.frequencyHz} limits={MASTERING_LIMITS.midBandFrequencyHz} step={1} suffix="Hz" scale="log" disabled={eqDisabled} onChange={(value) => onChange(["eq", "midBand", "frequencyHz"], value)} /><RotaryControl label="Mid gain" value={bus.eq.midBand.gainDb} limits={MASTERING_LIMITS.eqGainDb} step={0.1} suffix="dB" precision={1} disabled={eqDisabled} onChange={(value) => onChange(["eq", "midBand", "gainDb"], value)} /><RotaryControl label="Mid Q" value={bus.eq.midBand.q} limits={MASTERING_LIMITS.midBandQ} step={0.1} suffix="Q" precision={1} scale="log" disabled={eqDisabled} onChange={(value) => onChange(["eq", "midBand", "q"], value)} /></div></section>
              <section><strong>HF Shelf</strong><div><RotaryControl label="High shelf frequency" value={bus.eq.highShelf.frequencyHz} limits={MASTERING_LIMITS.highShelfFrequencyHz} step={1} suffix="Hz" scale="log" disabled={eqDisabled} onChange={(value) => onChange(["eq", "highShelf", "frequencyHz"], value)} /><RotaryControl label="High shelf gain" value={bus.eq.highShelf.gainDb} limits={MASTERING_LIMITS.eqGainDb} step={0.1} suffix="dB" precision={1} disabled={eqDisabled} onChange={(value) => onChange(["eq", "highShelf", "gainDb"], value)} /></div></section>
            </div>
          </div>
          <ManualValues><div className="master-module-fields master-module-fields--eq">
            <NumberField label="Low shelf frequency" value={bus.eq.lowShelf.frequencyHz} limits={MASTERING_LIMITS.lowShelfFrequencyHz} step={1} suffix="Hz" disabled={eqDisabled} onCommit={(value) => onChange(["eq", "lowShelf", "frequencyHz"], value)} />
            <NumberField label="Low shelf gain" value={bus.eq.lowShelf.gainDb} limits={MASTERING_LIMITS.eqGainDb} step={0.1} suffix="dB" disabled={eqDisabled} onCommit={(value) => onChange(["eq", "lowShelf", "gainDb"], value)} />
            <NumberField label="Mid frequency" value={bus.eq.midBand.frequencyHz} limits={MASTERING_LIMITS.midBandFrequencyHz} step={1} suffix="Hz" disabled={eqDisabled} onCommit={(value) => onChange(["eq", "midBand", "frequencyHz"], value)} />
            <NumberField label="Mid gain" value={bus.eq.midBand.gainDb} limits={MASTERING_LIMITS.eqGainDb} step={0.1} suffix="dB" disabled={eqDisabled} onCommit={(value) => onChange(["eq", "midBand", "gainDb"], value)} />
            <NumberField label="Mid Q" value={bus.eq.midBand.q} limits={MASTERING_LIMITS.midBandQ} step={0.1} suffix="Q" disabled={eqDisabled} onCommit={(value) => onChange(["eq", "midBand", "q"], value)} />
            <NumberField label="High shelf frequency" value={bus.eq.highShelf.frequencyHz} limits={MASTERING_LIMITS.highShelfFrequencyHz} step={1} suffix="Hz" disabled={eqDisabled} onCommit={(value) => onChange(["eq", "highShelf", "frequencyHz"], value)} />
            <NumberField label="High shelf gain" value={bus.eq.highShelf.gainDb} limits={MASTERING_LIMITS.eqGainDb} step={0.1} suffix="dB" disabled={eqDisabled} onCommit={(value) => onChange(["eq", "highShelf", "gainDb"], value)} />
          </div></ManualValues>
        </section>

        <section className={`master-module master-module--compressor ${bus.compressor.enabled ? "is-enabled" : ""}`}>
          <header><div><span>02</span><h4>Compressor</h4></div><ModuleSwitch label="Enable MASTER compressor" checked={bus.compressor.enabled} onChange={(value) => onChange(["compressor", "enabled"], value)} /></header>
          <div className="analog-faceplate analog-faceplate--compressor">
            <CompressorTransferGraph compressor={bus.compressor} />
            <div className="rotary-control-bank rotary-control-bank--compressor">
              <RotaryControl label="Threshold" value={bus.compressor.thresholdDb} limits={MASTERING_LIMITS.compressorThresholdDb} step={0.1} suffix="dB" precision={1} disabled={compressorDisabled} onChange={(value) => onChange(["compressor", "thresholdDb"], value)} />
              <RotaryControl label="Ratio" value={bus.compressor.ratio} limits={MASTERING_LIMITS.compressorRatio} step={0.1} suffix=":1" precision={1} scale="log" disabled={compressorDisabled} onChange={(value) => onChange(["compressor", "ratio"], value)} />
              <RotaryControl label="Attack" value={bus.compressor.attackMs} limits={MASTERING_LIMITS.compressorAttackMs} step={0.1} suffix="ms" scale="log" disabled={compressorDisabled} onChange={(value) => onChange(["compressor", "attackMs"], value)} />
              <RotaryControl label="Release" value={bus.compressor.releaseMs} limits={MASTERING_LIMITS.compressorReleaseMs} step={1} suffix="ms" scale="log" disabled={compressorDisabled} onChange={(value) => onChange(["compressor", "releaseMs"], value)} />
              <RotaryControl label="Knee" value={bus.compressor.knee} limits={MASTERING_LIMITS.compressorKnee} step={0.1} precision={1} disabled={compressorDisabled} onChange={(value) => onChange(["compressor", "knee"], value)} />
              <RotaryControl label="Makeup gain" value={bus.compressor.makeupGainDb} limits={MASTERING_LIMITS.compressorMakeupGainDb} step={0.1} suffix="dB" precision={1} disabled={compressorDisabled} onChange={(value) => onChange(["compressor", "makeupGainDb"], value)} />
              <RotaryControl label="Parallel mix" value={Math.round(bus.compressor.mix * 100)} minimum={0} maximum={100} step={1} suffix="%" precision={0} disabled={compressorDisabled} onChange={(value) => onChange(["compressor", "mix"], value / 100)} />
            </div>
          </div>
          <ManualValues><div className="master-module-fields">
            <NumberField label="Threshold" value={bus.compressor.thresholdDb} limits={MASTERING_LIMITS.compressorThresholdDb} step={0.1} suffix="dB" disabled={compressorDisabled} onCommit={(value) => onChange(["compressor", "thresholdDb"], value)} />
            <NumberField label="Ratio" value={bus.compressor.ratio} limits={MASTERING_LIMITS.compressorRatio} step={0.1} suffix=":1" disabled={compressorDisabled} onCommit={(value) => onChange(["compressor", "ratio"], value)} />
            <NumberField label="Attack" value={bus.compressor.attackMs} limits={MASTERING_LIMITS.compressorAttackMs} step={0.1} suffix="ms" disabled={compressorDisabled} onCommit={(value) => onChange(["compressor", "attackMs"], value)} />
            <NumberField label="Release" value={bus.compressor.releaseMs} limits={MASTERING_LIMITS.compressorReleaseMs} step={1} suffix="ms" disabled={compressorDisabled} onCommit={(value) => onChange(["compressor", "releaseMs"], value)} />
            <NumberField label="Knee" value={bus.compressor.knee} limits={MASTERING_LIMITS.compressorKnee} step={0.1} suffix="" disabled={compressorDisabled} onCommit={(value) => onChange(["compressor", "knee"], value)} />
            <NumberField label="Makeup gain" value={bus.compressor.makeupGainDb} limits={MASTERING_LIMITS.compressorMakeupGainDb} step={0.1} suffix="dB" disabled={compressorDisabled} onCommit={(value) => onChange(["compressor", "makeupGainDb"], value)} />
            <NumberField label="Parallel mix" value={Math.round(bus.compressor.mix * 100)} minimum={0} maximum={100} step={1} suffix="%" disabled={compressorDisabled} onCommit={(value) => onChange(["compressor", "mix"], value / 100)} />
            <label className="master-select-field"><span>Detection</span><select value={bus.compressor.detection} disabled={compressorDisabled} onChange={(event) => onChange(["compressor", "detection"], event.target.value)}><option value="rms">RMS</option><option value="peak">Peak</option></select></label>
            <label className="master-select-field"><span>Stereo link</span><select value={bus.compressor.link} disabled={compressorDisabled} onChange={(event) => onChange(["compressor", "link"], event.target.value)}><option value="maximum">Maximum</option><option value="average">Average</option></select></label>
          </div></ManualValues>
        </section>

        <section className={`master-module master-module--output ${Math.abs(bus.outputGainDb) > 0.0001 ? "is-enabled" : ""}`}>
          <header><div><span>03</span><h4>Output</h4></div><small>Post compression</small></header>
          <div className="analog-faceplate analog-faceplate--output">
            <RotaryControl label="MASTER output gain" value={bus.outputGainDb} limits={MASTERING_LIMITS.outputGainDb} step={0.1} suffix="dB" precision={1} disabled={bus.bypass} onChange={(value) => onChange(["outputGainDb"], value)} />
            <p>Final gain before the safety limiter</p>
          </div>
          <ManualValues><div className="master-module-fields">
            <NumberField label="MASTER output gain" value={bus.outputGainDb} limits={MASTERING_LIMITS.outputGainDb} step={0.1} suffix="dB" disabled={bus.bypass} onCommit={(value) => onChange(["outputGainDb"], value)} />
          </div></ManualValues>
        </section>

        <section className={`master-module master-module--limiter ${bus.limiter.enabled ? "is-enabled" : ""}`}>
          <header><div><span>04</span><h4>Limiter</h4></div><ModuleSwitch label="Enable MASTER limiter" checked={bus.limiter.enabled} onChange={(value) => onChange(["limiter", "enabled"], value)} /></header>
          <div className="analog-faceplate analog-faceplate--limiter">
            <LimiterTransferGraph limiter={bus.limiter} />
            <div className="rotary-control-bank rotary-control-bank--limiter">
              <RotaryControl compact label="Ceiling" value={bus.limiter.ceilingDbfs} limits={MASTERING_LIMITS.limiterCeilingDbfs} step={0.1} suffix="dBFS" precision={1} disabled={limiterDisabled} onChange={(value) => onChange(["limiter", "ceilingDbfs"], value)} />
              <RotaryControl compact label="Limiter attack" value={bus.limiter.attackMs} limits={MASTERING_LIMITS.limiterAttackMs} step={0.1} suffix="ms" scale="log" disabled={limiterDisabled} onChange={(value) => onChange(["limiter", "attackMs"], value)} />
              <RotaryControl compact label="Limiter release" value={bus.limiter.releaseMs} limits={MASTERING_LIMITS.limiterReleaseMs} step={1} suffix="ms" scale="log" disabled={limiterDisabled} onChange={(value) => onChange(["limiter", "releaseMs"], value)} />
            </div>
          </div>
          <ManualValues><div className="master-module-fields">
            <NumberField label="Ceiling" value={bus.limiter.ceilingDbfs} limits={MASTERING_LIMITS.limiterCeilingDbfs} step={0.1} suffix="dBFS" disabled={limiterDisabled} onCommit={(value) => onChange(["limiter", "ceilingDbfs"], value)} />
            <NumberField label="Limiter attack" value={bus.limiter.attackMs} limits={MASTERING_LIMITS.limiterAttackMs} step={0.1} suffix="ms" disabled={limiterDisabled} onCommit={(value) => onChange(["limiter", "attackMs"], value)} />
            <NumberField label="Limiter release" value={bus.limiter.releaseMs} limits={MASTERING_LIMITS.limiterReleaseMs} step={1} suffix="ms" disabled={limiterDisabled} onCommit={(value) => onChange(["limiter", "releaseMs"], value)} />
          </div></ManualValues>
        </section>
      </div>
    </section>
  );
}
