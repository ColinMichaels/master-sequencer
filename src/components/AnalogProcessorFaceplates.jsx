import React from "react";
import { ADVANCED_PROCESSOR_LIMITS } from "../lib/advanced-mastering.js";
import { MASTERING_LIMITS } from "../lib/mastering.js";
import { ManualValues, MasteringNumberField, RotaryControl } from "./MasteringControls.jsx";

// Presentation boundary: these faceplates only map the existing normalized
// processor parameters to hardware-style controls. Audio routing, DSP, state
// normalization, and plug-in identity remain owned by the existing rack model.

const CHANNEL_MODE_OPTIONS = Object.freeze([
  { value: "stereo", label: "Stereo L/R" },
  { value: "mid", label: "Mid only" },
  { value: "side", label: "Side only" },
]);

function Field({ label, value, limits, minimum, maximum, step = 0.1, suffix, disabled, onCommit }) {
  return <MasteringNumberField label={label} value={value} minimum={limits?.minimum ?? minimum} maximum={limits?.maximum ?? maximum} step={step} suffix={suffix} disabled={disabled} onCommit={onCommit} />;
}

function SelectField({ label, value, options, disabled, onChange }) {
  return <label className="master-select-field"><span>{label}</span><select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}

function FaceplateIdentity({ maker, model, title }) {
  return <span className="processor-faceplate-identity"><strong>{maker}</strong><b>{model}</b><small>{title}</small></span>;
}

function FaceplateRotary({ className, ...props }) {
  return <RotaryControl className={`premium-mock-control processor-mock-control ${className}`} {...props} />;
}

function FaceplateBypass({ node, className, onBypass }) {
  const active = !node.bypass;
  return (
    <button type="button" className={`processor-bypass-button ${active ? "is-powered" : ""} ${className}`} aria-label={`${node.name}: ${active ? "bypass" : "put in circuit"}`} aria-pressed={active} onClick={() => onBypass(active)}>
      <span aria-hidden="true"><i /></span><b aria-hidden="true" /><em>{active ? "In circuit" : "Bypassed"}</em>
    </button>
  );
}

function OptionSelector({ label, value, options, className, disabled, onChange }) {
  return (
    <div className={`processor-option-selector ${className}`} role="group" aria-label={label}>
      <span>{label}</span>
      <div>{options.map((option) => <button key={option.value} type="button" className={value === option.value ? "is-active" : ""} disabled={disabled} aria-pressed={value === option.value} onClick={() => onChange(option.value)}>{option.shortLabel || option.label}</button>)}</div>
    </div>
  );
}

function StepSelector({ value, disabled, onChange }) {
  return (
    <div className="processor-step-selector" role="group" aria-label="Oversampling">
      <span>Oversampling</span>
      {[1, 2, 4].map((factor) => <button key={factor} type="button" className={value === factor ? "is-active" : ""} disabled={disabled} aria-label={`${factor}× oversampling`} aria-pressed={value === factor} onClick={() => onChange(factor)}><i aria-hidden="true" />{factor}×</button>)}
    </div>
  );
}

function ToggleKnob({ label, checked, className, disabled, onChange }) {
  return (
    <label className={`processor-toggle-knob ${checked ? "is-active" : ""} ${className}`}>
      <input type="checkbox" checked={checked} disabled={disabled} aria-label={label} onChange={(event) => onChange(event.target.checked)} />
      <span aria-hidden="true"><i /></span><output>{checked ? "Linked" : "Independent"}</output>
    </label>
  );
}

