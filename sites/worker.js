const INDEX_PATH = "/index.html";
const DREADNAUTS_ORIGIN = "https://dreadnauts.uk";
const DREADNAUTS_DEMO_TRACKS = new Set([
  "funky-space-reggae-vibes",
  "intergalactic-mind-traveler",
  "captain-of-the-cosmic-tide",
  "nebula-meditation",
  "solar-wind-surfer",
  "spacerock",
  "black-hole-dub",
  "one-love-across-the-universe",
  "return-to-earth",
]);

const withSecurityHeaders = (response) => {
  const headers = new Headers(response.headers);
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};

const upstreamFailure = () => new Response("The Album 1 demo stream is temporarily unavailable.", {
  status: 502,
  headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
});

export const proxyDreadnautsDemoAudio = async (request, env = {}) => {
  if (!["GET", "HEAD"].includes(request.method)) return new Response("Method not allowed.", { status: 405, headers: { Allow: "GET, HEAD" } });
  const trackId = new URL(request.url).pathname.match(/^\/demo-audio\/([a-z0-9-]+)$/)?.[1];
  if (!trackId || !DREADNAUTS_DEMO_TRACKS.has(trackId)) return new Response("Demo track not found.", { status: 404 });

  const upstreamFetch = env.DREADNAUTS_FETCH || fetch;
  try {
    const ticketResponse = await upstreamFetch(`${DREADNAUTS_ORIGIN}/api/audio/ticket/${encodeURIComponent(trackId)}`, {
      method: "POST",
      headers: { "X-Dreadnauts-Player": "player-v1" },
    });
    if (!ticketResponse.ok) return upstreamFailure();
    const sessionCookie = ticketResponse.headers.get("Set-Cookie")?.split(";", 1)[0];
    const ticket = await ticketResponse.json();
    const expectedPath = `/api/audio/stream/${trackId}?`;
    if (!sessionCookie || typeof ticket?.url !== "string" || !ticket.url.startsWith(expectedPath)) return upstreamFailure();

    const headers = new Headers({ Cookie: sessionCookie });
    const range = request.headers.get("Range");
    if (request.method === "GET" && range) headers.set("Range", range);
    const streamResponse = await upstreamFetch(new URL(ticket.url, DREADNAUTS_ORIGIN), { method: request.method, headers });
    if (!streamResponse.ok && streamResponse.status !== 206) return upstreamFailure();
    const responseHeaders = new Headers(streamResponse.headers);
    responseHeaders.delete("Set-Cookie");
    responseHeaders.set("Cache-Control", "private, no-store, max-age=0");
    return withSecurityHeaders(new Response(streamResponse.body, {
      status: streamResponse.status,
      statusText: streamResponse.statusText,
      headers: responseHeaders,
    }));
  } catch {
    return upstreamFailure();
  }
};

const worker = {
  async fetch(request, env) {
    if (!env?.ASSETS?.fetch) return new Response("Project Sequencer assets are unavailable.", { status: 503 });
    if (new URL(request.url).pathname.startsWith("/demo-audio/")) return proxyDreadnautsDemoAudio(request, env);
    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404 || request.method !== "GET") return withSecurityHeaders(response);
    const fallbackUrl = new URL(INDEX_PATH, request.url);
    const fallback = await env.ASSETS.fetch(new Request(fallbackUrl, request));
    return withSecurityHeaders(fallback);
  },
};

export default worker;
