import { timingSafeEqual } from "node:crypto";

export const ENGINE_AUTH_HEADER = "x-project-sequencer-engine-token";

export const configuredEngineToken = () => process.env.PROJECT_SEQUENCER_ENGINE_TOKEN?.trim() || "";

export const engineRequestIsAuthorized = (providedToken, expectedToken = configuredEngineToken()) => {
  if (!expectedToken) return true;
  const provided = Array.isArray(providedToken) ? providedToken[0] : providedToken;
  if (typeof provided !== "string" || !provided) return false;
  const expectedBytes = Buffer.from(expectedToken);
  const providedBytes = Buffer.from(provided);
  return expectedBytes.length === providedBytes.length && timingSafeEqual(expectedBytes, providedBytes);
};