function HarmonicDisplay({ even, odd, drive }) {
  const evenLevel = Math.max(0.08, even);
  const oddLevel = Math.max(0.08, odd);
  const driveLevel = Math.min(1, drive / 18);
  return (
    <figure className="processor-display processor-display--harmonics" aria-label={`Harmonic balance: ${Math.round(even * 100)} percent even, ${Math.round(odd * 100)} percent odd`}>
      <svg viewBox="0 0 200 86" aria-hidden="true">
        <g className="processor-display-grid"><path d="M8 14H192M8 43H192M8 72H192M35 8V78M72 8V78M109 8V78M146 8V78" /></g>
        <path className="processor-harmonic-trace processor-harmonic-trace--even" style={{ opacity: 0.32 + evenLevel * 0.68 }} d={`M8 43 L34 43 L40 ${43 - 25 * evenLevel} L46 43 L70 43 L76 ${43 - 18 * evenLevel} L82 43 L108 43 L114 ${43 - 12 * evenLevel} L120 43 L192 43`} />
        <path className="processor-harmonic-trace processor-harmonic-trace--odd" style={{ opacity: 0.32 + oddLevel * 0.68 }} d={`M8 43 L55 43 L61 ${43 - 23 * oddLevel} L67 43 L96 43 L102 ${43 - 16 * oddLevel} L108 43 L137 43 L143 ${43 - 10 * oddLevel} L149 43 L192 43`} />
        <path className="processor-harmonic-energy" style={{ opacity: 0.2 + driveLevel * 0.8 }} d="M8 43H192" />
      </svg>
    </figure>
  );
}

function AmbienceDisplay({ decaySeconds, dampingHz, active }) {
  const decay = (decaySeconds - 0.2) / 9.8;
  const damping = (dampingHz - 1_000) / 19_000;
  const tailY = 45 - damping * 13;
  return (
    <figure className={`processor-display processor-display--ambience ${active ? "is-active" : ""}`} aria-label={`Ambience decay ${decaySeconds.toFixed(2)} seconds`}>
      <svg viewBox="0 0 220 86" aria-hidden="true">
        <g className="processor-display-grid"><path d="M8 16H212M8 43H212M8 70H212M42 8V78M80 8V78M118 8V78M156 8V78M194 8V78" /></g>
        <path className="processor-ambience-fill" d={`M8 15 C ${42 + decay * 34} 31, ${112 + decay * 42} ${tailY}, 212 43 L212 78 L8 78 Z`} />
        <path className="processor-ambience-trace" d={`M8 15 C ${42 + decay * 34} 31, ${112 + decay * 42} ${tailY}, 212 43`} />
      </svg>
    </figure>
  );
}

function TransientDisplay({ attackDb, sustainDb, focused, active }) {
  const attackY = 43 - attackDb * 5.5;
  const sustainY = 43 - sustainDb * 3;
  return (
    <figure className={`processor-display processor-display--transient ${active ? "is-active" : ""}`} aria-label={`Transient response, attack ${attackDb.toFixed(1)} dB, sustain ${sustainDb.toFixed(1)} dB`}>
      <svg viewBox="0 0 220 82" aria-hidden="true">
        <g className="processor-display-grid"><path d="M8 41H212M44 9V73M86 9V73M128 9V73M170 9V73" /></g>
        <path className="processor-transient-trace" d={`M8 41 H58 L65 ${attackY} L72 ${58 - attackDb * 2} L82 41 C95 ${sustainY}, 118 ${sustainY}, ${focused ? 148 : 184} 41 H212`} />
      </svg>
    </figure>
  );
}

function PhaserDisplay({ depth, feedback, stereoOffsetDegrees, active }) {
  const spread = 22 + depth * 22;
  const rotation = Math.max(-90, Math.min(90, stereoOffsetDegrees)) / 2;
  const feedbackOpacity = 0.35 + Math.abs(feedback) * 0.7;
  return (
    <figure className={`processor-display processor-display--phaser ${active ? "is-active" : ""}`} aria-label={`Phase orbit, ${Math.round(depth * 100)} percent depth, ${stereoOffsetDegrees} degree stereo offset`}>
      <svg viewBox="0 0 180 100" aria-hidden="true">
        <g className="processor-display-grid"><path d="M8 50H172M90 7V93" /><ellipse cx="90" cy="50" rx="62" ry="35" /></g>
        <g className="processor-phase-orbit" style={{ "--phase-rotation": `${rotation}deg`, opacity: feedbackOpacity }}>
          <ellipse cx="90" cy="50" rx="62" ry={spread} />
          <ellipse cx="90" cy="50" rx={spread} ry="42" />
        </g>
      </svg>
    </figure>
  );
}

