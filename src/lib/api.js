const jsonFetch = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: options.body ? { "Content-Type": "application/json", ...options.headers } : options.headers,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `${response.status} ${response.statusText}`);
  return payload;
};

export const api = {
  bootstrap: () => jsonFetch("/api/bootstrap"),
  saveState: (state) => jsonFetch("/api/state", { method: "PUT", body: JSON.stringify(state) }),
  beaconState: (state) => typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function"
    ? navigator.sendBeacon("/api/state", new Blob([JSON.stringify(state)], { type: "application/json" }))
    : false,
  rescan: () => jsonFetch("/api/rescan", { method: "POST" }),
  registerSource: (source) => jsonFetch("/api/sources/register", { method: "POST", body: JSON.stringify(source) }),
  chooseSources: (kind) => jsonFetch("/api/sources/pick", { method: "POST", body: JSON.stringify({ kind }) }),
  chooseProjectAssets: (kind) => jsonFetch("/api/project-assets/pick", { method: "POST", body: JSON.stringify({ kind }) }),
  renderAudio: (details) => jsonFetch("/api/renders", { method: "POST", body: JSON.stringify(details) }),
  waveform: (key, points = 900, signal) => jsonFetch(`/api/waveform?key=${encodeURIComponent(key)}&points=${encodeURIComponent(points)}`, { signal }),
  addRoot: (root) => jsonFetch("/api/roots", { method: "POST", body: JSON.stringify(root) }),
  removeSource: (sourceId) => jsonFetch(`/api/sources/${encodeURIComponent(sourceId)}`, { method: "DELETE" }),
  removeRoot: (rootId) => jsonFetch(`/api/sources/${encodeURIComponent(rootId)}`, { method: "DELETE" }),
  mediaUrl: (key) => `/api/media?key=${encodeURIComponent(key)}`,
  assetUrl: (reference) => reference
    ? `/api/asset?rootId=${encodeURIComponent(reference.rootId)}&path=${encodeURIComponent(reference.relativePath)}`
    : "",
};

export const sourceKey = (sourceRef) => sourceRef
  ? sourceRef.privateSourceId
    ? `private::${sourceRef.privateSourceId}`
    : `${sourceRef.rootId}::${sourceRef.relativePath.replaceAll("\\", "/")}`
  : "";
