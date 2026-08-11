import assert from "node:assert/strict";
import test from "node:test";
import worker, { proxyDreadnautsDemoAudio } from "../sites/worker.js";

const envFor = (files) => ({
  ASSETS: {
    fetch: async (request) => {
      const pathname = new URL(request.url).pathname;
      return files[pathname] || new Response("missing", { status: 404 });
    },
  },
});

test("Sites worker serves assets and falls back to the app shell for client routes", async () => {
  const env = envFor({
    "/assets/app.js": new Response("script", { headers: { "Content-Type": "text/javascript" } }),
    "/index.html": new Response("<main>Project Sequencer</main>", { headers: { "Content-Type": "text/html" } }),
  });
  const asset = await worker.fetch(new Request("https://example.test/assets/app.js"), env);
  const route = await worker.fetch(new Request("https://example.test/mastering"), env);
  assert.equal(await asset.text(), "script");
  assert.match(await route.text(), /Project Sequencer/);
  assert.equal(route.headers.get("X-Frame-Options"), "DENY");
});

test("Sites worker proxies only approved Album 1 tracks through the protected Dreadnauts ticket flow", async () => {
  const upstreamRequests = [];
  const upstreamFetch = async (input, options = {}) => {
    const request = input instanceof Request ? input : new Request(input, options);
    upstreamRequests.push(request);
    if (new URL(request.url).pathname.startsWith("/api/audio/ticket/")) {
      assert.equal(request.method, "POST");
      assert.equal(request.headers.get("X-Dreadnauts-Player"), "player-v1");
      return Response.json({
        url: "/api/audio/stream/funky-space-reggae-vibes?expires=2000000000&ticket=signed",
        expiresAt: 2_000_000_000_000,
      }, { headers: { "Set-Cookie": "dn_audio_session=session.signature; Path=/; HttpOnly" } });
    }
    assert.equal(request.headers.get("Cookie"), "dn_audio_session=session.signature");
    assert.equal(request.headers.get("Range"), "bytes=0-1023");
    return new Response("audio-chunk", {
      status: 206,
      headers: { "Content-Type": "audio/mpeg", "Content-Range": "bytes 0-1023/10000" },
    });
  };

  const response = await proxyDreadnautsDemoAudio(new Request("https://example.test/demo-audio/funky-space-reggae-vibes", {
    headers: { Range: "bytes=0-1023" },
  }), { DREADNAUTS_FETCH: upstreamFetch });
  assert.equal(response.status, 206);
  assert.equal(response.headers.get("Content-Type"), "audio/mpeg");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(response.headers.get("Set-Cookie"), null);
  assert.equal(await response.text(), "audio-chunk");
  assert.equal(upstreamRequests.length, 2);

  const blocked = await proxyDreadnautsDemoAudio(new Request("https://example.test/demo-audio/not-released"), { DREADNAUTS_FETCH: upstreamFetch });
  assert.equal(blocked.status, 404);
  assert.equal(upstreamRequests.length, 2);
});