export function HarmonicColorFaceplate({ node, disabled, onParameter }) {
  const color = node.parameters;
  return <>
    <div className="processor-faceplate processor-faceplate--color">
      <FaceplateIdentity maker="Northline Audio" model="H-3 Color" title="Harmonic Color" />
      <FaceplateRotary className="processor-control--color-drive" label="Drive" value={color.driveDb} limits={ADVANCED_PROCESSOR_LIMITS.colorDriveDb} step={0.1} suffix="dB" precision={1} disabled={disabled} onChange={(value) => onParameter(["driveDb"], value)} />
      <FaceplateRotary className="processor-control--color-even" label="Even harmonics" value={color.evenAmount * 100} minimum={0} maximum={100} step={1} suffix="%" precision={0} disabled={disabled} onChange={(value) => onParameter(["evenAmount"], value / 100)} />
      <FaceplateRotary className="processor-control--color-odd" label="Odd harmonics" value={color.oddAmount * 100} minimum={0} maximum={100} step={1} suffix="%" precision={0} disabled={disabled} onChange={(value) => onParameter(["oddAmount"], value / 100)} />
      <FaceplateRotary className="processor-control--color-focus" label="Color focus" value={color.colorFrequencyHz} limits={ADVANCED_PROCESSOR_LIMITS.colorFrequencyHz} step={1} suffix="Hz" scale="log" disabled={disabled} onChange={(value) => onParameter(["colorFrequencyHz"], value)} />
      <HarmonicDisplay even={color.evenAmount} odd={color.oddAmount} drive={color.driveDb} />
      <FaceplateRotary className="processor-control--color-mix" label="Mix" value={color.mix * 100} minimum={0} maximum={100} step={1} suffix="%" precision={0} disabled={disabled} onChange={(value) => onParameter(["mix"], value / 100)} />
      <FaceplateRotary className="processor-control--color-output" label="Output" value={color.outputGainDb} limits={MASTERING_LIMITS.outputGainDb} step={0.1} suffix="dB" precision={1} disabled={disabled} onChange={(value) => onParameter(["outputGainDb"], value)} />
      <StepSelector value={color.oversample} disabled={disabled} onChange={(value) => onParameter(["oversample"], value)} />
    </div>
    <ManualValues><div className="master-module-fields processor-exact-values">
      <SelectField label="Channel mode" value={color.channelMode} options={CHANNEL_MODE_OPTIONS} disabled={disabled} onChange={(value) => onParameter(["channelMode"], value)} />
      <Field label="Drive" value={color.driveDb} limits={ADVANCED_PROCESSOR_LIMITS.colorDriveDb} suffix="dB" disabled={disabled} onCommit={(value) => onParameter(["driveDb"], value)} />
      <Field label="Even harmonics" value={color.evenAmount * 100} minimum={0} maximum={100} step={1} suffix="%" disabled={disabled} onCommit={(value) => onParameter(["evenAmount"], value / 100)} />
      <Field label="Odd harmonics" value={color.oddAmount * 100} minimum={0} maximum={100} step={1} suffix="%" disabled={disabled} onCommit={(value) => onParameter(["oddAmount"], value / 100)} />
      <Field label="Color focus" value={color.colorFrequencyHz} limits={ADVANCED_PROCESSOR_LIMITS.colorFrequencyHz} step={1} suffix="Hz" disabled={disabled} onCommit={(value) => onParameter(["colorFrequencyHz"], value)} />
      <Field label="Mix" value={color.mix * 100} minimum={0} maximum={100} step={1} suffix="%" disabled={disabled} onCommit={(value) => onParameter(["mix"], value / 100)} />
      <SelectField label="Oversampling" value={String(color.oversample)} options={[1, 2, 4].map((value) => ({ value: String(value), label: `${value}×` }))} disabled={disabled} onChange={(value) => onParameter(["oversample"], Number(value))} />
      <Field label="Output" value={color.outputGainDb} limits={MASTERING_LIMITS.outputGainDb} suffix="dB" disabled={disabled} onCommit={(value) => onParameter(["outputGainDb"], value)} />
    </div></ManualValues>
  </>;
}

