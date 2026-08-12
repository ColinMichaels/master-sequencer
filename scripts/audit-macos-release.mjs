import { createHash } from "node:crypto";
import { access, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assessMacReleaseEvidence } from "../src/lib/macos-release-assessment.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argument = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
};
const appPath = path.resolve(argument("--app") || path.join(repositoryRoot, "release", "mac-arm64", "Project Sequencer.app"));
const requireDistribution = process.argv.includes("--require-distribution");
await access(appPath);

const run = (command, args) => {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 30_000 });
  return { ok: result.status === 0, status: result.status, output: `${result.stdout || ""}${result.stderr || ""}`.trim() };
};

const display = run("codesign", ["-dv", "--verbose=4", appPath]);
const verification = run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath]);
const gatekeeper = run("spctl", ["--assess", "--type", "execute", "--verbose=4", appPath]);
const stapler = run("xcrun", ["stapler", "validate", appPath]);
const signature = /Authority=Developer ID Application:/.test(display.output)
  ? "developer-id"
  : /Signature=adhoc|flags=.*adhoc/.test(display.output)
    ? "adhoc"
    : "unsigned";
const hardenedRuntime = /flags=.*runtime/.test(display.output);

const collectNestedCode = async (directory, relative = "") => {
  const results = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relativePath = path.join(relative, entry.name);
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (/\.(app|framework|xpc)$/.test(entry.name)) {
        results.push(relativePath);
        continue;
      }
      results.push(...await collectNestedCode(absolutePath, relativePath));
    } else if (/\.(dylib|node)$/.test(entry.name) || relativePath.startsWith(path.join("Contents", "MacOS")) || ["shared-dsp-device-probe", "shared-dsp-silent-stream"].some((name) => relativePath === path.join("Contents", "Resources", "native", name))) {
      results.push(relativePath);
    }
  }
  return results;
};

const nestedPaths = await collectNestedCode(appPath);
const invalidNestedCode = nestedPaths.filter((relativePath) => !run("codesign", ["--verify", "--strict", path.join(appPath, relativePath)]).ok);
const resourcesPath = path.join(appPath, "Contents", "Resources");
const bundledTools = {};
for (const name of ["ffmpeg", "ffprobe"]) {
  const toolPath = path.join(resourcesPath, "bin", name);
  try {
    const details = await stat(toolPath);
    const version = run(toolPath, ["-version"]);
    bundledTools[name] = { present: details.isFile(), executable: version.ok, version: version.output.split("\n")[0] || "" };
  } catch {
    bundledTools[name] = { present: false, executable: false, version: "" };
  }
}

let nativeAudio = { manifest: false, binaries: {} };
try {
  const manifest = JSON.parse(await readFile(path.join(resourcesPath, "native-audio-runtime-manifest.json"), "utf8"));
  const expectedBinaries = {
    deviceProbe: { name: "shared-dsp-device-probe", capability: "query-only-default-output-probe" },
    silentStream: { name: "shared-dsp-silent-stream", capability: "silence-muted-shadow-and-stress-realtime-output-lab" },
  };
  const binaries = {};
  for (const [key, expected] of Object.entries(expectedBinaries)) {
    const binaryPath = path.join(resourcesPath, "native", expected.name);
    const details = await stat(binaryPath);
    const entry = manifest?.binaries?.[key];
    const fingerprint = createHash("sha256").update(await readFile(binaryPath)).digest("hex");
    binaries[key] = {
      present: details.isFile(),
      executable: Boolean(details.mode & 0o111),
      codeValid: run("codesign", ["--verify", "--strict", binaryPath]).ok,
      manifest: entry?.path === `native/${expected.name}`
        && entry?.capability === expected.capability
        && (key !== "silentStream" || (entry?.silenceTrials === 3 && entry?.shadowTrials === 3 && entry?.stressTrials === 3)),
      fingerprintMatch: entry?.sha256 === fingerprint,
    };
  }
  nativeAudio = {
    manifest: manifest?.schemaVersion === 4
      && manifest?.buildConfiguration === "release"
      && manifest?.protocolVersion === 1
      && manifest?.dspContractVersion === 2,
    binaries,
  };
} catch {
  nativeAudio = { manifest: false, binaries: {} };
}

let ffmpegManifest = null;
try {
  ffmpegManifest = JSON.parse(await readFile(path.join(resourcesPath, "ffmpeg-runtime-manifest.json"), "utf8"));
} catch {
  ffmpegManifest = null;
}
let licenseNotices = false;
try {
  licenseNotices = (await readdir(path.join(resourcesPath, "licenses"))).length > 0;
} catch {
  licenseNotices = false;
}

const evidence = {
  signature,
  hardenedRuntime,
  nestedCodeValid: verification.ok && invalidNestedCode.length === 0,
  notarizationTicket: stapler.ok,
  gatekeeperAccepted: gatekeeper.ok,
  bundledFfmpeg: Object.values(bundledTools).every((tool) => tool.present && tool.executable),
  ffmpegManifest: Boolean(ffmpegManifest?.approvalReference && ffmpegManifest?.licenseSpdx),
  licenseNotices,
};
const assessment = assessMacReleaseEvidence(evidence);
const report = {
  schemaVersion: 1,
  auditedAt: new Date().toISOString(),
  app: path.relative(repositoryRoot, appPath),
  evidence,
  assessment,
  codeSigning: {
    outerVerification: verification.ok,
    signature,
    hardenedRuntime,
    nestedCodeCount: nestedPaths.length,
    invalidNestedCode,
  },
  gatekeeper: { accepted: gatekeeper.ok, detail: gatekeeper.output.split("\n").at(-1) || "" },
  notarization: { stapledTicket: stapler.ok, detail: stapler.output.split("\n").at(-1) || "" },
  ffmpeg: { tools: bundledTools, manifest: ffmpegManifest ? { approvalReference: ffmpegManifest.approvalReference, licenseSpdx: ffmpegManifest.licenseSpdx } : null, licenseNotices },
  nativeAudio,
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (requireDistribution && !assessment.distributionReady) process.exitCode = 1;
