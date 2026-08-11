import assert from "node:assert/strict";
import test from "node:test";
import worker from "../sites/worker.js";

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
