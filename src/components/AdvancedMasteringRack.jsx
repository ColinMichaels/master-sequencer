import React, { useEffect, useMemo, useRef, useState } from "react";
import { ADVANCED_PROCESSOR_TYPES, ADVANCED_RACK_MAX_PROCESSORS, availablePluginDefinitions, buildSerialConnections, createAdvancedProcessor, createDefaultAdvancedMastering, normalizeAdvancedMastering, processorDefinition } from "../lib/advanced-mastering.js";
import { MASTERING_LIMITS } from "../lib/mastering.js";
import { ChevronIcon, DragIcon, PlusIcon, RefreshIcon, TrashIcon, WarningIcon } from "./Icons.jsx";
import { CompressorTransferGraph, EqResponseGraph, HardwareGainReductionLeds, HardwareGainReductionMeter, LimiterTransferGraph, ManualValues, MasteringNumberField, ModuleSwitch, RotaryControl } from "./MasteringControls.jsx";
import { MasterOutputMeters } from "./MasterOutputMeters.jsx";
import { CreativePhaserFaceplate, HarmonicColorFaceplate, HfSmootherFaceplate, MasteringAmbienceFaceplate, TransientSculptorFaceplate } from "./AnalogProcessorFaceplates.jsx";
import { PhaseAlignmentFaceplate, StereoFieldFaceplate } from "./SpatialRepairFaceplates.jsx";

const EQUIPMENT_MAKERS = Object.freeze({
  [ADVANCED_PROCESSOR_TYPES.eq]: Object.freeze({ initials: "HS", maker: "Harbor Signal", model: "E-73 PROGRAM" }),
  [ADVANCED_PROCESSOR_TYPES.compressor]: Object.freeze({ initials: "NA", maker: "Northline Audio", model: "B-2 STEREO" }),
  [ADVANCED_PROCESSOR_TYPES.output]: Object.freeze({ initials: "RW", maker: "Resolute Works", model: "L-1 LINE" }),
  [ADVANCED_PROCESSOR_TYPES.limiter]: Object.freeze({ initials: "IL", maker: "Ironvale Labs", model: "P-4 PRECISION" }),
  [ADVANCED_PROCESSOR_TYPES.stereoField]: Object.freeze({ initials: "HS", maker: "Harbor Signal", model: "S-4 FIELD" }),
  [ADVANCED_PROCESSOR_TYPES.harmonicColor]: Object.freeze({ initials: "NA", maker: "Northline Audio", model: "H-3 COLOR" }),
  [ADVANCED_PROCESSOR_TYPES.phaseAlignment]: Object.freeze({ initials: "RW", maker: "Resolute Works", model: "P-1 ALIGN" }),
  [ADVANCED_PROCESSOR_TYPES.hfSmoother]: Object.freeze({ initials: "IL", maker: "Ironvale Labs", model: "HF-2 SMOOTH" }),
  [ADVANCED_PROCESSOR_TYPES.ambience]: Object.freeze({ initials: "HS", maker: "Harbor Signal", model: "A-7 SPACE" }),
  [ADVANCED_PROCESSOR_TYPES.transientShaper]: Object.freeze({ initials: "RW", maker: "Resolute Works", model: "T-5 IMPACT" }),
  [ADVANCED_PROCESSOR_TYPES.creativePhaser]: Object.freeze({ initials: "NA", maker: "Northline Audio", model: "P-6 MOTION" }),
});

function EquipmentMakerMark({ node }) {
  const identity = EQUIPMENT_MAKERS[node.typeId] || { initials: "EXT", maker: node.pluginRef?.vendor || "External", model: node.pluginRef?.format?.toUpperCase() || "PLUG-IN" };
  return <div className="premium-maker-mark" aria-hidden="true"><i>{identity.initials}</i><span><b>{identity.maker}</b><em>{identity.model} · {node.id.toUpperCase()}</em></span></div>;
}

const CHANNEL_MODE_OPTIONS = Object.freeze([
  { value: "stereo", label: "Stereo L/R" },
  { value: "mid", label: "Mid only" },
  { value: "side", label: "Side only" },
]);

function SelectField({ label, value, options, disabled, onChange }) {
  return <label className="master-select-field"><span>{label}</span><select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}

function PluginPanel({ node, title, subtitle, warning, children }) {
  return <div className="premium-plugin-panel"><header><EquipmentMakerMark node={node} /><div><strong>{title}</strong><small>{subtitle}</small></div></header>{warning ? <p className="premium-plugin-warning"><WarningIcon />{warning}</p> : null}<div className="premium-plugin-controls">{children}</div></div>;
}

const pathSet = (source, path, value) => {
  const next = structuredClone(source);
  let target = next;
  path.slice(0, -1).forEach((key) => { target = target[key]; });
  target[path.at(-1)] = value;
  return next;
};

const serialRack = (rack, nodes) => normalizeAdvancedMastering({ ...rack, nodes, connections: buildSerialConnections(nodes) });

const uniqueProcessorId = (rack, typeId) => {
  const base = processorDefinition(typeId)?.shortName.toLowerCase() || "unit";
  let index = 1;
  while (rack.nodes.some((node) => node.id === `${base}-${index}`)) index += 1;
  return `${base}-${index}`;
};

const Field = ({ label, value, limits, minimum, maximum, step = 0.1, suffix, disabled, onCommit }) => (
  <MasteringNumberField label={label} value={value} minimum={limits?.minimum ?? minimum} maximum={limits?.maximum ?? maximum} step={step} suffix={suffix} disabled={disabled} onCommit={onCommit} />
);

