import React, { useState } from "react";
import { CheckIcon, WarningIcon, WaveIcon } from "./Icons.jsx";

const outcomeLabel = (lastRun) => {
  if (!lastRun) return "No run yet";
  if (lastRun.outcome === "passed") return "Verified";
  if (lastRun.outcome === "stopped") return "Stopped safely";
  if (lastRun.outcome === "unavailable") return "No output device";
  return "Needs attention";
};

export function NativeEngineLab({ hardware, lab, onStart, onStop }) {
  const [audibleAcknowledged, setAudibleAcknowledged] = useState(false);
  const busy = lab?.running || lab?.state === "starting";
  const lastRun = lab?.lastRun;
  const startAudible = async () => {
    if (await onStart({ mode: "audible", acknowledged: audibleAcknowledged })) setAudibleAcknowledged(false);
  };

  return (
    <section className="settings-section native-engine-lab" aria-labelledby="native-engine-lab-title">
      <div className="native-engine-lab__heading">
        <div>
          <span className="settings-kicker">Native POC · Generated fixture only</span>
          <h3 id="native-engine-lab-title">Native Engine Lab</h3>
          <p>See the local Core Audio engine work, run its DSP silently, or hear a short safety-limited test tone. This panel cannot select or read project audio.</p>
        </div>
        <span className={`native-engine-state ${busy ? "is-running" : lab?.configured ? "is-ready" : "is-unavailable"}`}><i />{busy ? "Running" : lab?.configured ? "Ready" : "Not included"}</span>
      </div>

      {!lab?.configured ? (
        <p className="native-engine-callout"><WarningIcon /><span><strong>This build has no installable native lab.</strong><small>Browser and local Web Audio auditioning still work. Package the verified native executable to enable these controls.</small></span></p>
      ) : (
        <div className="native-engine-lab__grid">
          <article className="native-engine-module native-engine-module--muted">
            <WaveIcon size={30} />
            <div><strong>Muted DSP check</strong><p>Runs the generated golden through the real callback, rebuilds once, and keeps hardware output at zero.</p></div>
            <button type="button" className="primary-button" disabled={busy} onClick={() => onStart({ mode: "muted" })}>Run muted check</button>
          </article>
          <article className="native-engine-module native-engine-module--audible">
            <WaveIcon size={30} />
            <div><strong>Audible test tone</strong><p>Plays only the generated stereo fixture for 3 seconds at −30 dB with 20 ms edge fades through the current output.</p></div>
            <label className="native-engine-consent"><input type="checkbox" checked={audibleAcknowledged} disabled={busy} onChange={(event) => setAudibleAcknowledged(event.target.checked)} /><span>I am ready for a short test tone.</span></label>
            <button type="button" className="primary-button primary-button--yellow" disabled={busy || !audibleAcknowledged} onClick={startAudible}>Play 3-second test tone</button>
          </article>
        </div>
      )}

      {lab?.configured && <div className="native-engine-runtime" aria-live="polite">
        <div className="native-engine-runtime__device"><small>Current output</small><strong>{hardware?.available ? hardware.defaultOutput.label : hardware?.probeReady ? "No default output" : "Device probe unavailable"}</strong><span>{hardware?.available ? `${hardware.defaultOutput.sampleRate.toLocaleString()} Hz · ${hardware.defaultOutput.channels} channels` : "The lab will fail closed if macOS has no output."}</span></div>
        {busy ? <div className="native-engine-runtime__active"><span className="native-engine-pulse" /><div><small>Active run</small><strong>{lab.activeRun?.label || "Starting native lab"}</strong><span>{lab.activeRun?.mode === "audible" ? "Generated tone may be audible now." : "Hardware output remains muted."}</span></div><button type="button" className="native-engine-stop" onClick={onStop}>Stop native output now</button></div> : <div className="native-engine-runtime__result"><span className={lastRun?.outcome === "passed" ? "is-passed" : ""}>{lastRun?.outcome === "passed" ? <CheckIcon /> : <WaveIcon />}</span><div><small>Last result</small><strong>{outcomeLabel(lastRun)}</strong><span>{lastRun ? `${lastRun.mode === "audible" ? "Audible generated tone" : "Muted DSP"} · ${lastRun.outcome === "passed" ? "exact golden matched" : lastRun.reasonCode || "no measurements"}` : "Run either check to see callback evidence here."}</span></div></div>}
      </div>}

      {lastRun?.sampleRate && !busy && <dl className="native-engine-metrics">
        <div><dt>Format</dt><dd>{lastRun.sampleRate.toLocaleString()} Hz / {lastRun.channels} ch</dd></div>
        <div><dt>Callbacks</dt><dd>{lastRun.callbacks.toLocaleString()}</dd></div>
        <div><dt>Frames</dt><dd>{lastRun.renderedFrames.toLocaleString()}</dd></div>
        <div><dt>Recovery</dt><dd>{lastRun.recoveries}</dd></div>
        <div><dt>Longest callback</dt><dd>{lastRun.longestCallbackMs.toFixed(4)} ms</dd></div>
        <div><dt>Callback issues</dt><dd>{lastRun.callbackIssues}</dd></div>
      </dl>}
      <p className="settings-note native-engine-boundary"><strong>Boundary:</strong> no microphone, no indexed source, no project path, no transport routing, and no upload. Stopping terminates the owned native process so output closes at the OS boundary.</p>
    </section>
  );
}
