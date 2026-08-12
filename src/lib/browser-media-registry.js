const DATABASE_NAME = "project-sequencer-media-v1";
const STORE_NAME = "media-roots";
const DATABASE_VERSION = 1;

const requestResult = (request) => new Promise((resolve, reject) => {
  request.addEventListener("success", () => resolve(request.result), { once: true });
  request.addEventListener("error", () => reject(request.error || new Error("Browser media storage failed.")), { once: true });
});

export const createBrowserMediaRegistry = ({ indexedDb = globalThis.indexedDB } = {}) => {
  let databasePromise;
  const openDatabase = () => {
    if (!indexedDb) return Promise.resolve(null);
    if (!databasePromise) {
      databasePromise = new Promise((resolve, reject) => {
        const request = indexedDb.open(DATABASE_NAME, DATABASE_VERSION);
        request.addEventListener("upgradeneeded", () => {
          if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
        }, { once: true });
        request.addEventListener("success", () => resolve(request.result), { once: true });
        request.addEventListener("error", () => reject(request.error || new Error("Browser media storage could not be opened.")), { once: true });
      });
    }
    return databasePromise;
  };

  const withStore = async (mode, operation) => {
    const database = await openDatabase();
    if (!database) return null;
    const transaction = database.transaction(STORE_NAME, mode);
    return operation(transaction.objectStore(STORE_NAME));
  };

  return {
    available: Boolean(indexedDb),
    list: async () => (await withStore("readonly", (store) => requestResult(store.getAll()))) || [],
    save: async (record) => {
      if (!record?.id || !["files", "folder"].includes(record.kind)) throw new Error("Browser media record is invalid.");
      const saved = {
        id: String(record.id),
        kind: record.kind,
        label: String(record.label || "Selected audio").slice(0, 120),
        createdAt: record.createdAt || new Date().toISOString(),
        ...(record.kind === "folder" ? { handle: record.handle } : { handles: [...(record.handles || [])] }),
      };
      const result = await withStore("readwrite", (store) => requestResult(store.put(saved)));
      return result === null ? null : saved;
    },
    delete: async (id) => withStore("readwrite", (store) => requestResult(store.delete(String(id)))),
  };
};
