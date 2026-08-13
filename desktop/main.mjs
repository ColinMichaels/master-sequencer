import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { accessSync, constants, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog, session, shell } from "electron";
import { runDesktopSmokePlan } from "./smoke-verifier.mjs";

const LOOPBACK_HOST = "127.0.0.1";
const STARTUP_TIMEOUT_MS = 30_000;
const ENGINE_AUTH_HEADER = "X-Project-Sequencer-Engine-Token";
const smokeMode = process.env.PROJECT_SEQUENCER_DESKTOP_SMOKE === "1";
let serverProcess = null;
let mainWindow = null;
let smokeRoot = null;
let engineDetails = null;

app.setName("Project Sequencer");

const existsAndRuns = (candidate) => {
  try {
    if (path.isAbsolute(candidate)) accessSync(candidate, constants.X_OK);
    return spawnSync(candidate, ["-version"], { stdio: "ignore", timeout: 5_000 }).status === 0;
  } catch {
    return false;
  }
};

const executableExists = (candidate) => {
  try {
    accessSync(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

const executableName = (name) => process.platform === "win32" ? `${name}.exe` : name;

const resolveMediaTool = (name, explicitPath) => {
  const candidates = [
    explicitPath?.trim(),
    path.join(process.resourcesPath, "bin", executableName(name)),
    process.platform === "darwin" ? `/opt/homebrew/bin/${name}` : "",
    process.platform === "darwin" ? `/usr/local/bin/${name}` : "",
    executableName(name),
  ].filter(Boolean);
  return candidates.find(existsAndRuns) || "";
};

const resolveNativeAudioProbe = (explicitPath, appRoot) => [
  explicitPath?.trim() ? path.resolve(explicitPath.trim()) : "",
  path.join(process.resourcesPath, "native", "shared-dsp-device-probe"),
  path.join(appRoot, "desktop-resources", "staged", "native", "shared-dsp-device-probe"),
].filter(Boolean).find(executableExists) || "";

const resolveNativeAudioLab = (explicitPath, appRoot) => [
  explicitPath?.trim() ? path.resolve(explicitPath.trim()) : "",
  path.join(process.resourcesPath, "native", "shared-dsp-silent-stream"),
  path.join(appRoot, "desktop-resources", "staged", "native", "shared-dsp-silent-stream"),
].filter(Boolean).find(executableExists) || "";

const reservePort = () => new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.unref();
  probe.once("error", reject);
  probe.listen(0, LOOPBACK_HOST, () => {
    const address = probe.address();
    const port = typeof address === "object" && address ? address.port : 0;
    probe.close((error) => error ? reject(error) : resolve(port));
  });
});

const waitForServer = async (url, engineToken) => {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  let lastError;
  while (Date.now() < deadline) {
    if (serverProcess?.exitCode !== null) throw new Error(`Local engine stopped before startup completed (exit ${serverProcess.exitCode}).`);
    try {
      const response = await fetch(`${url}/api/health`, {
        headers: { [ENGINE_AUTH_HEADER]: engineToken },
        signal: AbortSignal.timeout(1_000),
      });
      if (response.ok) return response.json();
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Local engine did not become ready within ${STARTUP_TIMEOUT_MS / 1_000} seconds${lastError ? `: ${lastError.message}` : "."}`);
};

const stopServer = () => {
  if (serverProcess && serverProcess.exitCode === null) serverProcess.kill("SIGTERM");
  serverProcess = null;
  engineDetails = null;
};

const appPaths = () => {
  const developmentRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const appRoot = app.isPackaged ? app.getAppPath() : developmentRoot;
  const suppliedSmokeRoot = smokeMode ? process.env.PROJECT_SEQUENCER_DESKTOP_USER_ROOT?.trim() : "";
  const userRoot = suppliedSmokeRoot
    ? path.resolve(suppliedSmokeRoot)
    : smokeMode
      ? (smokeRoot = mkdtempSync(path.join(tmpdir(), "project-sequencer-desktop-smoke-")))
      : app.getPath("userData");
  const dataRoot = path.join(userRoot, "data");
  const configRoot = path.join(userRoot, "config");
  const exportsRoot = path.join(userRoot, "exports");
  for (const directory of [dataRoot, configRoot, exportsRoot]) mkdirSync(directory, { recursive: true });
  return { appRoot, userRoot, dataRoot, configRoot, exportsRoot };
};

const startLocalEngine = async () => {
  const paths = appPaths();
  const ffmpeg = resolveMediaTool("ffmpeg", process.env.PROJECT_SEQUENCER_FFMPEG_PATH);
  const ffprobe = resolveMediaTool("ffprobe", process.env.PROJECT_SEQUENCER_FFPROBE_PATH);
  const nativeAudioProbe = resolveNativeAudioProbe(process.env.PROJECT_SEQUENCER_NATIVE_AUDIO_PROBE_PATH, paths.appRoot);
  const nativeAudioLab = resolveNativeAudioLab(process.env.PROJECT_SEQUENCER_NATIVE_AUDIO_LAB_PATH, paths.appRoot);
  if (!ffmpeg || !ffprobe) {
    throw new Error("Project Sequencer requires FFmpeg and ffprobe. Install them or set PROJECT_SEQUENCER_FFMPEG_PATH and PROJECT_SEQUENCER_FFPROBE_PATH.");
  }

  const port = await reservePort();
  const engineToken = randomBytes(32).toString("base64url");
  const serverEntry = path.join(paths.appRoot, "server", "index.mjs");
  const configuredEnvironmentPath = (name, fallback) => process.env[name]?.trim() || fallback;
  const serverEnvironment = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    PROJECT_SEQUENCER_PORT: String(port),
    PROJECT_SEQUENCER_DATA_ROOT: paths.dataRoot,
    PROJECT_SEQUENCER_SEED_PATH: configuredEnvironmentPath("PROJECT_SEQUENCER_SEED_PATH", path.join(paths.appRoot, "data", "seed-state.json")),
    PROJECT_SEQUENCER_CONFIG_PATH: configuredEnvironmentPath("PROJECT_SEQUENCER_CONFIG_PATH", path.join(paths.appRoot, "config", "sequencer.config.json")),
    PROJECT_SEQUENCER_LOCAL_CONFIG_PATH: path.join(paths.configRoot, "sequencer.local.json"),
    PROJECT_SEQUENCER_EXPORTS_PATH: paths.exportsRoot,
    PROJECT_SEQUENCER_FFMPEG_PATH: ffmpeg,
    PROJECT_SEQUENCER_FFPROBE_PATH: ffprobe,
    PROJECT_SEQUENCER_ENGINE_TOKEN: engineToken,
    ...(nativeAudioProbe ? { PROJECT_SEQUENCER_NATIVE_AUDIO_PROBE_PATH: nativeAudioProbe } : {}),
    ...(nativeAudioLab ? { PROJECT_SEQUENCER_NATIVE_AUDIO_LAB_PATH: nativeAudioLab } : {}),
  };

  serverProcess = spawn(process.execPath, [serverEntry], {
    cwd: app.isPackaged ? process.resourcesPath : paths.appRoot,
    env: serverEnvironment,
    stdio: ["ignore", "pipe", "pipe"],
  });
  serverProcess.stdout.setEncoding("utf8");
  serverProcess.stderr.setEncoding("utf8");
  serverProcess.stdout.on("data", (message) => process.stdout.write(`[local-engine] ${message}`));
  serverProcess.stderr.on("data", (message) => process.stderr.write(`[local-engine] ${message}`));
  serverProcess.once("error", (error) => process.stderr.write(`[local-engine] ${error.message}\n`));

  const url = `http://${LOOPBACK_HOST}:${port}`;
  await waitForServer(url, engineToken);
  const anonymousResponse = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(1_000) });
  if (anonymousResponse.status !== 401) throw new Error("Local engine started without enforcing its per-launch credential.");
  return { url, engineToken, ffmpeg, ffprobe, nativeAudioProbe, nativeAudioLab, userRoot: paths.userRoot };
};

const createAuthenticatedRendererSession = (engine) => {
  const partition = `project-sequencer-${randomBytes(12).toString("hex")}`;
  const rendererSession = session.fromPartition(partition, { cache: true });
  rendererSession.webRequest.onBeforeSendHeaders({ urls: [`${engine.url}/*`] }, (details, callback) => {
    details.requestHeaders[ENGINE_AUTH_HEADER] = engine.engineToken;
    callback({ requestHeaders: details.requestHeaders });
  });
  return rendererSession;
};

const lockWindowNavigation = (window) => {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (url !== window.webContents.getURL()) event.preventDefault();
  });
};

