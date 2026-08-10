const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

const normalizeHostname = (value = "") => value.toLowerCase().replace(/^\[|\]$/g, "");

export const BASE_SECURITY_HEADERS = Object.freeze({
  "Content-Security-Policy": "default-src 'self'; base-uri 'none'; connect-src 'self' ws: wss:; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; media-src 'self' blob:; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
});

export const parseByteRange = (header, size) => {
  if (!header) return null;
  if (!Number.isSafeInteger(size) || size < 1) return { satisfiable: false };
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return { satisfiable: false };

  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength < 1) return { satisfiable: false };
    return {
      satisfiable: true,
      start: Math.max(0, size - suffixLength),
      end: size - 1,
    };
  }

  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start < 0 || requestedEnd < start || start >= size) {
    return { satisfiable: false };
  }
  return { satisfiable: true, start, end: Math.min(requestedEnd, size - 1) };
};

export const requestHostIsAllowed = (hostHeader, { configuredHost, port }) => {
  if (!hostHeader) return false;
  try {
    const parsed = new URL(`http://${hostHeader}`);
    const hostname = normalizeHostname(parsed.hostname);
    const allowedHosts = new Set([...LOOPBACK_HOSTS, normalizeHostname(configuredHost)]);
    return allowedHosts.has(hostname) && Number(parsed.port || 80) === Number(port);
  } catch {
    return false;
  }
};

export const requestOriginIsAllowed = (origin, hostHeader) => {
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    return new Set(["http:", "https:"]).has(parsed.protocol)
      && parsed.host.toLowerCase() === String(hostHeader || "").toLowerCase();
  } catch {
    return false;
  }
};

export const isStateChangingMethod = (method = "GET") => !new Set(["GET", "HEAD", "OPTIONS"]).has(method.toUpperCase());