export function HfSmootherFaceplate({ node, disabled, onBypass, onParameter }) {
  const smoother = node.parameters;
  return <>
    <div className="processor-faceplate processor-faceplate--smoother">
      <FaceplateIdentity maker="Ironvale Labs" model="HF-2 Smooth" title="HF Smoother" />
      <FaceplateRotary className="processor-control--hf-frequency" label="Crossover" value={smoother.frequencyHz} limits={ADVANCED_PROCESSOR_LIMITS.hfFrequencyHz} step={1} suffix="Hz" scale="log" disabled={disabled} onChange={(value) => onParameter(["frequencyHz"], value)} />
      <FaceplateRotary className="processor-control--hf-threshold" label="Threshold" value={smoother.thresholdDb} limits={MASTERING_LIMITS.compressorThresholdDb} step={0.1} suffix="dB" precision={1} disabled={disabled} onChange={(value) => onParameter(["thresholdDb"], value)} />
      <FaceplateRotary className="processor-control--hf-ratio" label="Ratio" value={smoother.ratio} limits={ADVANCED_PROCESSOR_LIMITS.hfRatio} step={0.1} suffix=":1" precision={1} disabled={disabled} onChange={(value) => onParameter(["ratio"], value)} />
      <FaceplateRotary className="processor-control--hf-attack" label="Attack" value={smoother.attackMs} limits={MASTERING_LIMITS.compressorAttackMs} step={0.1} suffix="ms" scale="log" disabled={disabled} onChange={(value) => onParameter(["attackMs"], value)} />
      <FaceplateRotary className="processor-control--hf-release" label="Release" value={smoother.releaseMs} limits={MASTERING_LIMITS.compressorReleaseMs} step={1} suffix="ms" scale="log" disabled={disabled} onChange={(value) => onParameter(["releaseMs"], value)} />
      <FaceplateRotary className="processor-control--hf-mix" label="Mix" value={smoother.mix * 100} minimum={0} maximum={100} step={1} suffix="%" precision={0} disabled={disabled} onChange={(value) => onParameter(["mix"], value / 100)} />
      <FaceplateRotary className="processor-control--hf-output" label="Output" value={smoother.outputGainDb} limits={MASTERING_LIMITS.outputGainDb} step={0.1} suffix="dB" precision={1} disabled={disabled} onChange={(value) => onParameter(["outputGainDb"], value)} />
      <FaceplateBypass node={node} className="processor-bypass-button--smoother" onBypass={onBypass} />
    </div>
    <ManualValues><div className="master-module-fields processor-exact-values">
      <Field label="Crossover" value={smoother.frequencyHz} limits={ADVANCED_PROCESSOR_LIMITS.hfFrequencyHz} step={1} suffix="Hz" disabled={disabled} onCommit={(value) => onParameter(["frequencyHz"], value)} />
      <Field label="Threshold" value={smoother.thresholdDb} limits={MASTERING_LIMITS.compressorThresholdDb} suffix="dB" disabled={disabled} onCommit={(value) => onParameter(["thresholdDb"], value)} />
      <Field label="Ratio" value={smoother.ratio} limits={ADVANCED_PROCESSOR_LIMITS.hfRatio} step={0.1} suffix=":1" disabled={disabled} onCommit={(value) => onParameter(["ratio"], value)} />
      <Field label="Attack" value={smoother.attackMs} limits={MASTERING_LIMITS.compressorAttackMs} suffix="ms" disabled={disabled} onCommit={(value) => onParameter(["attackMs"], value)} />
      <Field label="Release" value={smoother.releaseMs} limits={MASTERING_LIMITS.compressorReleaseMs} step={1} suffix="ms" disabled={disabled} onCommit={(value) => onParameter(["releaseMs"], value)} />
      <Field label="Mix" value={smoother.mix * 100} minimum={0} maximum={100} step={1} suffix="%" disabled={disabled} onCommit={(value) => onParameter(["mix"], value / 100)} />
      <Field label="Output" value={smoother.outputGainDb} limits={MASTERING_LIMITS.outputGainDb} suffix="dB" disabled={disabled} onCommit={(value) => onParameter(["outputGainDb"], value)} />
    </div></ManualValues>
  </>;
}