function EquipmentActions({ node, index, count, onMove, onDuplicate, onRemove, onBypass }) {
  return (
    <div className="premium-unit-actions">
      <ModuleSwitch label={`Enable ${node.name}`} checked={!node.bypass} onChange={(enabled) => onBypass(!enabled)} />
      <button type="button" aria-label={`Move ${node.name} up`} title="Move earlier in signal path" disabled={index === 0} onClick={() => onMove(index, index - 1)}><ChevronIcon direction="up" /></button>
      <button type="button" aria-label={`Move ${node.name} down`} title="Move later in signal path" disabled={index === count - 1} onClick={() => onMove(index, index + 1)}><ChevronIcon direction="down" /></button>
      <button type="button" aria-label={`Duplicate ${node.name}`} title="Duplicate equipment" onClick={onDuplicate}><PlusIcon /></button>
      <button type="button" className="premium-unit-remove" aria-label={`Remove ${node.name}`} title="Remove equipment" onClick={onRemove}><TrashIcon /></button>
    </div>
  );
}

function FaceplateCircuitSwitch({ node, mode, className, onBypass }) {
  const inCircuit = !node.bypass;
  const checked = mode === "in" ? inCircuit : node.bypass;
  const legend = mode === "in" ? "IN" : "BYPASS";
  const nextAction = inCircuit ? "bypass" : "put in circuit";
  return (
    <label className={`premium-faceplate-switch premium-faceplate-switch--${mode} ${checked ? "is-switch-on" : ""} ${inCircuit ? "is-in-circuit" : "is-bypassed"} ${className}`} title={`${node.name}: ${inCircuit ? "in circuit" : "bypassed"}. Click to ${nextAction}.`}>
      <input type="checkbox" checked={checked} aria-label={`${node.name} ${legend} switch`} onChange={(event) => onBypass(mode === "in" ? !event.target.checked : event.target.checked)} />
      <span className="premium-faceplate-switch-hardware" aria-hidden="true"><i /></span>
      <em aria-hidden="true" />
      <span className="premium-faceplate-switch-state" aria-live="polite">{inCircuit ? "In circuit" : "Bypassed"}</span>
    </label>
  );
}

function FaceplateOptionSwitch({ label, checked, className, onChange }) {
  return (
    <label className={`premium-faceplate-switch premium-faceplate-switch--option ${checked ? "is-switch-on is-option-enabled" : ""} ${className}`} title={`${label}: ${checked ? "on" : "off"}`}>
      <input type="checkbox" checked={checked} aria-label={`${label} switch`} onChange={(event) => onChange(event.target.checked)} />
      <span className="premium-faceplate-switch-hardware" aria-hidden="true"><i /></span>
      <em aria-hidden="true" />
      <span className="premium-faceplate-switch-state" aria-live="polite">{checked ? "On" : "Off"}</span>
    </label>
  );
}

function OversamplingSelector({ value, onChange }) {
  return (
    <div className="premium-oversampling-selector" role="group" aria-label="Limiter oversampling">
      {[2, 4, 8].map((factor) => <button key={factor} type="button" className={value === factor ? "is-active" : ""} aria-label={`${factor}× oversampling`} aria-pressed={value === factor} onClick={() => onChange(factor)}><i aria-hidden="true" /></button>)}
    </div>
  );
}

const marks = (...entries) => Object.freeze(entries.map(([value, angle]) => Object.freeze({ value, angle })));

// These piecewise maps follow the photographed legends. Interpolating between
// adjacent detents keeps the pointer aligned with the faceplate at every value.
const PREMIUM_DIAL_MARKS = Object.freeze({
  gain: marks([-12, -120], [0, 0], [12, 120]),
  lowFrequency: marks([20, -90], [30, -60], [60, 0], [100, 45], [200, 90], [300, 120], [500, 135]),
  lowMidFrequency: marks([80, -120], [100, -90], [200, -45], [400, 0], [800, 45], [1_600, 90], [2_000, 120]),
  highMidFrequency: marks([400, -90], [800, -45], [1_600, 0], [3_200, 45], [6_400, 90], [12_000, 120]),
  highFrequency: marks([1_000, -120], [1_600, -90], [3_200, -45], [6_400, 0], [12_000, 45], [20_000, 90]),
  threshold: marks([-60, -135], [-30, -120], [-20, -90], [-10, -45], [0, 0]),
  ratio: marks([1, -135], [1.5, -120], [2, -90], [4, -45], [8, 45], [12, 90], [20, 120]),
  attack: marks([0.01, -135], [0.1, -120], [1, -45], [3, 20], [10, 80], [30, 120], [2_000, 135]),
  compressorRelease: marks([0.01, -135], [100, -120], [200, -90], [400, -45], [800, 45], [1_200, 90], [9_000, 120]),
  sidechain: marks([20, -120], [60, -60], [250, 25], [500, 75], [1_000, 120]),
  mix: marks([0, -120], [50, 0], [100, 120]),
  ceiling: marks([-9, -135], [-2, -90], [-1, 0], [-0.5, 45], [0, 120]),
  lookahead: marks([0.1, -120], [0.2, -45], [1, 0], [3, 45], [5, 120], [80, 135]),
  limiterRelease: marks([1, -120], [10, -90], [100, -45], [250, 0], [500, 45], [2_000, 90], [5_000, 120], [8_000, 135]),
  stereoLink: marks([0, -120], [50, 0], [100, 120]),
});

