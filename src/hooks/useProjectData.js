import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api.js";

export const useProjectData = () => {
  const [state, setState] = useState(null);
  const [library, setLibrary] = useState([]);
  const [roots, setRoots] = useState([]);
  const [formats, setFormats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [pickingAssets, setPickingAssets] = useState(false);
  const [saveStatus, setSaveStatus] = useState("Loading project…");
  const [error, setError] = useState("");
  const hydrated = useRef(false);
  const saveTimer = useRef();
  const saveChain = useRef(Promise.resolve());
  const latestState = useRef(null);
  const lastSavedJson = useRef("");

  const persistState = useCallback((snapshot) => {
    const serialized = JSON.stringify(snapshot);
    const operation = saveChain.current
      .catch(() => {})
      .then(() => api.saveState(snapshot));
    saveChain.current = operation;
    return operation.then((payload) => {
      lastSavedJson.current = serialized;
      if (JSON.stringify(latestState.current) === serialized) setSaveStatus("Saved locally.");
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
      hydrated.current = true;
      setState(payload.state);
      setLibrary(payload.library);
      setRoots(payload.roots);
      setFormats(payload.supportedFormats);
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
    if (serialized === lastSavedJson.current) return undefined;
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

  const updateState = useCallback((recipe) => {
    setState((current) => {
      const next = structuredClone(current);
      recipe(next);
      return next;
    });
  }, []);

  const applyLibraryPayload = useCallback((payload) => {
    setLibrary(payload.library);
    setRoots(payload.roots);
    setFormats([...new Set(payload.library.map((file) => file.extension))].sort());
  }, []);

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
      setState(payload.state);
      setSaveStatus("Imported project saved locally.");
      return true;
    } catch (reason) {
      setSaveStatus("Import rejected — current project preserved.");
      setError(reason.message);
      return false;
    }
  }, [persistState]);

  const libraryMap = useMemo(() => new Map(library.map((file) => [file.key, file])), [library]);

  return {
    state,
    library,
    libraryMap,
    roots,
    formats,
    loading,
    scanning,
    pickingAssets,
    saveStatus,
    error,
    setError,
    setState,
    replaceState,
    updateState,
    rescan,
    registerSource,
    chooseSources,
    chooseProjectAssets,
    addRoot,
    removeRoot,
  };
};