export function MasteringAmbienceFaceplate({ node, disabled, onBypass, onParameter }) {
  const ambience = node.parameters;
  const options = ["room", "chamber", "plate"].map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1), shortLabel: value[0].toUpperCase() }));
  return <>
    <div className="processor-faceplate processor-faceplate--ambience">
      <FaceplateIdentity maker="Harbor Signal" model="A-7 Space" title="Mastering Ambience" />
      <OptionSelector label="Space type" value={ambience.model} options={options} className="processor-option-selector--ambience" disabled={disabled} onChange={(value) => onParameter(["model"], value)} />
      <FaceplateRotary className="processor-control--ambience-predelay" label="Pre-delay" value={ambience.preDelayMs} limits={ADVANCED_PROCESSOR_LIMITS.ambiencePreDelayMs} step={1} suffix="ms" disabled={disabled} onChange={(value) => onParameter(["preDelayMs"], value)} />
      <FaceplateRotary className="processor-control--ambience-decay" label="Decay" value={ambience.decaySeconds} limits={ADVANCED_PROCESSOR_LIMITS.ambienceDecaySeconds} step={0.01} suffix="s" precision={2} disabled={disabled} onChange={(value) => onParameter(["decaySeconds"], value)} />
      <AmbienceDisplay decaySeconds={ambience.decaySeconds} dampingHz={ambience.dampingHz} active={!node.bypass} />
      <FaceplateRotary className="processor-control--ambience-damping" label="Damping" value={ambience.dampingHz} limits={ADVANCED_PROCESSOR_LIMITS.ambienceDampingHz} step={1} suffix="Hz" scale="log" disabled={disabled} onChange={(value) => onParameter(["dampingHz"], value)} />
      <FaceplateRotary className="processor-control--ambience-lowcut" label="Low cut" value={ambience.lowCutHz} limits={ADVANCED_PROCESSOR_LIMITS.ambienceLowCutHz} step={1} suffix="Hz" scale="log" disabled={disabled} onChange={(value) => onParameter(["lowCutHz"], value)} />
      <FaceplateRotary className="processor-control--ambience-width" label="Width" value={ambience.widthPercent} limits={ADVANCED_PROCESSOR_LIMITS.ambienceWidthPercent} step={1} suffix="%" precision={0} disabled={disabled} onChange={(value) => onParameter(["widthPercent"], value)} />
      <FaceplateRotary className="processor-control--ambience-wet" label="Wet" value={ambience.wetPercent} limits={ADVANCED_PROCESSOR_LIMITS.ambienceWetPercent} step={0.1} suffix="%" precision={1} disabled={disabled} onChange={(value) => onParameter(["wetPercent"], value)} />
      <FaceplateBypass node={node} className="processor-bypass-button--ambience" onBypass={onBypass} />
    </div>
    <p className="analog-processor-warning">Master wet range is limited to 5%. Keep the limiter after ambience.</p>
    <ManualValues><div className="master-module-fields processor-exact-values">
      <SelectField label="Space" value={ambience.model} options={options} disabled={disabled} onChange={(value) => onParameter(["model"], value)} />
      <Field label="Pre-delay" value={ambience.preDelayMs} limits={ADVANCED_PROCESSOR_LIMITS.ambiencePreDelayMs} step={1} suffix="ms" disabled={disabled} onCommit={(value) => onParameter(["preDelayMs"], value)} />
      <Field label="Decay" value={ambience.decaySeconds} limits={ADVANCED_PROCESSOR_LIMITS.ambienceDecaySeconds} step={0.01} suffix="s" disabled={disabled} onCommit={(value) => onParameter(["decaySeconds"], value)} />
      <Field label="Damping" value={ambience.dampingHz} limits={ADVANCED_PROCESSOR_LIMITS.ambienceDampingHz} step={1} suffix="Hz" disabled={disabled} onCommit={(value) => onParameter(["dampingHz"], value)} />
      <Field label="Low cut" value={ambience.lowCutHz} limits={ADVANCED_PROCESSOR_LIMITS.ambienceLowCutHz} step={1} suffix="Hz" disabled={disabled} onCommit={(value) => onParameter(["lowCutHz"], value)} />
      <Field label="Width" value={ambience.widthPercent} limits={ADVANCED_PROCESSOR_LIMITS.ambienceWidthPercent} step={1} suffix="%" disabled={disabled} onCommit={(value) => onParameter(["widthPercent"], value)} />
      <Field label="Wet" value={ambience.wetPercent} limits={ADVANCED_PROCESSOR_LIMITS.ambienceWetPercent} step={0.1} suffix="%" disabled={disabled} onCommit={(value) => onParameter(["wetPercent"], value)} />
    </div></ManualValues>
  </>;
}