const createWindow = async (engine) => {
  const rendererSession = createAuthenticatedRendererSession(engine);
  mainWindow = new BrowserWindow({
    width: 1540,
    height: 980,
    minWidth: 980,
    minHeight: 700,
    show: !smokeMode,
    backgroundColor: "#121518",
    title: "Project Sequencer",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      session: rendererSession,
    },
  });
  lockWindowNavigation(mainWindow);
  mainWindow.once("closed", () => { mainWindow = null; });
  await mainWindow.loadURL(engine.url);

  if (smokeMode) {
    const smokePlan = process.env.PROJECT_SEQUENCER_DESKTOP_SMOKE_PLAN?.trim() || "bootstrap";
    const smokeOptions = { expectNativeAudio: Boolean(engine.nativeAudioProbe), expectNativeAudioLab: Boolean(engine.nativeAudioLab) };
    const result = await mainWindow.webContents.executeJavaScript(`(${runDesktopSmokePlan.toString()})(${JSON.stringify(smokePlan)}, ${JSON.stringify(smokeOptions)})`);
    process.stdout.write(`Desktop smoke passed: ${JSON.stringify(result)}; ${engine.url}; FFmpeg ${engine.ffmpeg}; data ${engine.userRoot}\n`);
    app.quit();
  }
};

const boot = async () => {
  engineDetails ||= await startLocalEngine();
  await createWindow(engineDetails);
};

app.on("before-quit", stopServer);
app.on("window-all-closed", () => {
  if (process.platform !== "darwin" || smokeMode) app.quit();
});
app.on("activate", () => {
  if (!mainWindow && !smokeMode) void boot().catch(reportFatalError);
});
app.on("quit", () => {
  if (smokeRoot) rmSync(smokeRoot, { recursive: true, force: true });
});

const reportFatalError = (error) => {
  process.exitCode = 1;
  process.stderr.write(`Project Sequencer desktop startup failed: ${error.stack || error.message}\n`);
  if (!smokeMode) dialog.showErrorBox("Project Sequencer could not start", error.message);
  if (smokeMode) {
    stopServer();
    app.exit(1);
  } else app.quit();
};

app.whenReady().then(boot).catch(reportFatalError);
