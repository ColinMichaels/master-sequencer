export const formatDuration = (seconds, precise = false) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—:—";
  const total = precise ? seconds : Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;
  const secondText = precise ? remainder.toFixed(3).padStart(6, "0") : Math.floor(remainder).toString().padStart(2, "0");
  return hours ? `${hours}:${minutes.toString().padStart(2, "0")}:${secondText}` : `${minutes}:${secondText}`;
};

export const formatBytes = (bytes) => {
  if (!Number.isFinite(bytes)) return "—";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

export const slugify = (value) => value
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "") || "untitled";

export const titleFromFilename = (name) => name
  .replace(/\.[^.]+$/, "")
  .replace(/^\d+[\s._-]*/, "")
  .replace(/\s*\([^)]*(mix|master|version|edit|old|demo)[^)]*\)\s*$/i, "")
  .replace(/[-_]+/g, " ")
  .replace(/\s+/g, " ")
  .trim() || "Untitled Track";
