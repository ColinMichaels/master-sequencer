import React, { useEffect, useRef, useState } from "react";
import { ADVANCED_PROCESSOR_LIMITS } from "../lib/advanced-mastering.js";
import { calculateStereoCorrelation, sampleVectorscope } from "../lib/master-metering.js";
import { MASTERING_LIMITS } from "../lib/mastering.js";
import { ManualValues, MasteringNumberField, RotaryControl } from "./MasteringControls.jsx";

// Presentation boundary: these faceplates read existing meters and update existing
// parameter paths. Audio graphs, render filters, normalization, and persistence stay elsewhere.
const CHANNEL_TARGETS = Object.freeze([
  { value: "left", label: "L", name: "Left" },
  { value: "right", label: "R", name: "Right" },
  { value: "mid", label: "M", name: "Mid" },
  { value: "side", label: "S", name: "Side" },
]);

const Field = ({ label, value, limits, minimum, maximum, step = 0.1, suffix, disabled, onCommit }) => (
  <MasteringNumberField label={label} value={value} minimum={limits?.minimum ?? minimum} maximum={limits?.maximum ?? maximum} step={step} suffix={suffix} disabled={disabled} onCommit={onCommit} />
);

function useCompactStereoFrame({ active, meteringRef }) {
  const [frame, setFrame] = useState({ correlation: 0, vectorscope: [], active: false });
  const animationRef = useRef(0);
  const lastFrameAtRef = useRef(0);
  const buffersRef = useRef({ left: null, right: null });

  useEffect(() => {
    if (!active) {
      setFrame((current) => current.active ? { correlation: 0, vectorscope: [], active: false } : current);
      return undefined;
    }
    const draw = (timestamp) => {
      animationRef.current = requestAnimationFrame(draw);
      if (timestamp - lastFrameAtRef.current < 50) return;
      lastFrameAtRef.current = timestamp;
      const meter = meteringRef?.current;
      const leftAnalyser = meter?.leftAnalyser;
      const rightAnalyser = meter?.rightAnalyser;
      if (!leftAnalyser || !rightAnalyser || typeof leftAnalyser.getFloatTimeDomainData !== "function" || typeof rightAnalyser.getFloatTimeDomainData !== "function") return;
      if (buffersRef.current.left?.length !== leftAnalyser.fftSize) buffersRef.current.left = new Float32Array(leftAnalyser.fftSize);
      if (buffersRef.current.right?.length !== rightAnalyser.fftSize) buffersRef.current.right = new Float32Array(rightAnalyser.fftSize);
      leftAnalyser.getFloatTimeDomainData(buffersRef.current.left);
      rightAnalyser.getFloatTimeDomainData(buffersRef.current.right);
      setFrame({
        correlation: calculateStereoCorrelation(buffersRef.current.left, buffersRef.current.right),
        vectorscope: sampleVectorscope(buffersRef.current.left, buffersRef.current.right, { points: 72 }),
        active: true,
      });
    };
    animationRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animationRef.current);
  }, [active, meteringRef]);

  return frame;
}

function FaceplateScope({ active, meteringRef, compact = false }) {
  const frame = useCompactStereoFrame({ active, meteringRef });
  return (
    <figure className={`analog-scope ${compact ? "analog-scope--compact" : ""} ${frame.active ? "is-active" : ""} ${frame.correlation < 0 ? "has-negative-correlation" : ""}`} data-correlation={frame.correlation.toFixed(3)}>
      <svg viewBox="0 0 200 180" role="img" aria-label={frame.active ? `Post-rack stereo vectorscope. Correlation ${frame.correlation.toFixed(2)}.` : "Post-rack stereo vectorscope awaiting playback."}>
        <g className="analog-scope-grid" aria-hidden="true"><line x1="100" y1="8" x2="100" y2="172" /><line x1="18" y1="90" x2="182" y2="90" /><line x1="42" y1="32" x2="158" y2="148" /><line x1="158" y1="32" x2="42" y2="148" /><circle cx="100" cy="90" r="68" /></g>
        <g className="analog-scope-points" aria-hidden="true">{frame.vectorscope.map((point, index) => <circle key={index} cx={100 + point.x * 76} cy={90 - point.y * 76} r={compact ? 2.1 : 1.7} />)}</g>
      </svg>
      <figcaption><span>−1</span><i><b style={{ left: `${(frame.correlation + 1) * 50}%` }} /></i><strong>{frame.active ? frame.correlation.toFixed(2) : "STANDBY"}</strong><span>+1</span></figcaption>
    </figure>
  );
}

