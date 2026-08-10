import React from "react";
import { transitionCurve } from "../lib/waveform.js";

export function TransitionCurve({ mode, className = "" }) {
  const curve = transitionCurve(mode);
  return (
    <span className={`transition-curve ${className}`.trim()} aria-hidden="true">
      <svg viewBox="0 0 120 56" preserveAspectRatio="none">
        <path className="transition-curve-axis" d="M 4 44 H 116 M 4 12 V 44" />
        <path className="transition-curve-primary" d={curve.primaryPath} />
        {curve.secondaryPath ? <path className="transition-curve-secondary" d={curve.secondaryPath} /> : null}
      </svg>
      <em>{curve.curveLabel}</em>
    </span>
  );
}