function PremiumEq({ node, disabled, onBypass, onParameter, meteringRef, live }) {
  const eq = node.parameters;
  return (
    <>
      <div className="premium-faceplate premium-faceplate--eq">
        <div className="premium-brand"><EquipmentMakerMark node={node} /><strong>PROGRAM EQ</strong><small>Four-band mastering equalizer</small></div>
        <FaceplateCircuitSwitch node={node} mode="in" className="premium-faceplate-switch--eq-in" onBypass={onBypass} />
        <FaceplateCircuitSwitch node={node} mode="bypass" className="premium-faceplate-switch--eq-bypass" onBypass={onBypass} />
        <EqResponseGraph eq={eq} meteringRef={meteringRef} active={live && !disabled} />
        <div className="premium-knob-bank premium-knob-bank--eq">
          <RotaryControl className="premium-mock-control premium-mock-control--eq-low-frequency" dialMarks={PREMIUM_DIAL_MARKS.lowFrequency} label="Low frequency" value={eq.lowShelf.frequencyHz} limits={MASTERING_LIMITS.lowShelfFrequencyHz} step={1} suffix="Hz" scale="log" disabled={disabled} onChange={(value) => onParameter(["lowShelf", "frequencyHz"], value)} />
          <RotaryControl className="premium-mock-control premium-mock-control--eq-low-gain" dialMarks={PREMIUM_DIAL_MARKS.gain} label="Low boost / cut" value={eq.lowShelf.gainDb} limits={MASTERING_LIMITS.eqGainDb} step={0.1} suffix="dB" precision={1} disabled={disabled} onChange={(value) => onParameter(["lowShelf", "gainDb"], value)} />
          <RotaryControl className="premium-mock-control premium-mock-control--eq-low-mid-frequency" dialMarks={PREMIUM_DIAL_MARKS.lowMidFrequency} label="Low-mid frequency" value={eq.lowMidBand.frequencyHz} limits={MASTERING_LIMITS.lowMidBandFrequencyHz} step={1} suffix="Hz" scale="log" disabled={disabled} onChange={(value) => onParameter(["lowMidBand", "frequencyHz"], value)} />
          <RotaryControl className="premium-mock-control premium-mock-control--eq-low-mid-gain" dialMarks={PREMIUM_DIAL_MARKS.gain} label="Low-mid boost / cut" value={eq.lowMidBand.gainDb} limits={MASTERING_LIMITS.eqGainDb} step={0.1} suffix="dB" precision={1} disabled={disabled} onChange={(value) => onParameter(["lowMidBand", "gainDb"], value)} />
          <RotaryControl className="premium-mock-control premium-mock-control--eq-high-mid-frequency" dialMarks={PREMIUM_DIAL_MARKS.highMidFrequency} label="High-mid frequency" value={eq.highMidBand.frequencyHz} limits={MASTERING_LIMITS.highMidBandFrequencyHz} step={1} suffix="Hz" scale="log" disabled={disabled} onChange={(value) => onParameter(["highMidBand", "frequencyHz"], value)} />
          <RotaryControl className="premium-mock-control premium-mock-control--eq-high-mid-gain" dialMarks={PREMIUM_DIAL_MARKS.gain} label="High-mid boost / cut" value={eq.highMidBand.gainDb} limits={MASTERING_LIMITS.eqGainDb} step={0.1} suffix="dB" precision={1} disabled={disabled} onChange={(value) => onParameter(["highMidBand", "gainDb"], value)} />
          <RotaryControl className="premium-mock-control premium-mock-control--eq-high-frequency" dialMarks={PREMIUM_DIAL_MARKS.highFrequency} label="High frequency" value={eq.highShelf.frequencyHz} limits={MASTERING_LIMITS.highShelfFrequencyHz} step={1} suffix="Hz" scale="log" disabled={disabled} onChange={(value) => onParameter(["highShelf", "frequencyHz"], value)} />
          <RotaryControl className="premium-mock-control premium-mock-control--eq-high-gain" dialMarks={PREMIUM_DIAL_MARKS.gain} label="High boost / cut" value={eq.highShelf.gainDb} limits={MASTERING_LIMITS.eqGainDb} step={0.1} suffix="dB" precision={1} disabled={disabled} onChange={(value) => onParameter(["highShelf", "gainDb"], value)} />
          <RotaryControl className="premium-mock-control premium-mock-control--eq-output" dialMarks={PREMIUM_DIAL_MARKS.gain} label="EQ output" value={eq.outputGainDb} limits={MASTERING_LIMITS.eqOutputGainDb} step={0.1} suffix="dB" precision={1} disabled={disabled} onChange={(value) => onParameter(["outputGainDb"], value)} />
        </div>
      </div>
      <ManualValues><div className="master-module-fields premium-exact-values">
        <SelectField label="Channel mode" value={eq.channelMode} options={CHANNEL_MODE_OPTIONS} disabled={disabled} onChange={(value) => onParameter(["channelMode"], value)} />
        <Field label="Low frequency" value={eq.lowShelf.frequencyHz} limits={MASTERING_LIMITS.lowShelfFrequencyHz} step={1} suffix="Hz" disabled={disabled} onCommit={(value) => onParameter(["lowShelf", "frequencyHz"], value)} />
        <Field label="Low gain" value={eq.lowShelf.gainDb} limits={MASTERING_LIMITS.eqGainDb} suffix="dB" disabled={disabled} onCommit={(value) => onParameter(["lowShelf", "gainDb"], value)} />
        <Field label="Low-mid frequency" value={eq.lowMidBand.frequencyHz} limits={MASTERING_LIMITS.lowMidBandFrequencyHz} step={1} suffix="Hz" disabled={disabled} onCommit={(value) => onParameter(["lowMidBand", "frequencyHz"], value)} />
        <Field label="Low-mid gain" value={eq.lowMidBand.gainDb} limits={MASTERING_LIMITS.eqGainDb} suffix="dB" disabled={disabled} onCommit={(value) => onParameter(["lowMidBand", "gainDb"], value)} />
        <Field label="Low-mid Q" value={eq.lowMidBand.q} limits={MASTERING_LIMITS.midBandQ} suffix="Q" disabled={disabled} onCommit={(value) => onParameter(["lowMidBand", "q"], value)} />
        <Field label="High-mid frequency" value={eq.highMidBand.frequencyHz} limits={MASTERING_LIMITS.highMidBandFrequencyHz} step={1} suffix="Hz" disabled={disabled} onCommit={(value) => onParameter(["highMidBand", "frequencyHz"], value)} />
        <Field label="High-mid gain" value={eq.highMidBand.gainDb} limits={MASTERING_LIMITS.eqGainDb} suffix="dB" disabled={disabled} onCommit={(value) => onParameter(["highMidBand", "gainDb"], value)} />
        <Field label="High-mid Q" value={eq.highMidBand.q} limits={MASTERING_LIMITS.midBandQ} suffix="Q" disabled={disabled} onCommit={(value) => onParameter(["highMidBand", "q"], value)} />
        <Field label="High frequency" value={eq.highShelf.frequencyHz} limits={MASTERING_LIMITS.highShelfFrequencyHz} step={1} suffix="Hz" disabled={disabled} onCommit={(value) => onParameter(["highShelf", "frequencyHz"], value)} />
        <Field label="High gain" value={eq.highShelf.gainDb} limits={MASTERING_LIMITS.eqGainDb} suffix="dB" disabled={disabled} onCommit={(value) => onParameter(["highShelf", "gainDb"], value)} />
        <Field label="EQ output" value={eq.outputGainDb} limits={MASTERING_LIMITS.eqOutputGainDb} suffix="dB" disabled={disabled} onCommit={(value) => onParameter(["outputGainDb"], value)} />
      </div></ManualValues>
    </>
  );
}