function CircuitButton({ node, className, onBypass }) {
  const inCircuit = !node.bypass;
  return (
    <button type="button" className={`analog-circuit-button ${className} ${inCircuit ? "is-powered" : ""}`} aria-label={`${node.name}: ${inCircuit ? "bypass" : "put in circuit"}`} aria-pressed={inCircuit} onClick={() => onBypass(inCircuit)}>
      <i aria-hidden="true" /><span>{inCircuit ? "IN" : "BYP"}</span>
    </button>
  );
}

export function StereoFieldFaceplate({ node, disabled, onBypass, onParameter, meteringRef, live }) {
  const field = node.parameters;
  return (
    <>
      <div className="spatial-faceplate spatial-faceplate--field">
        <div className="analog-faceplate-brand analog-faceplate-brand--field"><strong>HARBOR SIGNAL</strong><span>S-4 FIELD</span><small>Stereo field matrix</small></div>
        <RotaryControl className="analog-control analog-control--field-width" label="Width" value={field.widthDb} limits={ADVANCED_PROCESSOR_LIMITS.widthDb} step={0.1} suffix="dB Side" precision={1} disabled={disabled} onChange={(value) => onParameter(["widthDb"], value)} />
        <RotaryControl className="analog-control analog-control--field-depth" label="Depth" value={field.depthDb} limits={ADVANCED_PROCESSOR_LIMITS.depthDb} step={0.1} suffix="dB Mid" precision={1} disabled={disabled} onChange={(value) => onParameter(["depthDb"], value)} />
        <RotaryControl className="analog-control analog-control--field-space" label="Space" value={field.spaceDb} limits={ADVANCED_PROCESSOR_LIMITS.spaceDb} step={0.1} suffix="dB Side" precision={1} disabled={disabled} onChange={(value) => onParameter(["spaceDb"], value)} />
        <RotaryControl className="analog-control analog-control--field-space-frequency" label="Space Hz" value={field.spaceFrequencyHz} limits={ADVANCED_PROCESSOR_LIMITS.spaceFrequencyHz} step={1} suffix="Hz" precision={0} scale="log" disabled={disabled} onChange={(value) => onParameter(["spaceFrequencyHz"], value)} />
        <FaceplateScope active={live && !disabled} meteringRef={meteringRef} />
        <label className="analog-balance-control"><span>BALANCE</span><input type="range" min={ADVANCED_PROCESSOR_LIMITS.balance.minimum} max={ADVANCED_PROCESSOR_LIMITS.balance.maximum} step="0.01" value={field.balance} disabled={disabled} aria-label="Stereo balance graphical control" aria-valuetext={`${field.balance.toFixed(2)} left/right`} onChange={(event) => onParameter(["balance"], Number(event.target.value))} /><output>{field.balance === 0 ? "C" : `${Math.abs(field.balance).toFixed(2)} ${field.balance < 0 ? "L" : "R"}`}</output></label>
        <div className="analog-protected-control"><span>MONO BELOW</span><RotaryControl className="analog-control analog-control--field-mono" label="Mono below" value={field.monoBelowHz} limits={ADVANCED_PROCESSOR_LIMITS.monoBelowHz} step={1} suffix="Hz" precision={0} scale="log" disabled={disabled} onChange={(value) => onParameter(["monoBelowHz"], value)} /><small>LOW FOCUS</small></div>
        <CircuitButton node={node} className="analog-circuit-button--field" onBypass={onBypass} />
      </div>
      <ManualValues><div className="master-module-fields premium-exact-values">
        <Field label="Width" value={field.widthDb} limits={ADVANCED_PROCESSOR_LIMITS.widthDb} suffix="dB Side" disabled={disabled} onCommit={(value) => onParameter(["widthDb"], value)} />
        <Field label="Depth" value={field.depthDb} limits={ADVANCED_PROCESSOR_LIMITS.depthDb} suffix="dB Mid" disabled={disabled} onCommit={(value) => onParameter(["depthDb"], value)} />
        <Field label="Mono below" value={field.monoBelowHz} limits={ADVANCED_PROCESSOR_LIMITS.monoBelowHz} step={1} suffix="Hz" disabled={disabled} onCommit={(value) => onParameter(["monoBelowHz"], value)} />
        <Field label="Space" value={field.spaceDb} limits={ADVANCED_PROCESSOR_LIMITS.spaceDb} suffix="dB Side" disabled={disabled} onCommit={(value) => onParameter(["spaceDb"], value)} />
        <Field label="Space frequency" value={field.spaceFrequencyHz} limits={ADVANCED_PROCESSOR_LIMITS.spaceFrequencyHz} step={1} suffix="Hz" disabled={disabled} onCommit={(value) => onParameter(["spaceFrequencyHz"], value)} />
        <Field label="Balance" value={field.balance} limits={ADVANCED_PROCESSOR_LIMITS.balance} step={0.01} suffix="L/R" disabled={disabled} onCommit={(value) => onParameter(["balance"], value)} />
      </div></ManualValues>
    </>
  );
}

