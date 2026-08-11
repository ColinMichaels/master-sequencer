import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { Readable } from "node:stream";
import { proxyDreadnautsDemoAudio } from "./sites/worker.js";

const hostedDemoAudioProxy = () => {
  const install = (server) => {
    server.middlewares.use(async (request, response, next) => {
      if (process.env.VITE_HOSTED_DEMO !== "true" || !request.url?.startsWith("/demo-audio/")) return next();
      try {
        const webRequest = new Request(new URL(request.url, "http://127.0.0.1"), {
          method: request.method,
          headers: request.headers,
        });
        const webResponse = await proxyDreadnautsDemoAudio(webRequest);
        response.statusCode = webResponse.status;
        webResponse.headers.forEach((value, name) => response.setHeader(name, value));
        if (!webResponse.body || request.method === "HEAD") return response.end();
        return Readable.fromWeb(webResponse.body).pipe(response);
      } catch {
        response.statusCode = 502;
        return response.end("The Album 1 demo stream is temporarily unavailable.");
      }
    });
  };
  return { name: "hosted-demo-audio-proxy", apply: "serve", configureServer: install, configurePreviewServer: install };
};

export default defineConfig({
  plugins: [react(), hostedDemoAudioProxy()],
  build: {
    sourcemap: true,
  },
});
