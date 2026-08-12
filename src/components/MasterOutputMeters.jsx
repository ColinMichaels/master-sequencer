import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  MASTER_METER_FLOOR_DB,
  MASTER_SPECTRUM_FLOOR_DB,
  calculateSignalLevel,
  calculateStereoCorrelation,
  meterPosition,
  sampleLogSpectrum,
  sampleVectorscope,
} from "../lib/master-metering.js";

const EMPTY_SPECTRUM = Array.from({ length: 64 }, (_, index) => ({
  frequency: 20 * (1_000 ** (index / 63)),
  decibels: MASTER_SPECTRUM_FLOOR_DB,
}));

const EMPTY_FRAME = {
  active: false,
  leftRmsDb: MASTER_METER_FLOOR_DB,
  rightRmsDb: MASTER_METER_FLOOR_DB,
  leftPeakDb: MASTER_METER_FLOOR_DB,
  rightPeakDb: MASTER_METER_FLOOR_DB,
  leftPeakHoldDb: MASTER_METER_FLOOR_DB,
  rightPeakHoldDb: MASTER_METER_FLOOR_DB,
  correlation: 0,
  vectorscope: [],
  spectrum: EMPTY_SPECTRUM,
};

const VU_MINIMUM_DB = -60;
const VU_ZERO_DBFS = -18;
const SPECTRUM_WIDTH = 640;
const SPECTRUM_HEIGHT = 150;
const SPECTRUM_TOP = 8;
const SPECTRUM_BOTTOM = 134;

const displayDb = (value) => `${Number(value).toFixed(1)}`;

const spectrumCoordinates = (spectrum) => spectrum.map((band, index) => {
  const x = spectrum.length === 1 ? 0 : (index / (spectrum.length - 1)) * SPECTRUM_WIDTH;
  const normalized = meterPosition(band.decibels, MASTER_SPECTRUM_FLOOR_DB, 0);
  const y = SPECTRUM_BOTTOM - normalized * (SPECTRUM_BOTTOM - SPECTRUM_TOP);
  return [x, y];
});

