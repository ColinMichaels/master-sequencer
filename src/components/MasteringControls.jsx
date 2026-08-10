import React, { useEffect, useMemo, useState } from "react";
import { MASTERING_LIMITS } from "../lib/mastering.js";

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

export function MasterBusControls({ bus, onChange, onReset }) {
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

      <div className="master-signal-flow" aria-label="Master signal flow"><span>Album program</span><i>→</i><span>EQ</span><i>→</i><span>Compressor</span><i>→</i><span>Output</span><i>→</i><span>Limiter</span><i>→</i><span>Track print</span></div>

      <div className="master-module-grid">
        <section className={`master-module ${bus.eq.enabled ? "is-enabled" : ""}`}>
          <header><div><span>01</span><h4>Equalizer</h4></div><ModuleSwitch label="Enable MASTER EQ" checked={bus.eq.enabled} onChange={(value) => onChange(["eq", "enabled"], value)} /></header>
          <div className="master-module-fields master-module-fields--eq">
            <NumberField label="Low shelf frequency" value={bus.eq.lowShelf.frequencyHz} limits={MASTERING_LIMITS.lowShelfFrequencyHz} step={1} suffix="Hz" disabled={eqDisabled} onCommit={(value) => onChange(["eq", "lowShelf", "frequencyHz"], value)} />
            <NumberField label="Low shelf gain" value={bus.eq.lowShelf.gainDb} limits={MASTERING_LIMITS.eqGainDb} step={0.1} suffix="dB" disabled={eqDisabled} onCommit={(value) => onChange(["eq", "lowShelf", "gainDb"], value)} />
            <NumberField label="Mid frequency" value={bus.eq.midBand.frequencyHz} limits={MASTERING_LIMITS.midBandFrequencyHz} step={1} suffix="Hz" disabled={eqDisabled} onCommit={(value) => onChange(["eq", "midBand", "frequencyHz"], value)} />
            <NumberField label="Mid gain" value={bus.eq.midBand.gainDb} limits={MASTERING_LIMITS.eqGainDb} step={0.1} suffix="dB" disabled={eqDisabled} onCommit={(value) => onChange(["eq", "midBand", "gainDb"], value)} />
            <NumberField label="Mid Q" value={bus.eq.midBand.q} limits={MASTERING_LIMITS.midBandQ} step={0.1} suffix="Q" disabled={eqDisabled} onCommit={(value) => onChange(["eq", "midBand", "q"], value)} />
            <NumberField label="High shelf frequency" value={bus.eq.highShelf.frequencyHz} limits={MASTERING_LIMITS.highShelfFrequencyHz} step={1} suffix="Hz" disabled={eqDisabled} onCommit={(value) => onChange(["eq", "highShelf", "frequencyHz"], value)} />
            <NumberField label="High shelf gain" value={bus.eq.highShelf.gainDb} limits={MASTERING_LIMITS.eqGainDb} step={0.1} suffix="dB" disabled={eqDisabled} onCommit={(value) => onChange(["eq", "highShelf", "gainDb"], value)} />
          </div>
        </section>

        <section className={`master-module ${bus.compressor.enabled ? "is-enabled" : ""}`}>
          <header><div><span>02</span><h4>Compressor</h4></div><ModuleSwitch label="Enable MASTER compressor" checked={bus.compressor.enabled} onChange={(value) => onChange(["compressor", "enabled"], value)} /></header>
          <div className="master-module-fields">
            <NumberField label="Threshold" value={bus.compressor.thresholdDb} limits={MASTERING_LIMITS.compressorThresholdDb} step={0.1} suffix="dB" disabled={compressorDisabled} onCommit={(value) => onChange(["compressor", "thresholdDb"], value)} />
            <NumberField label="Ratio" value={bus.compressor.ratio} limits={MASTERING_LIMITS.compressorRatio} step={0.1} suffix=":1" disabled={compressorDisabled} onCommit={(value) => onChange(["compressor", "ratio"], value)} />
            <NumberField label="Attack" value={bus.compressor.attackMs} limits={MASTERING_LIMITS.compressorAttackMs} step={0.1} suffix="ms" disabled={compressorDisabled} onCommit={(value) => onChange(["compressor", "attackMs"], value)} />
            <NumberField label="Release" value={bus.compressor.releaseMs} limits={MASTERING_LIMITS.compressorReleaseMs} step={1} suffix="ms" disabled={compressorDisabled} onCommit={(value) => onChange(["compressor", "releaseMs"], value)} />
            <NumberField label="Knee" value={bus.compressor.knee} limits={MASTERING_LIMITS.compressorKnee} step={0.1} suffix="" disabled={compressorDisabled} onCommit={(value) => onChange(["compressor", "knee"], value)} />
            <NumberField label="Makeup gain" value={bus.compressor.makeupGainDb} limits={MASTERING_LIMITS.compressorMakeupGainDb} step={0.1} suffix="dB" disabled={compressorDisabled} onCommit={(value) => onChange(["compressor", "makeupGainDb"], value)} />
            <NumberField label="Parallel mix" value={Math.round(bus.compressor.mix * 100)} minimum={0} maximum={100} step={1} suffix="%" disabled={compressorDisabled} onCommit={(value) => onChange(["compressor", "mix"], value / 100)} />
            <label className="master-select-field"><span>Detection</span><select value={bus.compressor.detection} disabled={compressorDisabled} onChange={(event) => onChange(["compressor", "detection"], event.target.value)}><option value="rms">RMS</option><option value="peak">Peak</option></select></label>
            <label className="master-select-field"><span>Stereo link</span><select value={bus.compressor.link} disabled={compressorDisabled} onChange={(event) => onChange(["compressor", "link"], event.target.value)}><option value="maximum">Maximum</option><option value="average">Average</option></select></label>
          </div>
        </section>

        <section className={`master-module master-module--output ${Math.abs(bus.outputGainDb) > 0.0001 ? "is-enabled" : ""}`}>
          <header><div><span>03</span><h4>Output</h4></div><small>Post compression</small></header>
          <div className="master-module-fields">
            <NumberField label="MASTER output gain" value={bus.outputGainDb} limits={MASTERING_LIMITS.outputGainDb} step={0.1} suffix="dB" disabled={bus.bypass} onCommit={(value) => onChange(["outputGainDb"], value)} />
          </div>
        </section>

        <section className={`master-module ${bus.limiter.enabled ? "is-enabled" : ""}`}>
          <header><div><span>04</span><h4>Limiter</h4></div><ModuleSwitch label="Enable MASTER limiter" checked={bus.limiter.enabled} onChange={(value) => onChange(["limiter", "enabled"], value)} /></header>
          <div className="master-module-fields">
            <NumberField label="Ceiling" value={bus.limiter.ceilingDbfs} limits={MASTERING_LIMITS.limiterCeilingDbfs} step={0.1} suffix="dBFS" disabled={limiterDisabled} onCommit={(value) => onChange(["limiter", "ceilingDbfs"], value)} />
            <NumberField label="Limiter attack" value={bus.limiter.attackMs} limits={MASTERING_LIMITS.limiterAttackMs} step={0.1} suffix="ms" disabled={limiterDisabled} onCommit={(value) => onChange(["limiter", "attackMs"], value)} />
            <NumberField label="Limiter release" value={bus.limiter.releaseMs} limits={MASTERING_LIMITS.limiterReleaseMs} step={1} suffix="ms" disabled={limiterDisabled} onCommit={(value) => onChange(["limiter", "releaseMs"], value)} />
          </div>
        </section>
      </div>
    </section>
  );
}
