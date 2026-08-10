import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  MASTER_METER_FLOOR_DB,
  MASTER_SPECTRUM_FLOOR_DB,
  calculateSignalLevel,
  meterPosition,
  sampleLogSpectrum,
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

export const MasterOutputMeters = memo(function MasterOutputMeters({ meteringRef, available, playing, monitorLabel }) {
  const [frame, setFrame] = useState(EMPTY_FRAME);
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
      if (timestamp - lastFrameAtRef.current < 32) return;
      lastFrameAtRef.current = timestamp;
      const meter = meteringRef?.current;
      if (!meter) return;

      const leftSamples = readTimeDomain(meter.leftAnalyser, buffersRef.current, "left");
      const rightSamples = readTimeDomain(meter.rightAnalyser, buffersRef.current, "right");
      const frequencyMagnitudes = readFrequencyDomain(meter.frequencyAnalyser, buffersRef.current);
      if (!leftSamples || !rightSamples || !frequencyMagnitudes) return;

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
        spectrum: sampleLogSpectrum(frequencyMagnitudes, meter.sampleRate, meter.frequencyAnalyser.fftSize),
      });
    };

    animationRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animationRef.current);
  }, [meteringRef, peakResetVersion, playing]);

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

  return (
    <section className={`master-metering-console ${frame.active ? "is-active" : ""} ${clipping ? "has-clip" : ""}`} aria-labelledby="master-metering-title" data-testid="master-output-meter">
      <header>
        <div><span>05</span><div><h4 id="master-metering-title">Master Output Monitor</h4><small>{monitorLabel || stateLabel}</small></div></div>
        <div className="master-metering-status"><i aria-hidden="true" /><span>{clipping ? "Peak clip" : stateLabel}</span><button type="button" onClick={resetPeaks}>Reset peaks</button></div>
      </header>
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
      </div>
    </section>
  );
});