const spectrumLinePath = (spectrum) => spectrumCoordinates(spectrum)
  .map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`)
  .join(" ");

const spectrumAreaPath = (spectrum) => {
  const line = spectrumLinePath(spectrum);
  return `${line} L${SPECTRUM_WIDTH},${SPECTRUM_BOTTOM} L0,${SPECTRUM_BOTTOM} Z`;
};

const frequencyPosition = (frequency) => (
  (Math.log(frequency) - Math.log(20)) / (Math.log(20_000) - Math.log(20)) * SPECTRUM_WIDTH
);

const formatFrequency = (frequency) => frequency >= 1_000
  ? `${Number((frequency / 1_000).toFixed(frequency >= 10_000 ? 0 : 1))}k`
  : `${Math.round(frequency)}`;

const readTimeDomain = (analyser, buffers, key) => {
  if (!analyser) return null;
  if (!buffers[key] || buffers[key].length !== analyser.fftSize) buffers[key] = new Float32Array(analyser.fftSize);
  if (typeof analyser.getFloatTimeDomainData === "function") {
    analyser.getFloatTimeDomainData(buffers[key]);
    return buffers[key];
  }
  return null;
};

const readFrequencyDomain = (analyser, buffers) => {
  if (!analyser || typeof analyser.getFloatFrequencyData !== "function") return null;
  if (!buffers.frequency || buffers.frequency.length !== analyser.frequencyBinCount) buffers.frequency = new Float32Array(analyser.frequencyBinCount);
  analyser.getFloatFrequencyData(buffers.frequency);
  return buffers.frequency;
};

function VuChannel({ channel, rmsDb, peakDb, peakHoldDb }) {
  const levelPercent = meterPosition(rmsDb, VU_MINIMUM_DB, 0) * 100;
  const peakPercent = meterPosition(peakHoldDb, VU_MINIMUM_DB, 0) * 100;
  const clipping = peakDb >= -0.1;
  return (
    <div className={`digital-vu-channel ${clipping ? "is-clipping" : ""}`} data-meter-channel={channel.toLowerCase()} data-meter-rms={rmsDb.toFixed(2)}>
      <strong>{channel}</strong>
      <div
        className="digital-vu-track"
        role="meter"
        aria-label={`${channel} master RMS level`}
        aria-valuemin={VU_MINIMUM_DB}
        aria-valuemax="0"
        aria-valuenow={Math.max(VU_MINIMUM_DB, rmsDb).toFixed(1)}
        aria-valuetext={`${displayDb(rmsDb)} dBFS RMS; ${displayDb(peakHoldDb)} dBFS peak hold`}
      >
        <i className="digital-vu-fill" style={{ "--vu-level": `${levelPercent}%` }} />
        <i className="digital-vu-reference" style={{ "--vu-reference": `${meterPosition(VU_ZERO_DBFS, VU_MINIMUM_DB, 0) * 100}%` }} aria-hidden="true" />
        <i className="digital-vu-peak" style={{ "--vu-peak": `${peakPercent}%` }} aria-hidden="true" />
      </div>
      <output><span>{displayDb(rmsDb)}</span><small>dBFS</small></output>
      <span className="digital-vu-peak-value">PK {displayDb(peakHoldDb)}</span>
    </div>
  );
}

function CompactVuChannel({ channel, rmsDb, peakDb, peakHoldDb }) {
  const levelPercent = meterPosition(rmsDb, VU_MINIMUM_DB, 0) * 100;
  const peakPercent = meterPosition(peakHoldDb, VU_MINIMUM_DB, 0) * 100;
  return (
    <div className={`header-vu-channel ${peakDb >= -0.1 ? "is-clipping" : ""}`} data-meter-channel={channel.toLowerCase()} data-meter-rms={rmsDb.toFixed(2)}>
      <strong aria-hidden="true">{channel.slice(0, 1)}</strong>
      <div className="header-vu-track" role="meter" aria-label={`${channel} header master RMS level`} aria-valuemin={VU_MINIMUM_DB} aria-valuemax="0" aria-valuenow={Math.max(VU_MINIMUM_DB, rmsDb).toFixed(1)} aria-valuetext={`${displayDb(rmsDb)} dBFS RMS; ${displayDb(peakHoldDb)} dBFS peak hold`}>
        <i className="header-vu-fill" style={{ "--vu-level": `${levelPercent}%` }} />
        <i className="header-vu-reference" style={{ "--vu-reference": `${meterPosition(VU_ZERO_DBFS, VU_MINIMUM_DB, 0) * 100}%` }} aria-hidden="true" />
        <i className="header-vu-peak" style={{ "--vu-peak": `${peakPercent}%` }} aria-hidden="true" />
      </div>
    </div>
  );
}

const ROUTING_STATE = {
  mastering: { className: "is-mastering-route", label: "MASTER", description: "Mastering enabled" },
  reference: { className: "is-reference-route", label: "REF", description: "Clean reference; mastering bypassed" },
  raw: { className: "is-raw-route", label: "", description: "Raw direct audio; mastering bypassed" },
};

function CompactMasterMonitor({ frame, clipping, mode, onModeChange, onOpenMastering, spectrumLine, spectrumArea, dominantBand, stateLabel, routing, effectsActive }) {
  const normalizedRouting = ROUTING_STATE[routing] ? routing : "raw";
  const routingState = ROUTING_STATE[normalizedRouting];
  const masterEffectsAreActive = normalizedRouting === "mastering" && effectsActive;
  return (
    <section className={`header-master-meter ${routingState.className} ${masterEffectsAreActive ? "has-master-effects" : ""} ${frame.active ? "is-active" : ""} ${clipping ? "has-clip" : ""}`} aria-label={`Master output monitor. ${routingState.description}. ${clipping ? "Peak clip" : stateLabel}`} title={`${routingState.description}. ${stateLabel}`} data-testid="header-master-meter" data-meter-mode={mode} data-meter-active={frame.active ? "true" : "false"} data-meter-routing={normalizedRouting} data-master-effects={masterEffectsAreActive ? "true" : "false"} data-routing-label={routingState.label}>
      <button type="button" className="header-meter-link" onClick={onOpenMastering} aria-label="Open Mastering" title="Open Mastering" />
      <div className="header-meter-display">
        {mode === "vu" ? (
          <div className="header-vu-channels">
            <CompactVuChannel channel="Left" rmsDb={frame.leftRmsDb} peakDb={frame.leftPeakDb} peakHoldDb={frame.leftPeakHoldDb} />
            <CompactVuChannel channel="Right" rmsDb={frame.rightRmsDb} peakDb={frame.rightPeakDb} peakHoldDb={frame.rightPeakHoldDb} />
          </div>
        ) : (
          <svg className="header-spectrum" viewBox={`0 0 ${SPECTRUM_WIDTH} ${SPECTRUM_BOTTOM}`} role="img" aria-label={frame.active ? `Condensed frequency analyzer. Strongest displayed band ${formatFrequency(dominantBand.frequency)} hertz at ${displayDb(dominantBand.decibels)} decibels.` : "Condensed frequency analyzer awaiting master output."} preserveAspectRatio="none" data-spectrum-peak={dominantBand.decibels.toFixed(2)}>
            <g aria-hidden="true">{[100, 1_000, 10_000].map((frequency) => <line key={frequency} x1={frequencyPosition(frequency)} x2={frequencyPosition(frequency)} y1={SPECTRUM_TOP} y2={SPECTRUM_BOTTOM} />)}</g>
            <path className="header-spectrum-area" d={spectrumArea} />
            <path className="header-spectrum-line" d={spectrumLine} />
          </svg>
        )}
      </div>
      <div className="header-meter-controls" role="group" aria-label="Header master monitor view">
        <button type="button" className={mode === "vu" ? "is-active" : ""} aria-label="Show VU meter" aria-pressed={mode === "vu"} data-tooltip="VU meter" onClick={() => onModeChange("vu")}>VU</button>
        <button type="button" className={mode === "spectrum" ? "is-active" : ""} aria-label="Show frequency analyzer" aria-pressed={mode === "spectrum"} data-tooltip="Frequency analyzer" onClick={() => onModeChange("spectrum")}>Hz</button>
      </div>
    </section>
  );
}

export const MasterOutputMeters = memo(function MasterOutputMeters({ meteringRef, available, playing, monitorLabel, monitorRouting = "raw", effectsActive = false, compact = false, onOpenMastering, monitorMode = "stereo", onMonitorModeChange }) {
  const [frame, setFrame] = useState(EMPTY_FRAME);
  const [compactMode, setCompactMode] = useState("vu");
  const [peakResetVersion, setPeakResetVersion] = useState(0);
  const animationRef = useRef(0);
  const buffersRef = useRef({});
  const smoothedRef = useRef({ left: MASTER_METER_FLOOR_DB, right: MASTER_METER_FLOOR_DB });
  const peakHoldRef = useRef({ left: MASTER_METER_FLOOR_DB, right: MASTER_METER_FLOOR_DB, leftAt: 0, rightAt: 0 });
  const lastFrameAtRef = useRef(0);

  useEffect(() => {
    if (!playing) {
      smoothedRef.current = { left: MASTER_METER_FLOOR_DB, right: MASTER_METER_FLOOR_DB };
      // Peak holds remain useful after playback, but live clip status must clear with the stopped signal.
      setFrame((current) => current.active ? { ...current, active: false, leftRmsDb: MASTER_METER_FLOOR_DB, rightRmsDb: MASTER_METER_FLOOR_DB, leftPeakDb: MASTER_METER_FLOOR_DB, rightPeakDb: MASTER_METER_FLOOR_DB, spectrum: EMPTY_SPECTRUM } : current);
      return undefined;
    }

    const draw = (timestamp) => {
      animationRef.current = requestAnimationFrame(draw);
      if (timestamp - lastFrameAtRef.current < (compact ? 50 : 32)) return;
      lastFrameAtRef.current = timestamp;
      const meter = meteringRef?.current;
      if (!meter) return;

      const leftSamples = readTimeDomain(meter.leftAnalyser, buffersRef.current, "left");
      const rightSamples = readTimeDomain(meter.rightAnalyser, buffersRef.current, "right");
      const needsSpectrum = !compact || compactMode === "spectrum";
      const frequencyMagnitudes = needsSpectrum ? readFrequencyDomain(meter.frequencyAnalyser, buffersRef.current) : null;
      if (!leftSamples || !rightSamples || (needsSpectrum && !frequencyMagnitudes)) return;

      const left = calculateSignalLevel(leftSamples);
      const right = calculateSignalLevel(rightSamples);
      const smooth = (previous, next) => previous + (next - previous) * (next > previous ? 0.46 : 0.1);
      const leftRmsDb = smooth(smoothedRef.current.left, left.rmsDb);
      const rightRmsDb = smooth(smoothedRef.current.right, right.rmsDb);
      smoothedRef.current = { left: leftRmsDb, right: rightRmsDb };

      const hold = peakHoldRef.current;
      const holdPeak = (channel, nextPeak) => {
        const timeKey = `${channel}At`;
        if (nextPeak >= hold[channel]) {
          hold[channel] = nextPeak;
          hold[timeKey] = timestamp;
        } else if (timestamp - hold[timeKey] > 1_500) {
          hold[channel] = Math.max(nextPeak, hold[channel] - 0.4);
        }
        return hold[channel];
      };

      setFrame({
        active: true,
        leftRmsDb,
        rightRmsDb,
        leftPeakDb: left.peakDb,
        rightPeakDb: right.peakDb,
        leftPeakHoldDb: holdPeak("left", left.peakDb),
        rightPeakHoldDb: holdPeak("right", right.peakDb),
        correlation: calculateStereoCorrelation(leftSamples, rightSamples),
        vectorscope: compact ? [] : sampleVectorscope(leftSamples, rightSamples),
        spectrum: frequencyMagnitudes ? sampleLogSpectrum(frequencyMagnitudes, meter.sampleRate, meter.frequencyAnalyser.fftSize) : EMPTY_SPECTRUM,
      });
    };

    animationRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animationRef.current);
  }, [compact, compactMode, meteringRef, peakResetVersion, playing]);

  const dominantBand = useMemo(() => {
    let dominant = frame.spectrum[0];
    for (let index = 1; index < frame.spectrum.length; index += 1) {
      if (frame.spectrum[index].decibels > dominant.decibels) dominant = frame.spectrum[index];
    }
    return dominant;
  }, [frame.spectrum]);

  const resetPeaks = () => {
    peakHoldRef.current = { left: MASTER_METER_FLOOR_DB, right: MASTER_METER_FLOOR_DB, leftAt: 0, rightAt: 0 };
    setFrame((current) => ({ ...current, leftPeakHoldDb: MASTER_METER_FLOOR_DB, rightPeakHoldDb: MASTER_METER_FLOOR_DB }));
    setPeakResetVersion((current) => current + 1);
  };

  const unavailable = available === false;
  const stateLabel = unavailable
    ? "Metering unavailable"
    : frame.active
      ? "Live post-master output"
      : playing
        ? "Connecting monitor…"
        : available
          ? "Playback paused"
          : "Start a preview to meter output";
  const spectrumLine = spectrumLinePath(frame.spectrum);
  const spectrumArea = spectrumAreaPath(frame.spectrum);
  const clipping = frame.leftPeakDb >= -0.1 || frame.rightPeakDb >= -0.1;

  if (compact) return <CompactMasterMonitor frame={frame} clipping={clipping} mode={compactMode} onModeChange={setCompactMode} onOpenMastering={onOpenMastering} spectrumLine={spectrumLine} spectrumArea={spectrumArea} dominantBand={dominantBand} stateLabel={monitorLabel || stateLabel} routing={monitorRouting} effectsActive={effectsActive} />;

  return (
    <section className={`master-metering-console ${frame.active ? "is-active" : ""} ${clipping ? "has-clip" : ""}`} aria-labelledby="master-metering-title" data-testid="master-output-meter">
      <header>
        <div><span>05</span><div><h4 id="master-metering-title">Master Output Monitor</h4><small>{monitorLabel || stateLabel}</small></div></div>
        <div className="master-metering-status"><i aria-hidden="true" /><span>{clipping ? "Peak clip" : stateLabel}</span><button type="button" onClick={resetPeaks}>Reset peaks</button></div>
      </header>
      <div className="master-monitor-modes" role="group" aria-label="Master monitor audition mode">
        {[{ id: "stereo", label: "ST", name: "Stereo" }, { id: "mono", label: "MONO", name: "Mono sum" }, { id: "mid", label: "M", name: "Mid only" }, { id: "side", label: "S", name: "Side only" }].map((option) => <button key={option.id} type="button" className={monitorMode === option.id ? "is-active" : ""} aria-pressed={monitorMode === option.id} aria-label={`Monitor ${option.name}`} onClick={() => onMonitorModeChange?.(option.id)}>{option.label}<small>{option.name}</small></button>)}
        <p>Monitor selection changes audition output only. It is never written into a master print.</p>
      </div>
      <div className="master-metering-grid">
        <section className="digital-vu-panel" aria-labelledby="digital-vu-title">
          <header><div><h5 id="digital-vu-title">Digital Master VU</h5><small>RMS level · sample peak hold</small></div><strong>0 VU = −18 dBFS</strong></header>
          <div className="digital-vu-scale" aria-hidden="true">{[-60, -48, -36, -24, -18, -12, -6, 0].map((value) => <span key={value} style={{ left: `${meterPosition(value, VU_MINIMUM_DB, 0) * 100}%` }}>{value}</span>)}</div>
          <div className="digital-vu-channels">
            <VuChannel channel="Left" rmsDb={frame.leftRmsDb} peakDb={frame.leftPeakDb} peakHoldDb={frame.leftPeakHoldDb} />
            <VuChannel channel="Right" rmsDb={frame.rightRmsDb} peakDb={frame.rightPeakDb} peakHoldDb={frame.rightPeakHoldDb} />
          </div>
          <p>{unavailable ? "This browser cannot expose the Web Audio master monitor." : "RMS follows perceived level; the white marker holds the highest digital sample peak."}</p>
        </section>

        <figure className="master-spectrum-panel" data-spectrum-peak={dominantBand.decibels.toFixed(2)}>
          <header><div><h5>Frequency Analyzer</h5><small>Final output · 20 Hz–20 kHz</small></div><strong>{frame.active ? `${formatFrequency(dominantBand.frequency)} Hz · ${displayDb(dominantBand.decibels)} dB` : "Awaiting signal"}</strong></header>
          <svg viewBox={`0 0 ${SPECTRUM_WIDTH} ${SPECTRUM_HEIGHT}`} role="img" aria-label={frame.active ? `Live frequency analyzer. Strongest displayed band ${formatFrequency(dominantBand.frequency)} hertz at ${displayDb(dominantBand.decibels)} decibels.` : "Frequency analyzer awaiting master output."} preserveAspectRatio="none">
            <g className="master-spectrum-grid" aria-hidden="true">
              {[-72, -48, -24, -12, 0].map((db) => {
                const y = SPECTRUM_BOTTOM - meterPosition(db, MASTER_SPECTRUM_FLOOR_DB, 0) * (SPECTRUM_BOTTOM - SPECTRUM_TOP);
                return <line key={`db-${db}`} x1="0" x2={SPECTRUM_WIDTH} y1={y} y2={y} />;
              })}
              {[20, 50, 100, 200, 500, 1_000, 2_000, 5_000, 10_000, 20_000].map((frequency) => <line key={`hz-${frequency}`} x1={frequencyPosition(frequency)} x2={frequencyPosition(frequency)} y1={SPECTRUM_TOP} y2={SPECTRUM_BOTTOM} />)}
            </g>
            <path className="master-spectrum-area" d={spectrumArea} />
            <path className="master-spectrum-line" d={spectrumLine} />
            <g className="master-spectrum-labels" aria-hidden="true">
              {[20, 100, 500, 1_000, 5_000, 20_000].map((frequency) => <text key={frequency} x={frequencyPosition(frequency)} y="148" textAnchor={frequency === 20 ? "start" : frequency === 20_000 ? "end" : "middle"}>{formatFrequency(frequency)}</text>)}
            </g>
          </svg>
          <figcaption><span>Sub</span><span>Bass</span><span>Low mids</span><span>Presence</span><span>Air</span></figcaption>
        </figure>

        <figure className={`master-vectorscope-panel ${frame.correlation < 0 ? "has-negative-correlation" : ""}`} data-correlation={frame.correlation.toFixed(3)}>
          <header><div><h5>Stereo Field</h5><small>Vectorscope · phase correlation</small></div><strong>{frame.active ? frame.correlation.toFixed(2) : "Awaiting signal"}</strong></header>
          <div className="master-vectorscope-wrap">
            <svg viewBox="0 0 200 200" role="img" aria-label={frame.active ? `Stereo vectorscope with correlation ${frame.correlation.toFixed(2)}.` : "Stereo vectorscope awaiting master output."}>
              <g className="master-vectorscope-grid" aria-hidden="true"><line x1="100" y1="8" x2="100" y2="192" /><line x1="8" y1="100" x2="192" y2="100" /><line x1="35" y1="35" x2="165" y2="165" /><line x1="165" y1="35" x2="35" y2="165" /><circle cx="100" cy="100" r="72" /></g>
              <g className="master-vectorscope-points" aria-hidden="true">{frame.vectorscope.map((point, index) => <circle key={index} cx={100 + point.x * 84} cy={100 - point.y * 84} r="1.7" />)}</g>
            </svg>
            <div className="master-correlation-meter" role="meter" aria-label="Stereo phase correlation" aria-valuemin="-1" aria-valuemax="1" aria-valuenow={frame.correlation.toFixed(2)} aria-valuetext={`${frame.correlation.toFixed(2)} correlation${frame.correlation < 0 ? "; negative phase relationship" : ""}`}>
              <span>−1</span><i><b style={{ left: `${(frame.correlation + 1) * 50}%` }} /></i><span>+1</span>
            </div>
          </div>
          <figcaption>{frame.correlation < 0 ? "Negative correlation: verify the master in mono before approval." : "Positive correlation indicates a more mono-compatible stereo relationship."}</figcaption>
        </figure>
      </div>
    </section>
  );
});