export function PhaseAlignmentFaceplate({ node, disabled, onBypass, onParameter, meteringRef, live }) {
  const phase = node.parameters;
  return (
    <>
      <div className="spatial-faceplate spatial-faceplate--phase">
        <div className="analog-faceplate-brand analog-faceplate-brand--phase"><strong>RESOLUTE WORKS</strong><span>P-1 ALIGN</span><small>Phase repair instrument</small></div>
        <button type="button" className={`analog-polarity-switch ${phase.polarityInvert ? "is-inverted" : ""}`} disabled={disabled} aria-label="Invert target polarity" aria-pressed={phase.polarityInvert} onClick={() => onParameter(["polarityInvert"], !phase.polarityInvert)}><i aria-hidden="true" /><span>POLARITY</span></button>
        <RotaryControl className="analog-control analog-control--phase-delay" label="Delay" value={phase.delaySamples} limits={ADVANCED_PROCESSOR_LIMITS.phaseDelaySamples} step={1} suffix="samples" precision={0} disabled={disabled} onChange={(value) => onParameter(["delaySamples"], value)} />
        <RotaryControl className="analog-control analog-control--phase-frequency" label="AP center" value={phase.centerFrequencyHz} limits={MASTERING_LIMITS.highShelfFrequencyHz} step={1} suffix="Hz" precision={0} scale="log" disabled={disabled} onChange={(value) => onParameter(["centerFrequencyHz"], value)} />
        <RotaryControl className="analog-control analog-control--phase-q" label="AP Q" value={phase.q} limits={MASTERING_LIMITS.midBandQ} step={0.01} suffix="Q" precision={2} disabled={disabled} onChange={(value) => onParameter(["q"], value)} />
        <RotaryControl className="analog-control analog-control--phase-rotation" label="Rotation" value={phase.shift} limits={ADVANCED_PROCESSOR_LIMITS.phaseShift} step={0.01} suffix="" precision={2} disabled={disabled} onChange={(value) => onParameter(["shift"], value)} />
        <div className="analog-target-selector" role="group" aria-label="Phase alignment target"><span>TARGET</span><div>{CHANNEL_TARGETS.map((target) => <button key={target.value} type="button" className={phase.target === target.value ? "is-active" : ""} disabled={disabled} aria-label={`Target ${target.name}`} aria-pressed={phase.target === target.value} onClick={() => onParameter(["target"], target.value)}><i aria-hidden="true" />{target.label}</button>)}</div></div>
        <RotaryControl className="analog-control analog-control--phase-mix" label="Repair mix" value={phase.mix * 100} minimum={0} maximum={100} step={1} suffix="%" precision={0} disabled={disabled} onChange={(value) => onParameter(["mix"], value / 100)} />
        <FaceplateScope active={live && !disabled} meteringRef={meteringRef} compact />
        <CircuitButton node={node} className="analog-circuit-button--phase" onBypass={onBypass} />
      </div>
      <p className="analog-repair-warning">STATIC REPAIR · verify correlation and mono playback before approval</p>
      <ManualValues><div className="master-module-fields premium-exact-values">
        <label className="master-select-field"><span>Target</span><select value={phase.target} disabled={disabled} onChange={(event) => onParameter(["target"], event.target.value)}>{CHANNEL_TARGETS.map((target) => <option key={target.value} value={target.value}>{target.name}</option>)}</select></label>
        <label className="premium-plugin-toggle"><input type="checkbox" checked={phase.polarityInvert} disabled={disabled} onChange={(event) => onParameter(["polarityInvert"], event.target.checked)} /><span>Invert target polarity</span></label>
        <Field label="Delay" value={phase.delaySamples} limits={ADVANCED_PROCESSOR_LIMITS.phaseDelaySamples} step={1} suffix="samples" disabled={disabled} onCommit={(value) => onParameter(["delaySamples"], value)} />
        <Field label="All-pass center" value={phase.centerFrequencyHz} limits={MASTERING_LIMITS.highShelfFrequencyHz} step={1} suffix="Hz" disabled={disabled} onCommit={(value) => onParameter(["centerFrequencyHz"], value)} />
        <Field label="All-pass Q" value={phase.q} limits={MASTERING_LIMITS.midBandQ} step={0.01} suffix="Q" disabled={disabled} onCommit={(value) => onParameter(["q"], value)} />
        <Field label="Rotation" value={phase.shift} limits={ADVANCED_PROCESSOR_LIMITS.phaseShift} step={0.01} suffix="" disabled={disabled} onCommit={(value) => onParameter(["shift"], value)} />
        <Field label="Mix" value={phase.mix * 100} minimum={0} maximum={100} step={1} suffix="%" disabled={disabled} onCommit={(value) => onParameter(["mix"], value / 100)} />
      </div></ManualValues>
    </>
  );
}