export function TransientSculptorFaceplate({ node, disabled, onBypass, onParameter }) {
  const transient = node.parameters;
  const options = [{ value: "full", label: "Full range", shortLabel: "Full" }, { value: "focused", label: "Frequency focused", shortLabel: "Focus" }];
  return <>
    <div className="processor-faceplate processor-faceplate--transient">
      <FaceplateIdentity maker="Resolute Works" model="T-5 Impact" title="Transient Sculptor" />
      <OptionSelector label="Mode" value={transient.mode} options={options} className="processor-option-selector--transient" disabled={disabled} onChange={(value) => onParameter(["mode"], value)} />
      <FaceplateRotary className="processor-control--transient-attack" label="Attack" value={transient.attackDb} limits={ADVANCED_PROCESSOR_LIMITS.transientDb} step={0.1} suffix="dB" precision={1} disabled={disabled} onChange={(value) => onParameter(["attackDb"], value)} />
      <FaceplateRotary className="processor-control--transient-sustain" label="Sustain" value={transient.sustainDb} limits={ADVANCED_PROCESSOR_LIMITS.transientDb} step={0.1} suffix="dB" precision={1} disabled={disabled} onChange={(value) => onParameter(["sustainDb"], value)} />
      <TransientDisplay attackDb={transient.attackDb} sustainDb={transient.sustainDb} focused={transient.mode === "focused"} active={!node.bypass} />
      <FaceplateRotary className="processor-control--transient-focus" label="Focus" value={transient.focusFrequencyHz} limits={ADVANCED_PROCESSOR_LIMITS.transientFocusHz} step={1} suffix="Hz" scale="log" disabled={disabled} onChange={(value) => onParameter(["focusFrequencyHz"], value)} />
      <ToggleKnob label="Stereo-linked detection" checked={transient.stereoLink} className="processor-toggle-knob--transient-link" disabled={disabled} onChange={(value) => onParameter(["stereoLink"], value)} />
      <FaceplateRotary className="processor-control--transient-output" label="Output" value={transient.outputGainDb} limits={MASTERING_LIMITS.outputGainDb} step={0.1} suffix="dB" precision={1} disabled={disabled} onChange={(value) => onParameter(["outputGainDb"], value)} />
      <FaceplateBypass node={node} className="processor-bypass-button--transient" onBypass={onBypass} />
    </div>
    <ManualValues><div className="master-module-fields processor-exact-values">
      <SelectField label="Mode" value={transient.mode} options={options} disabled={disabled} onChange={(value) => onParameter(["mode"], value)} />
      <Field label="Attack" value={transient.attackDb} limits={ADVANCED_PROCESSOR_LIMITS.transientDb} suffix="dB" disabled={disabled} onCommit={(value) => onParameter(["attackDb"], value)} />
      <Field label="Sustain" value={transient.sustainDb} limits={ADVANCED_PROCESSOR_LIMITS.transientDb} suffix="dB" disabled={disabled} onCommit={(value) => onParameter(["sustainDb"], value)} />
      <Field label="Focus" value={transient.focusFrequencyHz} limits={ADVANCED_PROCESSOR_LIMITS.transientFocusHz} step={1} suffix="Hz" disabled={disabled} onCommit={(value) => onParameter(["focusFrequencyHz"], value)} />
      <label className="premium-plugin-toggle"><input type="checkbox" checked={transient.stereoLink} disabled={disabled} onChange={(event) => onParameter(["stereoLink"], event.target.checked)} /><span>Stereo-linked detection</span></label>
      <Field label="Output" value={transient.outputGainDb} limits={MASTERING_LIMITS.outputGainDb} suffix="dB" disabled={disabled} onCommit={(value) => onParameter(["outputGainDb"], value)} />
    </div></ManualValues>
  </>;
}

