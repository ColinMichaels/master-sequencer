import { cp, mkdir, readdir, rename, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const dist = path.join(root, "dist");
const viteBin = path.join(root, "node_modules", "vite", "bin", "vite.js");

await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [viteBin, "build"], {
    cwd: root,
    env: { ...process.env, VITE_HOSTED_DEMO: "true" },
    stdio: "inherit",
  });
  child.on("error", reject);
  child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`Vite exited with status ${code}.`)));
});

const client = path.join(dist, "client");
await rm(client, { recursive: true, force: true });
await mkdir(client, { recursive: true });
for (const entry of await readdir(dist, { withFileTypes: true })) {
  if (["client", "server", ".openai"].includes(entry.name)) continue;
  await rename(path.join(dist, entry.name), path.join(client, entry.name));
}
await rm(path.join(dist, "server"), { recursive: true, force: true });
await mkdir(path.join(dist, "server"), { recursive: true });
await cp(path.join(root, "sites", "worker.js"), path.join(dist, "server", "index.js"));

console.log("Sites build prepared in dist/server and dist/client.");
