const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

export const waveformPath = (points, { width = 1000, middle = 50, amplitude = 43 } = {}) => {
  if (!Array.isArray(points) || !points.length) return "";
  const xForIndex = (index) => points.length === 1 ? width / 2 : (index / (points.length - 1)) * width;
  const normalized = points.map((point) => clamp(Number(point) || 0, 0, 1));
  const upper = normalized.map((point, index) => `${xForIndex(index).toFixed(2)} ${(middle - point * amplitude).toFixed(2)}`);
  const lower = normalized.map((point, index) => `${xForIndex(index).toFixed(2)} ${(middle + point * amplitude).toFixed(2)}`).reverse();
  return `M ${upper.join(" L ")} L ${lower.join(" L ")} Z`;
};

const transitionCurves = {
  natural: {
    label: "Natural",
    curveLabel: "Full level",
    primaryPath: "M 4 12 H 116",
    secondaryPath: "",
  },
  cut: {
    label: "Hard cut",
    curveLabel: "Instant stop",
    primaryPath: "M 4 12 H 101 V 44 H 116",
    secondaryPath: "",
  },
  fade: {
    label: "Fade out",
    curveLabel: "Linear fade",
    primaryPath: "M 4 12 L 116 44",
    secondaryPath: "",
  },
  crossfade: {
    label: "Crossfade",
    curveLabel: "Equal-power qsin",
    primaryPath: "M 4 12 C 42 12 79 20 116 44",
    secondaryPath: "M 4 44 C 41 20 78 12 116 12",
  },
};

export const transitionCurve = (mode) => transitionCurves[mode] || transitionCurves.natural;
