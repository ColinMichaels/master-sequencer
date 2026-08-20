const DATABASE_NAME = "project-sequencer-audio-sources-v1";
const DATABASE_VERSION = 1;
const STORE_NAME = "sources";

const unavailableStore = Object.freeze({
  supported: false,
  list: async () => [],
  get: async () => null,
  put: async () => false,
  remove: async () => false,
});

export const createBrowserAudioSourceStore = (indexedDb = globalThis.indexedDB) => {
  if (!indexedDb?.open) return unavailableStore;

  let databasePromise;
  const database = () => {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDb.open(DATABASE_NAME, DATABASE_VERSION);
      request.addEventListener("upgradeneeded", () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      }, { once: true });
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error || new Error("Remembered audio sources could not be opened.")), { once: true });
      request.addEventListener("blocked", () => reject(new Error("Remembered audio sources are temporarily blocked by another tab.")), { once: true });
    });
    return databasePromise;
  };

  const request = async (mode, operation) => {
    const db = await database();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const result = operation(transaction.objectStore(STORE_NAME));
      result.addEventListener("success", () => resolve(result.result), { once: true });
      result.addEventListener("error", () => reject(result.error || transaction.error || new Error("Remembered audio sources could not be updated.")), { once: true });
      transaction.addEventListener("abort", () => reject(transaction.error || new Error("Remembered audio source update was cancelled.")), { once: true });
    });
  };

  return {
    supported: true,
    list: () => request("readonly", (store) => store.getAll()),
    get: (id) => request("readonly", (store) => store.get(id)).then((value) => value || null),
    put: (source) => request("readwrite", (store) => store.put(source)).then(() => true),
    remove: (id) => request("readwrite", (store) => store.delete(id)).then(() => true),
  };
};
