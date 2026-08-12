export const runDesktopSmokePlan = async (plan = "bootstrap", { expectNativeAudio = false } = {}) => {
  const requireCondition = (condition, message) => {
    if (!condition) throw new Error(message);
  };

  const jsonRequest = async (url, options) => {
    const response = await fetch(url, options);
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error || `${url} returned ${response.status}.`);
    return { response, body };
  };

  const verifyPersistedMarker = (bootstrap) => {
    const track = bootstrap.state?.albums?.[0]?.tracks?.find((item) => item.id === "desktop-smoke-track");
    requireCondition(track?.notes === "Desktop packaged persistence verified", "Desktop project state did not persist across relaunch.");
  };

  const verifyMediaServices = async (bootstrap) => {
    const file = bootstrap.library.find((item) => item.name === "Desktop Smoke.wav");
    requireCondition(file, "Generated desktop smoke audio was not indexed.");
    const key = encodeURIComponent(file.key);

    const range = await fetch(`/api/media?key=${key}`, { headers: { Range: "bytes=0-31" } });
    requireCondition(range.status === 206, `Indexed range playback returned ${range.status} instead of 206.`);
    requireCondition((await range.arrayBuffer()).byteLength === 32, "Indexed range playback did not return the requested 32 bytes.");

    const waveform = (await jsonRequest(`/api/waveform?key=${key}&points=240`)).body;
    requireCondition(Array.isArray(waveform.points) && waveform.points.length === 240, "Waveform analysis did not return 240 compact peak points.");
    const waveformText = JSON.stringify(waveform);
    requireCondition(!waveformText.includes('"absolutePath"') && !/\/(?:Users|private|var\/folders)\//.test(waveformText), "Waveform data exposed an absolute source path.");

    const analysis = (await jsonRequest(`/api/analysis?key=${key}`)).body;
    requireCondition(analysis.measurements && Number.isFinite(analysis.measurements.integratedLoudness), "Technical analysis did not return integrated loudness.");
    const analysisText = JSON.stringify(analysis);
    requireCondition(!analysisText.includes('"absolutePath"') && !/\/(?:Users|private|var\/folders)\//.test(analysisText), "Technical analysis exposed an absolute source path.");
    return file;
  };

  const createAndVerifyPrint = async (bootstrap) => {
    const album = bootstrap.state.albums[0];
    const created = (await jsonRequest("/api/renders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ album, scope: "track", trackId: "desktop-smoke-track", format: "wav", deliveryProfileId: "archive-wav" }),
    })).body;
    let job = created.job;
    for (let attempt = 0; attempt < 200 && !["completed", "failed", "cancelled"].includes(job.status); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      job = (await jsonRequest(`/api/render-jobs/${encodeURIComponent(job.id)}`)).body.job;
    }
    requireCondition(job.status === "completed", `Desktop smoke print ended with ${job.status}: ${job.error || "no detail"}`);
    requireCondition(job.result?.audioUrl && job.result?.cueUrl && job.result?.manifestUrl, "Desktop smoke print did not publish audio, cue, and manifest endpoints.");

    const range = await fetch(job.result.audioUrl, { headers: { Range: "bytes=0-31" } });
    requireCondition(range.status === 206 && (await range.arrayBuffer()).byteLength === 32, "Printed audio did not support the requested byte range.");
    const cue = await (await fetch(job.result.cueUrl)).text();
    requireCondition(cue.includes("Desktop Smoke Track"), "Printed cue sheet did not identify the fixture track.");
    const manifest = await (await fetch(job.result.manifestUrl)).json();
    requireCondition(manifest.renderId === job.result.id && manifest.tracks?.length === 1, "Printed manifest did not match the completed render.");
    return job.result;
  };

  const persistMarker = async (bootstrap) => {
    const state = structuredClone(bootstrap.state);
    state.albums[0].tracks.find((item) => item.id === "desktop-smoke-track").notes = "Desktop packaged persistence verified";
    await jsonRequest("/api/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    });
  };

  const bootstrap = (await jsonRequest("/api/bootstrap")).body;
  requireCondition(bootstrap.state && Array.isArray(bootstrap.library), "Desktop bootstrap returned an invalid payload.");
  requireCondition(bootstrap.nativeAudio && typeof bootstrap.nativeAudio.available === "boolean", "Desktop bootstrap omitted native-audio status.");
  const nativeAudioText = JSON.stringify(bootstrap.nativeAudio);
  requireCondition(!nativeAudioText.includes("implementationFingerprint") && !nativeAudioText.includes("engineInstanceId") && !/\/(?:Users|private|var\/folders)\//.test(nativeAudioText), "Native-audio status exposed private engine details or a local path.");
  if (expectNativeAudio) {
    requireCondition(bootstrap.nativeAudio.configured && bootstrap.nativeAudio.probeReady, "The packaged native-audio probe was present but did not pass its runtime handshake.");
    requireCondition(bootstrap.nativeAudio.mode === "query-only", "The native-audio POC exceeded its query-only capability boundary.");
    if (bootstrap.nativeAudio.available) requireCondition(bootstrap.nativeAudio.defaultOutput?.accessMode === "query-only", "The native output report exceeded its query-only capability boundary.");
    else requireCondition(bootstrap.nativeAudio.reasonCode === "no-output-device", "The verified native probe returned an unknown output-device state.");
  }
  const nativeAudioAvailable = bootstrap.nativeAudio.available;

  if (plan === "bootstrap") return { plan, libraryFiles: bootstrap.library.length, nativeAudioAvailable };

  if (plan === "media-initial") {
    await verifyMediaServices(bootstrap);
    const render = await createAndVerifyPrint(bootstrap);
    await persistMarker(bootstrap);
    return { plan, libraryFiles: bootstrap.library.length, renderId: render.id, audioName: render.audioName, nativeAudioAvailable };
  }

  if (plan === "media-offline") {
    verifyPersistedMarker(bootstrap);
    requireCondition(bootstrap.library.length === 0, "Offline desktop root unexpectedly retained indexed media.");
    requireCondition(bootstrap.roots.some((root) => root.connected === false), "Missing desktop media root was not reported offline.");
    return { plan, offlineRoots: bootstrap.roots.filter((root) => !root.connected).length, nativeAudioAvailable };
  }

  if (plan === "media-reconnect") {
    verifyPersistedMarker(bootstrap);
    await verifyMediaServices(bootstrap);
    requireCondition(bootstrap.roots.some((root) => root.connected === true), "Restored desktop media root did not reconnect.");
    const jobs = (await jsonRequest("/api/render-jobs")).body.jobs;
    requireCondition(jobs.some((job) => job.status === "completed" && job.recovered), "Documented render history was not recovered after relaunch.");
    return { plan, libraryFiles: bootstrap.library.length, recoveredRenders: jobs.filter((job) => job.recovered).length, nativeAudioAvailable };
  }

  throw new Error(`Unknown desktop smoke plan: ${plan}`);
};
