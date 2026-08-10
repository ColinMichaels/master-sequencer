import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api.js";

export const useProjectData = () => {
  const [state, setState] = useState(null);
  const [library, setLibrary] = useState([]);
  const [roots, setRoots] = useState([]);
  const [formats, setFormats] = useState([]);
  const [scan, setScan] = useState(null);
  const [watching, setWatching] = useState({ configured: false, enabled: false, watchedRootIds: [] });
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [pickingAssets, setPickingAssets] = useState(false);
  const [recovery, setRecovery] = useState({ required: false });
  const [projects, setProjects] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState("");
  const [projectOperation, setProjectOperation] = useState(false);
  const [saveStatus, setSaveStatus] = useState("Loading project…");
  const [error, setError] = useState("");
  const hydrated = useRef(false);
  const saveTimer = useRef();
  const saveChain = useRef(Promise.resolve());
  const latestState = useRef(null);
  const lastSavedJson = useRef("");
  const lastQueuedJson = useRef("");
  const undoStack = useRef([]);
  const redoStack = useRef([]);
  const [historyRevision, setHistoryRevision] = useState(0);

  const persistState = useCallback((snapshot) => {
    const serialized = JSON.stringify(snapshot);
    lastQueuedJson.current = serialized;
    const operation = saveChain.current
      .catch(() => {})
      .then(() => api.saveState(snapshot));
    saveChain.current = operation;
    return operation.then((payload) => {
      lastSavedJson.current = serialized;
      if (payload.projects) setProjects(payload.projects);
      if (payload.activeProjectId) setActiveProjectId(payload.activeProjectId);
      if (JSON.stringify(latestState.current) === serialized && lastQueuedJson.current === serialized) setSaveStatus("Saved locally.");
      return payload;
    }).catch((reason) => {
      if (JSON.stringify(latestState.current) === serialized) {
        setSaveStatus("Save failed — changes remain open.");
        setError(reason.message);
      }
      throw reason;
    });
  }, []);

  useEffect(() => {
    api.bootstrap().then((payload) => {
      const serialized = JSON.stringify(payload.state);
      latestState.current = payload.state;
      lastSavedJson.current = serialized;
      lastQueuedJson.current = serialized;
      hydrated.current = true;
      setState(payload.state);
      setLibrary(payload.library);
      setRoots(payload.roots);
      setFormats(payload.supportedFormats);
      setScan(payload.scan || null);
      setWatching(payload.watching || { configured: false, enabled: false, watchedRootIds: [] });
      setRecovery(payload.recovery || { required: false });
      setProjects(payload.projects || []);
      setActiveProjectId(payload.activeProjectId || "");
      setSaveStatus("All changes save automatically.");
      setLoading(false);
    }).catch((reason) => {
      setError(reason.message);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    latestState.current = state;
    if (!state || !hydrated.current) return undefined;
    const serialized = JSON.stringify(state);
    if (serialized === lastSavedJson.current && serialized === lastQueuedJson.current) {
      setSaveStatus((current) => current === "Changes pending…" || current === "Saving changes…" ? "Saved locally." : current);
      return undefined;
    }
    setSaveStatus("Changes pending…");
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      setSaveStatus("Saving changes…");
      persistState(state).catch(() => {});
    }, 500);
    return () => window.clearTimeout(saveTimer.current);
  }, [persistState, state]);

  useEffect(() => {
    const flushPendingState = () => {
      const snapshot = latestState.current;
      if (snapshot && JSON.stringify(snapshot) !== lastSavedJson.current) api.beaconState(snapshot);
    };
    window.addEventListener("pagehide", flushPendingState);
    return () => window.removeEventListener("pagehide", flushPendingState);
  }, []);

  const updateState = useCallback((recipe, label = "Project edit") => {
    setState((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      recipe(next);
      if (JSON.stringify(next) === JSON.stringify(current)) return current;
      undoStack.current.push({ state: current, label });
      if (undoStack.current.length > 100) undoStack.current.shift();
      redoStack.current = [];
      return next;
    });
    setHistoryRevision((revision) => revision + 1);
  }, []);

  const undo = useCallback(() => {
    setState((current) => {
      const previous = undoStack.current.pop();
      if (!current || !previous) return current;
      redoStack.current.push({ state: current, label: previous.label });
      return structuredClone(previous.state);
    });
    setHistoryRevision((revision) => revision + 1);
  }, []);

  const redo = useCallback(() => {
    setState((current) => {
      const next = redoStack.current.pop();
      if (!current || !next) return current;
      undoStack.current.push({ state: current, label: next.label });
      return structuredClone(next.state);
    });
    setHistoryRevision((revision) => revision + 1);
  }, []);

  const applyLibraryPayload = useCallback((payload) => {
    setLibrary(payload.library);
    setRoots(payload.roots);
    setFormats([...new Set(payload.library.map((file) => file.extension))].sort());
    if (payload.scan) setScan(payload.scan);
    if (payload.watching) setWatching(payload.watching);
  }, []);

  useEffect(() => {
    if (!watching.configured) return undefined;
    const timer = window.setInterval(() => {
      api.libraryStatus().then(applyLibraryPayload).catch(() => {});
    }, 3_000);
    return () => window.clearInterval(timer);
  }, [applyLibraryPayload, watching.configured]);

  const rescan = useCallback(async () => {
    setScanning(true);
    setError("");
    try {
      applyLibraryPayload(await api.rescan());
    } catch (reason) {
      setError(reason.message);
    } finally {
      setScanning(false);
    }
  }, [applyLibraryPayload]);

  const pickedFilesFromPayload = useCallback((payload) => {
    applyLibraryPayload(payload);
    const pickedKeys = new Set(payload.pickedKeys || []);
    return payload.library.filter((file) => pickedKeys.has(file.key));
  }, [applyLibraryPayload]);

  const registerSource = useCallback(async (source) => {
    setScanning(true);
    setError("");
    try {
      const payload = await api.registerSource(source);
      return { ok: true, cancelled: false, files: pickedFilesFromPayload(payload) };
    } catch (reason) {
      setError(reason.message);
      return { ok: false, cancelled: false, files: [] };
    } finally {
      setScanning(false);
    }
  }, [pickedFilesFromPayload]);

  const chooseSources = useCallback(async (kind) => {
    setScanning(true);
    setError("");
    try {
      const payload = await api.chooseSources(kind);
      return { ok: true, cancelled: Boolean(payload.cancelled), files: pickedFilesFromPayload(payload) };
    } catch (reason) {
      setError(reason.message);
      return { ok: false, cancelled: false, files: [] };
    } finally {
      setScanning(false);
    }
  }, [pickedFilesFromPayload]);

  const addRoot = useCallback(async (root) => {
    const result = await registerSource(root);
    return result.ok;
  }, [registerSource]);

  const removeRoot = useCallback(async (rootId) => {
    setScanning(true);
    setError("");
    try {
      applyLibraryPayload(await api.removeSource(rootId));
    } catch (reason) {
      setError(reason.message);
    } finally {
      setScanning(false);
    }
  }, [applyLibraryPayload]);

  const chooseProjectAssets = useCallback(async (kind) => {
    setPickingAssets(true);
    setError("");
    try {
      const payload = await api.chooseProjectAssets(kind);
      return { ok: true, cancelled: Boolean(payload.cancelled), assets: payload.assets || [] };
    } catch (reason) {
      setError(reason.message);
      return { ok: false, cancelled: false, assets: [] };
    } finally {
      setPickingAssets(false);
    }
  }, []);

  const replaceState = useCallback(async (nextState) => {
    window.clearTimeout(saveTimer.current);
    setSaveStatus("Validating imported project…");
    setError("");
    try {
      const payload = await persistState(nextState);
      latestState.current = payload.state;
      lastSavedJson.current = JSON.stringify(payload.state);
      lastQueuedJson.current = JSON.stringify(payload.state);
      setState(payload.state);
      undoStack.current = [];
      redoStack.current = [];
      setHistoryRevision((revision) => revision + 1);
      setSaveStatus("Imported project saved locally.");
      return true;
    } catch (reason) {
      setSaveStatus("Import rejected — current project preserved.");
      setError(reason.message);
      return false;
    }
  }, [persistState]);

  const flushPendingState = useCallback(async () => {
    window.clearTimeout(saveTimer.current);
    await saveChain.current.catch(() => {});
    const snapshot = latestState.current;
    if (snapshot && JSON.stringify(snapshot) !== lastSavedJson.current) await persistState(snapshot);
  }, [persistState]);

  const applyProjectPayload = useCallback((payload, status) => {
    const serialized = JSON.stringify(payload.state);
    latestState.current = payload.state;
    lastSavedJson.current = serialized;
    lastQueuedJson.current = serialized;
    setState(payload.state);
    setProjects(payload.projects || []);
    setActiveProjectId(payload.activeProjectId || "");
    setSaveStatus(status);
  }, []);

  const createProject = useCallback(async (details) => {
    setProjectOperation(true);
    setError("");
    setSaveStatus("Saving this project before starting a new one…");
    try {
      await flushPendingState();
      applyProjectPayload(await api.createProject(details), "New project created and saved locally.");
      return true;
    } catch (reason) {
      setSaveStatus("New project could not be created — current project preserved.");
      setError(reason.message);
      return false;
    } finally {
      setProjectOperation(false);
    }
  }, [applyProjectPayload, flushPendingState]);

  const loadProject = useCallback(async (projectId) => {
    if (!projectId || projectId === activeProjectId) return true;
    setProjectOperation(true);
    setError("");
    setSaveStatus("Saving this project before opening the selected project…");
    try {
      await flushPendingState();
      applyProjectPayload(await api.loadProject(projectId), "Saved project loaded.");
      return true;
    } catch (reason) {
      setSaveStatus("Project switch failed — current project preserved.");
      setError(reason.message);
      return false;
    } finally {
      setProjectOperation(false);
    }
  }, [activeProjectId, applyProjectPayload, flushPendingState]);

  const restoreRecovery = useCallback(async () => {
    setSaveStatus("Restoring the recovery snapshot…");
    setError("");
    try {
      const payload = await api.restoreRecovery();
      const serialized = JSON.stringify(payload.state);
      latestState.current = payload.state;
      lastSavedJson.current = serialized;
      lastQueuedJson.current = serialized;
      setState(payload.state);
      undoStack.current = [];
      redoStack.current = [];
      setHistoryRevision((revision) => revision + 1);
      setRecovery(payload.recovery || { required: false });
      if (payload.projects) setProjects(payload.projects);
      if (payload.activeProjectId) setActiveProjectId(payload.activeProjectId);
      setSaveStatus("Recovery snapshot restored locally.");
      return true;
    } catch (reason) {
      setSaveStatus("Recovery could not be completed.");
      setError(reason.message);
      return false;
    }
  }, []);

  const libraryMap = useMemo(() => new Map(library.map((file) => [file.key, file])), [library]);

  return {
    state,
    library,
    libraryMap,
    roots,
    formats,
    scan,
    watching,
    loading,
    scanning,
    pickingAssets,
    recovery,
    projects,
    activeProjectId,
    projectOperation,
    saveStatus,
    error,
    setError,
    replaceState,
    createProject,
    loadProject,
    restoreRecovery,
    updateState,
    commandHistory: {
      canUndo: undoStack.current.length > 0,
      canRedo: redoStack.current.length > 0,
      undoLabel: undoStack.current.at(-1)?.label || "",
      redoLabel: redoStack.current.at(-1)?.label || "",
      undo,
      redo,
      revision: historyRevision,
    },
    rescan,
    registerSource,
    chooseSources,
    chooseProjectAssets,
    addRoot,
    removeRoot,
  };
};