function PremiumCompressor({ node, disabled, onBypass, onParameter, meteringRef, live }) {
  const compressor = node.parameters;
  return (
    <>
      <div className="premium-faceplate premium-faceplate--compressor">
        <div className="premium-brand"><EquipmentMakerMark node={node} /><strong>BUS COMPRESSOR</strong><small>Stereo mastering dynamics</small></div>
        <button type="button" className={`premium-panel-lamp premium-panel-lamp--compressor-power ${node.bypass ? "" : "is-lit"}`} aria-label="Bus Compressor power" aria-pressed={!node.bypass} onClick={() => onBypass(!node.bypass)} />
        <FaceplateCircuitSwitch node={node} mode="in" className="premium-faceplate-switch--compressor-in" onBypass={onBypass} />
        <FaceplateOptionSwitch label="Sidechain input" checked={compressor.sidechainEnabled} className="premium-faceplate-switch--compressor-sidechain" onChange={(checked) => onParameter(["sidechainEnabled"], checked)} />
        <FaceplateCircuitSwitch node={node} mode="bypass" className="premium-faceplate-switch--compressor-bypass" onBypass={onBypass} />
        <HardwareGainReductionMeter variant="mockup-dual" meteringRef={meteringRef} meterNodeKey={`processor:${node.id}:compressor`} active={live && !disabled} />
        <CompressorTransferGraph compressor={compressor} meteringRef={meteringRef} meterNodeKey={`processor:${node.id}:compressor`} active={live && !disabled} />
        <div className="premium-knob-bank premium-knob-bank--compressor">
          <RotaryControl className="premium-mock-control premium-mock-control--comp-threshold" dialMarks={PREMIUM_DIAL_MARKS.threshold} label="Threshold" value={compressor.thresholdDb} limits={MASTERING_LIMITS.compressorThresholdDb} step={0.1} suffix="dB" precision={1} disabled={disabled} onChange={(value) => onParameter(["thresholdDb"], value)} />
          <RotaryControl className="premium-mock-control premium-mock-control--comp-ratio" dialMarks={PREMIUM_DIAL_MARKS.ratio} label="Ratio" value={compressor.ratio} limits={MASTERING_LIMITS.compressorRatio} step={0.1} suffix=":1" precision={1} scale="log" disabled={disabled} onChange={(value) => onParameter(["ratio"], value)} />
          <RotaryControl className="premium-mock-control premium-mock-control--comp-attack" dialMarks={PREMIUM_DIAL_MARKS.attack} label="Attack" value={compressor.attackMs} limits={MASTERING_LIMITS.compressorAttackMs} step={0.1} suffix="ms" scale="log" disabled={disabled} onChange={(value) => onParameter(["attackMs"], value)} />
          <RotaryControl className="premium-mock-control premium-mock-control--comp-release" dialMarks={PREMIUM_DIAL_MARKS.compressorRelease} label="Release" value={compressor.releaseMs} limits={MASTERING_LIMITS.compressorReleaseMs} step={1} suffix="ms" scale="log" disabled={disabled} onChange={(value) => onParameter(["releaseMs"], value)} />
          <RotaryControl className="premium-mock-control premium-mock-control--comp-sidechain" dialMarks={PREMIUM_DIAL_MARKS.sidechain} label="Sidechain filter" value={compressor.sidechainFilterHz} limits={MASTERING_LIMITS.compressorSidechainFilterHz} step={1} suffix="Hz" scale="log" disabled={disabled} onChange={(value) => onParameter(["sidechainFilterHz"], value)} />
          <RotaryControl className="premium-mock-control premium-mock-control--comp-mix" dialMarks={PREMIUM_DIAL_MARKS.mix} label="Parallel mix" value={Math.round(compressor.mix * 100)} minimum={0} maximum={100} step={1} suffix="%" precision={0} disabled={disabled} onChange={(value) => onParameter(["mix"], value / 100)} />
        </div>
      </div>
      <ManualValues><div className="master-module-fields premium-exact-values">
        <SelectField label="Channel mode" value={compressor.channelMode} options={CHANNEL_MODE_OPTIONS} disabled={disabled} onChange={(value) => onParameter(["channelMode"], value)} />
        <Field label="Threshold" value={compressor.thresholdDb} limits={MASTERING_LIMITS.compressorThresholdDb} suffix="dB" disabled={disabled} onCommit={(value) => onParameter(["thresholdDb"], value)} />
        <Field label="Ratio" value={compressor.ratio} limits={MASTERING_LIMITS.compressorRatio} suffix=":1" disabled={disabled} onCommit={(value) => onParameter(["ratio"], value)} />
        <Field label="Attack" value={compressor.attackMs} limits={MASTERING_LIMITS.compressorAttackMs} suffix="ms" disabled={disabled} onCommit={(value) => onParameter(["attackMs"], value)} />
        <Field label="Release" value={compressor.releaseMs} limits={MASTERING_LIMITS.compressorReleaseMs} step={1} suffix="ms" disabled={disabled} onCommit={(value) => onParameter(["releaseMs"], value)} />
        <Field label="Knee" value={compressor.knee} limits={MASTERING_LIMITS.compressorKnee} suffix="" disabled={disabled} onCommit={(value) => onParameter(["knee"], value)} />
        <Field label="Makeup" value={compressor.makeupGainDb} limits={MASTERING_LIMITS.compressorMakeupGainDb} suffix="dB" disabled={disabled} onCommit={(value) => onParameter(["makeupGainDb"], value)} />
        <Field label="Sidechain filter" value={compressor.sidechainFilterHz} limits={MASTERING_LIMITS.compressorSidechainFilterHz} step={1} suffix="Hz" disabled={disabled} onCommit={(value) => onParameter(["sidechainFilterHz"], value)} />
        <Field label="Mix" value={Math.round(compressor.mix * 100)} minimum={0} maximum={100} step={1} suffix="%" disabled={disabled} onCommit={(value) => onParameter(["mix"], value / 100)} />
        <label className="master-select-field"><span>Detection</span><select value={compressor.detection} disabled={disabled} onChange={(event) => onParameter(["detection"], event.target.value)}><option value="rms">RMS</option><option value="peak">Peak</option></select></label>
        <label className="master-select-field"><span>Stereo link</span><select value={compressor.link} disabled={disabled} onChange={(event) => onParameter(["link"], event.target.value)}><option value="maximum">Maximum</option><option value="average">Average</option></select></label>
      </div></ManualValues>
    </>
  );
}

