import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const electronBinary = path.join(projectRoot, "node_modules", ".bin", process.platform === "win32" ? "electron.cmd" : "electron");
const child = spawn(electronBinary, [path.join(projectRoot, "desktop", "main.mjs")], {
  cwd: projectRoot,
  env: { ...process.env, PROJECT_SEQUENCER_DESKTOP_SMOKE: "1" },
  stdio: "inherit",
});

const timeout = setTimeout(() => child.kill("SIGTERM"), 45_000);
timeout.unref?.();
child.once("error", (error) => {
  clearTimeout(timeout);
  throw error;
});
child.once("exit", (code, signal) => {
  clearTimeout(timeout);
  if (signal) {
    process.stderr.write(`Desktop smoke was stopped by ${signal}.\n`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = code || 0;
});
