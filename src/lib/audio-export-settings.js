export const AUDIO_EXPORT_FORMATS = [
  {
    id: "wav",
    label: "WAV",
    description: "Uncompressed PCM",
    qualityKind: "bitDepth",
    bitDepths: [16, 24, 32],
    sampleRates: [44_100, 48_000, 88_200, 96_000, 176_400, 192_000],
    defaultBitDepth: 24,
    defaultSampleRate: 48_000,
  },
  {
    id: "aiff",
    label: "AIFF",
    description: "Uncompressed PCM",
    qualityKind: "bitDepth",
    bitDepths: [16, 24, 32],
    sampleRates: [44_100, 48_000, 88_200, 96_000, 176_400, 192_000],
    defaultBitDepth: 24,
    defaultSampleRate: 48_000,
  },
  {
    id: "flac",
    label: "FLAC",
    description: "Lossless compressed",
    qualityKind: "bitDepth",
    bitDepths: [16, 24],
    sampleRates: [44_100, 48_000, 88_200, 96_000, 176_400, 192_000],
    defaultBitDepth: 24,
    defaultSampleRate: 48_000,
  },
  {
    id: "mp3",
    label: "MP3",
    description: "Lossy review copy",
    qualityKind: "bitrate",
    bitratesKbps: [128, 192, 256, 320],
    sampleRates: [44_100, 48_000],
    defaultBitrateKbps: 320,
    defaultSampleRate: 48_000,
  },
  {
    id: "m4a",
    label: "M4A",
    description: "AAC compressed",
    qualityKind: "bitrate",
    bitratesKbps: [128, 192, 256, 320],
    sampleRates: [44_100, 48_000, 88_200, 96_000],
    defaultBitrateKbps: 256,
    defaultSampleRate: 48_000,
  },
];

export const audioExportFormat = (format) => AUDIO_EXPORT_FORMATS.find((option) => option.id === format) || null;

export const sampleRateLabel = (sampleRate) => `${Number(sampleRate) / 1_000} kHz`;

export const resolveAudioExportSettings = ({ format = "wav", sampleRate, bitDepth, bitrateKbps } = {}) => {
  const option = audioExportFormat(String(format || "").toLowerCase());
  if (!option) return { ok: false, issues: ["Choose WAV, AIFF, FLAC, MP3, or M4A output."], settings: null, option: null };

  const resolvedSampleRate = sampleRate == null ? option.defaultSampleRate : Number(sampleRate);
  const resolvedBitDepth = bitDepth == null ? option.defaultBitDepth : Number(bitDepth);
  const resolvedBitrateKbps = bitrateKbps == null ? option.defaultBitrateKbps : Number(bitrateKbps);
  const issues = [];
  if (!option.sampleRates.includes(resolvedSampleRate)) {
    issues.push(`${option.label} sample rate must be ${option.sampleRates.map(sampleRateLabel).join(", ")}.`);
  }
  if (option.qualityKind === "bitDepth" && !option.bitDepths.includes(resolvedBitDepth)) {
    issues.push(`${option.label} bit depth must be ${option.bitDepths.join(", ")} bit.`);
  }
  if (option.qualityKind === "bitrate" && !option.bitratesKbps.includes(resolvedBitrateKbps)) {
    issues.push(`${option.label} bitrate must be ${option.bitratesKbps.join(", ")} kbps.`);
  }

  return {
    ok: issues.length === 0,
    issues,
    option,
    settings: {
      format: option.id,
      sampleRate: resolvedSampleRate,
      bitDepth: option.qualityKind === "bitDepth" ? resolvedBitDepth : null,
      bitrateKbps: option.qualityKind === "bitrate" ? resolvedBitrateKbps : null,
    },
  };
};

export const audioExportSummary = (settings = {}) => {
  const resolved = resolveAudioExportSettings(settings);
  if (!resolved.ok) return "Invalid audio settings";
  const { option } = resolved;
  const quality = option.qualityKind === "bitDepth"
    ? `${resolved.settings.bitDepth}-bit`
    : `${resolved.settings.bitrateKbps} kbps`;
  return `${option.label} · ${quality} · ${sampleRateLabel(resolved.settings.sampleRate)}`;
};