function PremiumOutput({ node, disabled, onBypass, onParameter }) {
  return <>
    <div className="premium-faceplate premium-faceplate--output"><div className="premium-brand"><EquipmentMakerMark node={node} /><strong>MASTER OUTPUT</strong><small>Calibrated line stage</small></div><RotaryControl label="Output level" value={node.parameters.outputGainDb} limits={MASTERING_LIMITS.outputGainDb} step={0.1} suffix="dB" precision={1} disabled={disabled} onChange={(value) => onParameter(["outputGainDb"], value)} /><div className={`premium-output-led ${node.bypass ? "" : "is-lit"}`}><i /><span>48 kHz / 24-bit print path</span></div><FaceplateCircuitSwitch node={node} mode="in" className="premium-faceplate-switch--output-in" onBypass={onBypass} /></div>
    <ManualValues><div className="master-module-fields premium-exact-values"><Field label="Output level" value={node.parameters.outputGainDb} limits={MASTERING_LIMITS.outputGainDb} suffix="dB" disabled={disabled} onCommit={(value) => onParameter(["outputGainDb"], value)} /></div></ManualValues>
  </>;
}

function PremiumLimiter({ node, disabled, onBypass, onParameter, meteringRef, live }) {
  const limiter = node.parameters;
  return (
    <>
      <div className="premium-faceplate premium-faceplate--limiter">
        <div className="premium-brand"><EquipmentMakerMark node={node} /><strong>PRECISION LIMITER</strong><small>{limiter.oversample}× oversampled final print</small></div>
        <FaceplateCircuitSwitch node={node} mode="in" className="premium-faceplate-switch--limiter-in" onBypass={onBypass} />
        <FaceplateCircuitSwitch node={node} mode="bypass" className="premium-faceplate-switch--limiter-bypass" onBypass={onBypass} />
        <HardwareGainReductionLeds meteringRef={meteringRef} meterNodeKey={`processor:${node.id}:limiter`} active={live && !disabled} />
        <LimiterTransferGraph limiter={limiter} meteringRef={meteringRef} meterNodeKey={`processor:${node.id}:limiter`} active={live && !disabled} />
        <div className="premium-knob-bank premium-knob-bank--limiter">
          <RotaryControl className="premium-mock-control premium-mock-control--limiter-ceiling" dialMarks={PREMIUM_DIAL_MARKS.ceiling} label="Ceiling" value={limiter.ceilingDbfs} limits={MASTERING_LIMITS.limiterCeilingDbfs} step={0.1} suffix="dBFS" precision={1} disabled={disabled} onChange={(value) => onParameter(["ceilingDbfs"], value)} />
          <RotaryControl className="premium-mock-control premium-mock-control--limiter-lookahead" dialMarks={PREMIUM_DIAL_MARKS.lookahead} label="Lookahead" value={limiter.attackMs} limits={MASTERING_LIMITS.limiterAttackMs} step={0.1} suffix="ms" scale="log" disabled={disabled} onChange={(value) => onParameter(["attackMs"], value)} />
          <RotaryControl className="premium-mock-control premium-mock-control--limiter-release" dialMarks={PREMIUM_DIAL_MARKS.limiterRelease} label="Release" value={limiter.releaseMs} limits={MASTERING_LIMITS.limiterReleaseMs} step={1} suffix="ms" scale="log" disabled={disabled} onChange={(value) => onParameter(["releaseMs"], value)} />
          <OversamplingSelector value={limiter.oversample} onChange={(value) => onParameter(["oversample"], value)} />
          <RotaryControl className="premium-mock-control premium-mock-control--limiter-stereo-link" dialMarks={PREMIUM_DIAL_MARKS.stereoLink} label="Stereo link" value={limiter.stereoLinkPercent} limits={MASTERING_LIMITS.limiterStereoLinkPercent} step={1} suffix="%" precision={0} disabled={disabled} onChange={(value) => onParameter(["stereoLinkPercent"], value)} />
        </div>
      </div>
      <ManualValues><div className="master-module-fields premium-exact-values">
        <Field label="Ceiling" value={limiter.ceilingDbfs} limits={MASTERING_LIMITS.limiterCeilingDbfs} suffix="dBFS" disabled={disabled} onCommit={(value) => onParameter(["ceilingDbfs"], value)} />
        <Field label="Lookahead" value={limiter.attackMs} limits={MASTERING_LIMITS.limiterAttackMs} suffix="ms" disabled={disabled} onCommit={(value) => onParameter(["attackMs"], value)} />
        <Field label="Release" value={limiter.releaseMs} limits={MASTERING_LIMITS.limiterReleaseMs} step={1} suffix="ms" disabled={disabled} onCommit={(value) => onParameter(["releaseMs"], value)} />
        <Field label="Stereo link" value={limiter.stereoLinkPercent} limits={MASTERING_LIMITS.limiterStereoLinkPercent} step={1} suffix="%" disabled={disabled} onCommit={(value) => onParameter(["stereoLinkPercent"], value)} />
      </div></ManualValues>
    </>
  );
}

