import { onlineAppApi } from "./online-app.js";

const jsonFetch = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: options.body ? { "Content-Type": "application/json", ...options.headers } : options.headers,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `${response.status} ${response.statusText}`);
  return payload;
};

const delay = (milliseconds, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) {
    reject(new DOMException("The request was cancelled.", "AbortError"));
    return;
  }
  const onAbort = () => {
    globalThis.clearTimeout(timer);
    reject(new DOMException("The request was cancelled.", "AbortError"));
  };
  const timer = globalThis.setTimeout(() => {
    signal?.removeEventListener("abort", onAbort);
    resolve();
  }, milliseconds);
  signal?.addEventListener("abort", onAbort, { once: true });
});

const startRenderJob = (details) => jsonFetch("/api/renders", { method: "POST", body: JSON.stringify(details) });
const getRenderJob = (jobId) => jsonFetch(`/api/render-jobs/${encodeURIComponent(jobId)}`);
const cancelRenderJob = (jobId) => jsonFetch(`/api/render-jobs/${encodeURIComponent(jobId)}`, { method: "DELETE" });

const waitForRenderJob = async (jobId, { onUpdate = () => {}, signal, pollInterval = 250 } = {}) => {
  while (true) {
    if (signal?.aborted) throw new DOMException("The request was cancelled.", "AbortError");
    const { job } = await getRenderJob(jobId);
    onUpdate(job);
    if (job.status === "completed") return job.result;
    if (job.status === "failed" || job.status === "cancelled") throw new Error(job.error || `Audio rendering ${job.status}.`);
    await delay(pollInterval, signal);
  }
};

const renderAudio = async (details, options = {}) => {
  const { job } = await startRenderJob(details);
  options.onUpdate?.(job);
  return waitForRenderJob(job.id, options);
};

const localApi = {
  onlineApp: false,
  bootstrap: () => jsonFetch("/api/bootstrap"),
  nativeAudioStatus: () => jsonFetch("/api/native-audio/status"),
  nativeAudioLabStatus: () => jsonFetch("/api/native-audio/lab"),
  startNativeAudioLab: (details) => jsonFetch("/api/native-audio/lab", { method: "POST", body: JSON.stringify(details) }),
  stopNativeAudioLab: () => jsonFetch("/api/native-audio/lab", { method: "DELETE" }),
  saveState: (state) => jsonFetch("/api/state", { method: "PUT", body: JSON.stringify(state) }),
  createProject: (details) => jsonFetch("/api/projects", { method: "POST", body: JSON.stringify(details) }),
  loadProject: (projectId) => jsonFetch(`/api/projects/${encodeURIComponent(projectId)}/load`, { method: "POST" }),
  deleteProject: (projectId) => jsonFetch(`/api/projects/${encodeURIComponent(projectId)}`, { method: "DELETE" }),
  restoreRecovery: () => jsonFetch("/api/state/recovery/restore", { method: "POST" }),
  beaconState: (state) => typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function"
    ? navigator.sendBeacon("/api/state", new Blob([JSON.stringify(state)], { type: "application/json" }))
    : false,
  rescan: () => jsonFetch("/api/rescan", { method: "POST" }),
  libraryStatus: () => jsonFetch("/api/library"),
  visualLibrary: () => jsonFetch("/api/visual-library"),
  rescanVisualLibrary: () => jsonFetch("/api/visual-library/rescan", { method: "POST" }),
  updateVisualMetadata: (id, metadata) => jsonFetch(`/api/visual-library/metadata/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(metadata) }),
  revealVisualMedia: (key) => jsonFetch("/api/visual-library/reveal", { method: "POST", body: JSON.stringify({ key }) }),
  portableBundle: () => jsonFetch("/api/project-bundle"),
  registerSource: (source) => jsonFetch("/api/sources/register", { method: "POST", body: JSON.stringify(source) }),
  chooseSources: (kind) => jsonFetch("/api/sources/pick", { method: "POST", body: JSON.stringify({ kind }) }),
  reconnectSource: () => jsonFetch("/api/rescan", { method: "POST" }),
  chooseProjectAssets: (kind) => jsonFetch("/api/project-assets/pick", { method: "POST", body: JSON.stringify({ kind }) }),
  chooseLyricsFolder: () => jsonFetch("/api/project-assets/lyrics-folder", { method: "POST" }),
  renderAudio,
  startRenderJob,
  getRenderJob,
  waitForRenderJob,
  cancelRenderJob,
  waveform: (key, points = 900, signal) => jsonFetch(`/api/waveform?key=${encodeURIComponent(key)}&points=${encodeURIComponent(points)}`, { signal }),
  technicalAnalysis: (key) => jsonFetch(`/api/analysis?key=${encodeURIComponent(key)}`),
  listRenderJobs: () => jsonFetch("/api/render-jobs"),
  renderManifest: (url) => jsonFetch(url),
  revealRender: (id) => jsonFetch("/api/renders/reveal", { method: "POST", body: JSON.stringify({ id }) }),
  addRoot: (root) => jsonFetch("/api/roots", { method: "POST", body: JSON.stringify(root) }),
  removeSource: (sourceId) => jsonFetch(`/api/sources/${encodeURIComponent(sourceId)}`, { method: "DELETE" }),
  removeRoot: (rootId) => jsonFetch(`/api/sources/${encodeURIComponent(rootId)}`, { method: "DELETE" }),
  mediaUrl: (key) => `/api/media?key=${encodeURIComponent(key)}`,
  visualMediaUrl: (key) => `/api/media?visualKey=${encodeURIComponent(key)}`,
  assetUrl: (reference) => reference
    ? reference.visualMediaKey
      ? `/api/media?visualKey=${encodeURIComponent(reference.visualMediaKey)}`
      : `/api/asset?rootId=${encodeURIComponent(reference.rootId)}&path=${encodeURIComponent(reference.relativePath)}`
    : "",
};

// Keep the Vite environment access static so production builds can replace and
// tree-shake this branch. Optional chaining here leaves the local API selected
// in a Sites build, where /api/* routes do not exist.
const onlineAppEnabled = typeof import.meta.env !== "undefined" && import.meta.env.VITE_ONLINE_APP === "true";
export const api = onlineAppEnabled ? onlineAppApi : localApi;

export const sourceKey = (sourceRef) => sourceRef
  ? sourceRef.privateSourceId
    ? `private::${sourceRef.privateSourceId}`
    : `${sourceRef.rootId}::${sourceRef.relativePath.replaceAll("\\", "/")}`
  : "";
