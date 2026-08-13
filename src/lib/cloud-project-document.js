export const CLOUD_PROJECT_DOCUMENT_VERSION = 1;
export const CLOUD_SYNC_PROVIDER = "google";

const LOCAL_ONLY_KEYS = new Set([
  "absolutePath",
  "audioIndexCache",
  "blobUrl",
  "engineToken",
  "fileHandle",
  "folderHandle",
  "localConfig",
  "localPath",
  "mediaBytes",
  "nativeBookmark",
  "objectUrl",
  "permissionHandle",
  "renderPath",
  "sourcePath",
]);

const PLAIN_OBJECT = Object.getPrototypeOf({});

const safeCloudValue = (value, trail = "project") => {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error(`${trail} contains a non-finite number.`);
    return value;
  }
  if (Array.isArray(value)) return value.map((item, index) => safeCloudValue(item, `${trail}[${index}]`));
  if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== PLAIN_OBJECT) {
    throw new Error(`${trail} contains a device-only or non-serializable value.`);
  }
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (LOCAL_ONLY_KEYS.has(key) || /Handle$/.test(key)) throw new Error(`${trail}.${key} is device-local and cannot enter a cloud project document.`);
    if (key === "path" && typeof item === "string" && (/^(?:\/|[a-zA-Z]:[\\/])/.test(item) || item.startsWith("file:"))) {
      throw new Error(`${trail}.${key} contains an absolute device path.`);
    }
    output[key] = safeCloudValue(item, `${trail}.${key}`);
  }
  return output;
};

const cleanIdentifier = (value, label) => {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > 160 || !/^[A-Za-z0-9._:-]+$/.test(text)) throw new Error(`${label} is invalid.`);
  return text;
};

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
};

export const canonicalCloudJson = (value) => JSON.stringify(canonicalize(value));

export const cloudProjectDigest = async (projectState) => {
  const bytes = new TextEncoder().encode(canonicalCloudJson(safeCloudValue(projectState)));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

export const createCloudProjectDocument = async ({
  documentId,
  ownerSubject,
  projectState,
  revision = 0,
  baseRevision = 0,
  clientId,
  updatedAt = new Date().toISOString(),
}) => {
  const safeState = safeCloudValue(projectState);
  const normalizedRevision = Number(revision);
  const normalizedBaseRevision = Number(baseRevision);
  if (!Number.isSafeInteger(normalizedRevision) || normalizedRevision < 0) throw new Error("Cloud revision must be a non-negative integer.");
  if (!Number.isSafeInteger(normalizedBaseRevision) || normalizedBaseRevision < 0 || normalizedBaseRevision > normalizedRevision) throw new Error("Cloud base revision is invalid.");
  if (!Number.isFinite(Date.parse(updatedAt))) throw new Error("Cloud update time is invalid.");
  return {
    cloudSchemaVersion: CLOUD_PROJECT_DOCUMENT_VERSION,
    documentId: cleanIdentifier(documentId, "Cloud document id"),
    ownerSubject: cleanIdentifier(ownerSubject, "Cloud owner subject"),
    revision: normalizedRevision,
    baseRevision: normalizedBaseRevision,
    clientId: cleanIdentifier(clientId, "Cloud client id"),
    updatedAt,
    projectDigest: await cloudProjectDigest(safeState),
    projectState: safeState,
  };
};

export const validateCloudProjectDocument = async (document) => {
  if (!document || document.cloudSchemaVersion !== CLOUD_PROJECT_DOCUMENT_VERSION) throw new Error("Cloud project document version is unsupported.");
  const rebuilt = await createCloudProjectDocument(document);
  if (document.projectDigest !== rebuilt.projectDigest) throw new Error("Cloud project document digest does not match its project state.");
  return rebuilt;
};

export const resolveCloudProjectWrite = ({ remoteDocument, pendingDocument }) => {
  if (!remoteDocument) return { status: "create", document: { ...pendingDocument, revision: 1, baseRevision: 0 } };
  if (remoteDocument.documentId !== pendingDocument.documentId || remoteDocument.ownerSubject !== pendingDocument.ownerSubject) {
    throw new Error("Cloud project identity does not match the pending write.");
  }
  if (remoteDocument.projectDigest === pendingDocument.projectDigest) return { status: "unchanged", document: remoteDocument };
  if (pendingDocument.baseRevision === remoteDocument.revision) {
    return {
      status: "update",
      document: { ...pendingDocument, revision: remoteDocument.revision + 1, baseRevision: remoteDocument.revision },
    };
  }
  return {
    status: "conflict",
    conflict: {
      kind: "divergent-project-edits",
      remoteRevision: remoteDocument.revision,
      pendingBaseRevision: pendingDocument.baseRevision,
      remoteDocument,
      pendingDocument,
    },
  };
};

const publicGoogleSession = (claims) => {
  const subject = cleanIdentifier(claims?.sub, "Google subject");
  const email = typeof claims?.email === "string" ? claims.email.trim().slice(0, 320) : "";
  if (!email || claims.email_verified !== true) throw new Error("Google account email must be verified.");
  return {
    provider: CLOUD_SYNC_PROVIDER,
    subject,
    email,
    displayName: typeof claims.name === "string" ? claims.name.trim().slice(0, 120) : "",
    avatarUrl: typeof claims.picture === "string" && claims.picture.startsWith("https://") ? claims.picture : "",
  };
};

export const createGoogleAuthIntegration = ({ acquireCredential, clearCredential = async () => {} } = {}) => {
  if (typeof acquireCredential !== "function") throw new Error("Google credential acquisition is not configured.");
  let idToken = "";
  let session = null;
  return {
    async signIn() {
      const credential = await acquireCredential();
      if (typeof credential?.idToken !== "string" || !credential.idToken.trim()) throw new Error("Google sign-in did not return an ID token.");
      session = publicGoogleSession(credential.claims);
      idToken = credential.idToken.trim();
      return structuredClone(session);
    },
    publicSession() {
      return session ? structuredClone(session) : null;
    },
    authorizationHeader() {
      if (!idToken) throw new Error("Google sign-in is required before cloud synchronization.");
      return `Bearer ${idToken}`;
    },
    async signOut() {
      idToken = "";
      session = null;
      await clearCredential();
    },
  };
};