export function CreativePhaserFaceplate({ node, disabled, onBypass, onParameter }) {
  const phaser = node.parameters;
  return <>
    <div className="processor-faceplate processor-faceplate--phaser">
      <FaceplateIdentity maker="Northline Audio" model="P-6 Motion" title="Creative Phaser" />
      <FaceplateRotary className="processor-control--phaser-rate" label="Rate" value={phaser.rateHz} limits={ADVANCED_PROCESSOR_LIMITS.phaserRateHz} step={0.01} suffix="Hz" scale="log" precision={2} disabled={disabled} onChange={(value) => onParameter(["rateHz"], value)} />
      <FaceplateRotary className="processor-control--phaser-depth" label="Depth" value={phaser.depth * 100} minimum={0} maximum={100} step={1} suffix="%" precision={0} disabled={disabled} onChange={(value) => onParameter(["depth"], value / 100)} />
      <FaceplateRotary className="processor-control--phaser-center" label="Center" value={phaser.centerFrequencyHz} limits={ADVANCED_PROCESSOR_LIMITS.phaserCenterHz} step={1} suffix="Hz" scale="log" disabled={disabled} onChange={(value) => onParameter(["centerFrequencyHz"], value)} />
      <PhaserDisplay depth={phaser.depth} feedback={phaser.feedback} stereoOffsetDegrees={phaser.stereoOffsetDegrees} active={!node.bypass && phaser.mix > 0} />
      <FaceplateRotary className="processor-control--phaser-feedback" label="Feedback" value={phaser.feedback * 100} minimum={-80} maximum={80} step={1} suffix="%" precision={0} disabled={disabled} onChange={(value) => onParameter(["feedback"], value / 100)} />
      <FaceplateRotary className="processor-control--phaser-mix" label="Mix" value={phaser.mix * 100} minimum={0} maximum={50} step={1} suffix="%" precision={0} disabled={disabled} onChange={(value) => onParameter(["mix"], value / 100)} />
      <FaceplateRotary className="processor-control--phaser-offset" label="Stereo offset" value={phaser.stereoOffsetDegrees} limits={ADVANCED_PROCESSOR_LIMITS.phaserStereoDegrees} step={1} suffix="°" precision={0} disabled={disabled} onChange={(value) => onParameter(["stereoOffsetDegrees"], value)} />
      <FaceplateBypass node={node} className="processor-bypass-button--phaser" onBypass={onBypass} />
    </div>
    <p className="analog-processor-warning analog-processor-warning--phaser">Creative effect: modulation can alter mono compatibility and album-wide tonal balance.</p>
    <ManualValues><div className="master-module-fields processor-exact-values">
      <Field label="Rate" value={phaser.rateHz} limits={ADVANCED_PROCESSOR_LIMITS.phaserRateHz} step={0.01} suffix="Hz" disabled={disabled} onCommit={(value) => onParameter(["rateHz"], value)} />
      <Field label="Depth" value={phaser.depth * 100} minimum={0} maximum={100} step={1} suffix="%" disabled={disabled} onCommit={(value) => onParameter(["depth"], value / 100)} />
      <Field label="Center" value={phaser.centerFrequencyHz} limits={ADVANCED_PROCESSOR_LIMITS.phaserCenterHz} step={1} suffix="Hz" disabled={disabled} onCommit={(value) => onParameter(["centerFrequencyHz"], value)} />
      <Field label="Feedback" value={phaser.feedback * 100} minimum={-80} maximum={80} step={1} suffix="%" disabled={disabled} onCommit={(value) => onParameter(["feedback"], value / 100)} />
      <Field label="Mix" value={phaser.mix * 100} minimum={0} maximum={50} step={1} suffix="%" disabled={disabled} onCommit={(value) => onParameter(["mix"], value / 100)} />
      <Field label="Stereo offset" value={phaser.stereoOffsetDegrees} limits={ADVANCED_PROCESSOR_LIMITS.phaserStereoDegrees} step={1} suffix="°" disabled={disabled} onCommit={(value) => onParameter(["stereoOffsetDegrees"], value)} />
    </div></ManualValues>
  </>;
}
