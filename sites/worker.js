const INDEX_PATH = "/index.html";

const withSecurityHeaders = (response) => {
  const headers = new Headers(response.headers);
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};

const worker = {
  async fetch(request, env) {
    if (!env?.ASSETS?.fetch) return new Response("Project Sequencer assets are unavailable.", { status: 503 });
    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404 || request.method !== "GET") return withSecurityHeaders(response);
    const fallbackUrl = new URL(INDEX_PATH, request.url);
    const fallback = await env.ASSETS.fetch(new Request(fallbackUrl, request));
    return withSecurityHeaders(fallback);
  },
};

export default worker;
