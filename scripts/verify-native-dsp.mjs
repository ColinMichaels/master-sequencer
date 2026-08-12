import { createHash } from "node:crypto";
import { access, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { generateFixtureInput, loadSharedDspGoldenFixtures } from "../tests/helpers/shared-dsp-golden.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packagePath = path.join(repositoryRoot, "native", "SharedDspEngine");
const xcodeRoot = "/Applications/Xcode.app/Contents/Developer";
const xcodeSwift = path.join(xcodeRoot, "Toolchains", "XcodeDefault.xctoolchain", "usr", "bin", "swift");
const xcodeSdk = path.join(xcodeRoot, "Platforms", "MacOSX.platform", "Developer", "SDKs", "MacOSX.sdk");
const scratchPath = process.env.PROJECT_SEQUENCER_SWIFT_SCRATCH || path.join(tmpdir(), "project-sequencer-native-dsp-swift");
const cacheRoot = process.env.PROJECT_SEQUENCER_SWIFT_CACHE || path.join(tmpdir(), "project-sequencer-native-dsp-cache");

await access(xcodeSwift).catch(() => {
  throw new Error("A complete Xcode Swift toolchain is required for native DSP verification.");
});
await mkdir(cacheRoot, { recursive: true });

const environment = {
  ...process.env,
  SDKROOT: xcodeSdk,
  DEVELOPER_DIR: xcodeRoot,
  CLANG_MODULE_CACHE_PATH: path.join(cacheRoot, "clang"),
  SWIFTPM_MODULECACHE_OVERRIDE: path.join(cacheRoot, "swiftpm"),
};
const commonArguments = [
  "--disable-sandbox",
  "--package-path", packagePath,
  "--scratch-path", scratchPath,
  "--cache-path", path.join(cacheRoot, "packages"),
  "--config-path", path.join(cacheRoot, "config"),
  "--security-path", path.join(cacheRoot, "security"),
  "--sdk", xcodeSdk,
];

const runSwift = (subcommand, extraArguments = []) => {
  const result = spawnSync(xcodeSwift, [subcommand, ...commonArguments, ...extraArguments], { cwd: repositoryRoot, env: environment, encoding: "utf8" });
  if (result.status !== 0) throw new Error([result.stdout, result.stderr].filter(Boolean).join("\n") || `Swift ${subcommand} failed.`);
  return result.stdout.trim();
};

runSwift("build");
const binaryPath = runSwift("build", ["--show-bin-path"]);
const selfTest = spawnSync(path.join(binaryPath, "shared-dsp-self-test"), [], { encoding: "utf8" });
if (selfTest.status !== 0) throw new Error(selfTest.stderr || selfTest.stdout || "Native DSP self-test failed.");

const runnerPath = path.join(binaryPath, "shared-dsp-golden-runner");
const fixtureSet = await loadSharedDspGoldenFixtures();
let comparisons = 0;
for (const fixture of fixtureSet.fixtures) {
  const channels = generateFixtureInput(fixture);
  const channelsBase64 = channels.map((channel) => {
    const bytes = Buffer.alloc(channel.length * 4);
    for (let index = 0; index < channel.length; index += 1) bytes.writeFloatLE(channel[index], index * 4);
    return bytes.toString("base64");
  });
  for (const blockSize of fixtureSet.blockSizes) {
    const request = JSON.stringify({ contractVersion: fixtureSet.contractVersion, sampleRate: fixture.sampleRate, blockSize, settings: fixture.settings, channelsBase64 });
    const result = spawnSync(runnerPath, [], { input: request, maxBuffer: 8 * 1024 * 1024 });
    if (result.status !== 0) throw new Error(result.stderr?.toString() || `Native runner failed for ${fixture.id}.`);
    const digest = createHash("sha256").update(result.stdout).digest("hex");
    if (digest !== fixture.expectedSha256) throw new Error(`Native parity failed for ${fixture.id} at ${blockSize} frames: ${digest}`);
    comparisons += 1;
  }
}

process.stdout.write(`${JSON.stringify({
  contractVersion: fixtureSet.contractVersion,
  implementation: "swift",
  fixtures: fixtureSet.fixtures.length,
  blockSizes: fixtureSet.blockSizes,
  comparisons,
  selfTest: selfTest.stdout.trim(),
}, null, 2)}\n`);