function RackEquipment({ node, index, count, selected, rackBypassed, meteringRef, liveProcessing, playing, onSelect, onMove, onDuplicate, onRemove, onBypass, onParameter, onDragStart, onDrop }) {
  const definition = processorDefinition(node.typeId) || { accent: "graphite", rackUnits: 1, shortName: "EXT" };
  const disabled = Boolean(node.unavailable);
  const live = Boolean(liveProcessing && playing && !rackBypassed && !node.bypass);
  return (
    <article className={`premium-rack-unit premium-rack-unit--${definition.accent} ${selected ? "is-selected" : ""} ${node.bypass ? "is-bypassed" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => onDrop(event, index)} onClick={onSelect} aria-label={`${index + 1}. ${node.name}${node.bypass ? ", bypassed" : ""}`}>
      <span className="premium-rack-screw premium-rack-screw--tl" aria-hidden="true" /><span className="premium-rack-screw premium-rack-screw--tr" aria-hidden="true" /><span className="premium-rack-screw premium-rack-screw--bl" aria-hidden="true" /><span className="premium-rack-screw premium-rack-screw--br" aria-hidden="true" />
      <header className="premium-unit-heading"><div className="premium-drag-handle" draggable onDragStart={(event) => onDragStart(event, index)} title={`Drag ${node.name} to repatch`}><DragIcon /><span>{String(index + 1).padStart(2, "0")}</span></div><div><strong>{node.name}</strong><small>{definition.rackUnits}U {node.unavailable ? `${node.pluginRef?.format?.toUpperCase()} plug-in · unavailable` : "built-in plug-in"} · {node.bypass ? "bypassed" : "in circuit"}</small></div><EquipmentActions node={node} index={index} count={count} onMove={onMove} onDuplicate={onDuplicate} onRemove={onRemove} onBypass={onBypass} /></header>
      {node.typeId === ADVANCED_PROCESSOR_TYPES.eq && <PremiumEq node={node} disabled={disabled} onBypass={onBypass} onParameter={onParameter} meteringRef={meteringRef} live={live} />}
      {node.typeId === ADVANCED_PROCESSOR_TYPES.compressor && <PremiumCompressor node={node} disabled={disabled} onBypass={onBypass} onParameter={onParameter} meteringRef={meteringRef} live={live} />}
      {node.typeId === ADVANCED_PROCESSOR_TYPES.output && <PremiumOutput node={node} disabled={disabled} onBypass={onBypass} onParameter={onParameter} />}
      {node.typeId === ADVANCED_PROCESSOR_TYPES.limiter && <PremiumLimiter node={node} disabled={disabled} onBypass={onBypass} onParameter={onParameter} meteringRef={meteringRef} live={live} />}
      {node.typeId === ADVANCED_PROCESSOR_TYPES.stereoField && <StereoFieldFaceplate node={node} disabled={disabled} onBypass={onBypass} onParameter={onParameter} meteringRef={meteringRef} live={live} />}
      {node.typeId === ADVANCED_PROCESSOR_TYPES.harmonicColor && <HarmonicColorFaceplate node={node} disabled={disabled} onParameter={onParameter} />}
      {node.typeId === ADVANCED_PROCESSOR_TYPES.phaseAlignment && <PhaseAlignmentFaceplate node={node} disabled={disabled} onBypass={onBypass} onParameter={onParameter} meteringRef={meteringRef} live={live} />}
      {node.typeId === ADVANCED_PROCESSOR_TYPES.hfSmoother && <HfSmootherFaceplate node={node} disabled={disabled} onBypass={onBypass} onParameter={onParameter} />}
      {node.typeId === ADVANCED_PROCESSOR_TYPES.ambience && <MasteringAmbienceFaceplate node={node} disabled={disabled} onBypass={onBypass} onParameter={onParameter} />}
      {node.typeId === ADVANCED_PROCESSOR_TYPES.transientShaper && <TransientSculptorFaceplate node={node} disabled={disabled} onBypass={onBypass} onParameter={onParameter} />}
      {node.typeId === ADVANCED_PROCESSOR_TYPES.creativePhaser && <CreativePhaserFaceplate node={node} disabled={disabled} onBypass={onBypass} onParameter={onParameter} />}
      {node.unavailable ? <PluginPanel node={node} title={node.name} subtitle={`${node.pluginRef?.format?.toUpperCase()} · native host required`} warning="This owned plug-in is preserved in the rack but remains bypassed until the signed desktop host resolves it." /> : null}
    </article>
  );
}

function PluginInsertMenu({ definitions, value, onChange }) {
  const rootRef = useRef(null);
  const pluginsByCategory = useMemo(() => definitions.reduce((categories, definition) => {
    const members = categories.get(definition.category) || [];
    categories.set(definition.category, [...members, definition]);
    return categories;
  }, new Map()), [definitions]);
  const categories = useMemo(() => [...pluginsByCategory.keys()], [pluginsByCategory]);
  const selected = definitions.find((definition) => definition.typeId === value) || definitions[0];
  const [open, setOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState(selected?.category || categories[0] || "");

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  const toggle = () => {
    setActiveCategory(selected?.category || categories[0] || "");
    setOpen((current) => !current);
  };
  const choose = (definition) => {
    onChange(definition.typeId);
    setActiveCategory(definition.category);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={`premium-plugin-menu ${open ? "is-open" : ""}`} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setOpen(false); } }}>
      <span className="premium-plugin-menu-label">Plug-in to add</span>
      <button type="button" className="premium-plugin-menu-trigger" aria-label={`Plug-in to add: ${selected?.name || "None"}`} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
        <span><small>{selected?.category || "No category"}</small><strong>{selected?.name || "No plug-ins available"}</strong></span><ChevronIcon direction={open ? "up" : "down"} />
      </button>
      {open ? <div className="premium-plugin-menu-panel" role="menu" aria-label="Plug-in categories">
        {categories.map((category) => {
          const categoryPlugins = pluginsByCategory.get(category) || [];
          const active = activeCategory === category;
          return <div key={category} className={`premium-plugin-menu-category ${active ? "is-active" : ""}`} onPointerEnter={() => setActiveCategory(category)}>
            <button type="button" role="menuitem" aria-haspopup="menu" aria-expanded={active} aria-label={`${category}, ${categoryPlugins.length} plug-in${categoryPlugins.length === 1 ? "" : "s"}`} onFocus={() => setActiveCategory(category)} onClick={() => setActiveCategory(category)}><span>{category}</span><small>{categoryPlugins.length}</small><ChevronIcon direction="right" /></button>
            {active ? <div className="premium-plugin-submenu" role="menu" aria-label={`${category} plug-ins`}>
              {categoryPlugins.map((definition) => <button key={definition.typeId} type="button" role="menuitem" className={definition.typeId === value ? "is-selected" : ""} aria-current={definition.typeId === value ? "true" : undefined} onClick={() => choose(definition)}><span><strong>{definition.name}</strong><small>{definition.rackUnits}U · {definition.shortName}</small></span>{definition.typeId === value ? <i aria-hidden="true">●</i> : null}</button>)}
            </div> : null}
          </div>;
        })}
      </div> : null}
    </div>
  );
}

export function AdvancedMasteringRack({ rack, onChange, meteringRef, meteringAvailable, playing, liveProcessing, monitorLabel, monitorMode = "stereo", onMonitorModeChange }) {
  const normalized = useMemo(() => normalizeAdvancedMastering(rack), [rack]);
  const availablePlugins = useMemo(() => availablePluginDefinitions(), []);
  const [selectedId, setSelectedId] = useState(normalized.nodes[0]?.id || "");
  const [addType, setAddType] = useState(ADVANCED_PROCESSOR_TYPES.eq);
  const [dragIndex, setDragIndex] = useState(-1);
  useEffect(() => { if (!normalized.nodes.some((node) => node.id === selectedId)) setSelectedId(normalized.nodes[0]?.id || ""); }, [normalized.nodes, selectedId]);

  const commitNodes = (nodes) => onChange(serialRack(normalized, nodes));
  const move = (from, to) => {
    if (from === to || from < 0 || to < 0 || from >= normalized.nodes.length || to >= normalized.nodes.length) return;
    const nodes = [...normalized.nodes];
    const [node] = nodes.splice(from, 1);
    nodes.splice(to, 0, node);
    commitNodes(nodes);
  };
  const updateNode = (id, recipe) => commitNodes(normalized.nodes.map((node) => node.id === id ? recipe(structuredClone(node)) : node));
  const add = () => {
    if (normalized.nodes.length >= ADVANCED_RACK_MAX_PROCESSORS) return;
    const node = createAdvancedProcessor(addType, uniqueProcessorId(normalized, addType));
    commitNodes([...normalized.nodes, node]);
    setSelectedId(node.id);
  };
  const duplicate = (node) => {
    if (normalized.nodes.length >= ADVANCED_RACK_MAX_PROCESSORS) return;
    const copy = { ...structuredClone(node), id: uniqueProcessorId(normalized, node.typeId), name: `${processorDefinition(node.typeId)?.name || node.name} Copy` };
    const index = normalized.nodes.findIndex((candidate) => candidate.id === node.id);
    const nodes = [...normalized.nodes];
    nodes.splice(index + 1, 0, copy);
    commitNodes(nodes);
    setSelectedId(copy.id);
  };
  const remove = (node) => commitNodes(normalized.nodes.filter((candidate) => candidate.id !== node.id));
  const activeCount = normalized.bypass ? 0 : normalized.nodes.filter((node) => !node.bypass && !node.unavailable).length;
  const startRackDrag = (event, from) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-project-sequencer-rack-index", String(from));
    event.dataTransfer.setData("text/plain", String(from));
    setDragIndex(from);
  };
  const finishRackDrop = (event, to) => {
    event.preventDefault();
    const transferredIndex = Number.parseInt(
      event.dataTransfer.getData("application/x-project-sequencer-rack-index") || event.dataTransfer.getData("text/plain"),
      10,
    );
    move(Number.isInteger(transferredIndex) ? transferredIndex : dragIndex, to);
    setDragIndex(-1);
  };

  return (
    <section className={`premium-mastering-rack ${normalized.bypass ? "is-bypassed" : ""}`} aria-labelledby="premium-rack-title">
      <header className="premium-rack-heading">
        <div><span className="premium-badge">PREMIUM</span><div><h3 id="premium-rack-title">Advanced Mastering Plug-in Rack</h3><p>Add, remove, reorder, duplicate, or bypass processors · live audition follows rack order · final print is authoritative</p></div></div>
        <div className="premium-rack-master-actions"><strong>{normalized.bypass ? "Rack bypassed" : `${activeCount}/${normalized.nodes.length} plug-ins in circuit`}</strong><label className={`master-bypass-switch ${normalized.bypass ? "is-enabled" : ""}`}><input type="checkbox" checked={normalized.bypass} onChange={(event) => onChange({ ...normalized, bypass: event.target.checked })} /><span>Bypass rack</span></label><button type="button" className="text-button" onClick={() => { const reset = createDefaultAdvancedMastering(); onChange(reset); setSelectedId(reset.nodes[0].id); }}><RefreshIcon /> Reset rack</button></div>
      </header>

      <div className="premium-rack-toolbar">
        <div className="premium-rack-add-controls">
          <PluginInsertMenu definitions={availablePlugins} value={addType} onChange={setAddType} />
          <button type="button" className="premium-rack-add-button" aria-label="Add plug-in to end of rack" data-tooltip="Add plug-in to end of rack" onClick={add} disabled={normalized.nodes.length >= ADVANCED_RACK_MAX_PROCESSORS}><PlusIcon /><span className="sr-only">Add plug-in to end of rack</span></button>
        </div>
        <div className="premium-plugin-boundary"><span>THIRD-PARTY VST3 / AU</span><strong>Ownership-aware native host connection</strong><small>Projects preserve external plug-in identity and state; execution remains bypassed until the signed desktop host resolves an owned installation.</small></div>
      </div>

      <div className="premium-rack-layout">
        <aside className="premium-patch-bay" aria-label="Premium mastering patch order">
          <header><span>PATCH</span><div><strong>Signal Order</strong><small>Drag or use arrows</small></div></header>
          <ol>
            <li className="premium-patch-terminal"><i /><span><strong>INPUT</strong><small>Album program</small></span></li>
            {normalized.nodes.map((node, index) => {
              const definition = processorDefinition(node.typeId) || { shortName: "EXT" };
              return <li key={node.id} className={`${node.id === selectedId ? "is-selected" : ""} ${node.bypass ? "is-bypassed" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => finishRackDrop(event, index)}><button type="button" draggable onDragStart={(event) => startRackDrag(event, index)} onClick={() => { setSelectedId(node.id); document.getElementById(`premium-unit-${node.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); }}><i /><span><strong>{String(index + 1).padStart(2, "0")} · {definition.shortName}</strong><small>{node.name}</small></span><DragIcon /></button></li>;
            })}
            <li className="premium-patch-terminal"><i /><span><strong>OUTPUT</strong><small>Meter / print</small></span></li>
          </ol>
          <p>Each cable is rebuilt from top to bottom. Bypassed units stay in position but pass signal unchanged.</p>
        </aside>

        <div className="premium-equipment-rack" aria-label="Premium analog mastering equipment">
          {normalized.nodes.length ? normalized.nodes.map((node, index) => <div id={`premium-unit-${node.id}`} key={node.id}><RackEquipment node={node} index={index} count={normalized.nodes.length} selected={node.id === selectedId} rackBypassed={normalized.bypass} meteringRef={meteringRef} liveProcessing={liveProcessing} playing={playing} onSelect={() => setSelectedId(node.id)} onMove={move} onDuplicate={() => duplicate(node)} onRemove={() => remove(node)} onBypass={(bypass) => updateNode(node.id, (draft) => ({ ...draft, bypass }))} onParameter={(path, value) => updateNode(node.id, (draft) => ({ ...draft, parameters: pathSet(draft.parameters, path, value) }))} onDragStart={startRackDrag} onDrop={finishRackDrop} /></div>) : <div className="premium-empty-rack"><strong>The rack is empty.</strong><p>Add any processor above. Input passes directly to output until equipment is inserted.</p></div>}
        </div>
      </div>

      <details className="premium-meter-drawer">
        <summary><span>Master output monitor</span><small>Detailed levels, peaks, and spectrum</small></summary>
        <MasterOutputMeters meteringRef={meteringRef} available={meteringAvailable} playing={playing} monitorLabel={monitorLabel} monitorMode={monitorMode} onMonitorModeChange={onMonitorModeChange} />
      </details>
    </section>
  );
}
