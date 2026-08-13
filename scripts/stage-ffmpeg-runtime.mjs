import { createHash } from "node:crypto";
import { access, chmod, copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { validateFfmpegBundleManifest } from "../src/lib/ffmpeg-bundle-manifest.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stagingRoot = path.join(repositoryRoot, "desktop-resources", "staged");
const argument = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
};
const manifestPath = path.resolve(argument("--manifest") || process.env.PROJECT_SEQUENCER_FFMPEG_BUNDLE_MANIFEST || "");
const checkOnly = process.argv.includes("--check");
if (!argument("--manifest") && !process.env.PROJECT_SEQUENCER_FFMPEG_BUNDLE_MANIFEST) throw new Error("Provide an approved FFmpeg manifest with --manifest or PROJECT_SEQUENCER_FFMPEG_BUNDLE_MANIFEST.");

const manifest = validateFfmpegBundleManifest(JSON.parse(await readFile(manifestPath, "utf8")));
const sha256 = async (filePath) => createHash("sha256").update(await readFile(filePath)).digest("hex");
const verifyHash = async (record, label) => {
  await access(record.sourcePath, constants.R_OK);
  const actual = await sha256(record.sourcePath);
  if (actual !== record.sha256) throw new Error(`${label} SHA-256 mismatch: expected ${record.sha256}, received ${actual}.`);
};

const nonSystemDependencies = (toolPath) => {
  if (process.platform !== "darwin") return [];
  const result = spawnSync("otool", ["-L", toolPath], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || `Could not inspect ${toolPath}.`);
  return result.stdout.split("\n").slice(1).map((line) => line.trim().split(" ")[0]).filter(Boolean).filter((dependency) => !dependency.startsWith("/System/Library/") && !dependency.startsWith("/usr/lib/"));
};

for (const name of ["ffmpeg", "ffprobe"]) {
  const record = manifest.tools[name];
  await access(record.sourcePath, constants.X_OK);
  await verifyHash(record, name);
  const version = spawnSync(record.sourcePath, ["-version"], { encoding: "utf8", timeout: 10_000 });
  if (version.status !== 0 || !version.stdout.split("\n")[0].includes(record.version)) throw new Error(`${name} does not report approved version ${record.version}.`);
  const dependencies = nonSystemDependencies(record.sourcePath);
  if (dependencies.length) throw new Error(`${name} is not self-contained; non-system dependencies include ${dependencies.slice(0, 5).join(", ")}.`);
}
for (const [index, license] of manifest.licenseFiles.entries()) await verifyHash(license, `license file ${index + 1}`);

if (!checkOnly) {
  const binRoot = path.join(stagingRoot, "bin");
  const licensesRoot = path.join(stagingRoot, "licenses");
  await rm(binRoot, { recursive: true, force: true });
  await rm(licensesRoot, { recursive: true, force: true });
  await rm(path.join(stagingRoot, "ffmpeg-runtime-manifest.json"), { force: true });
  await mkdir(binRoot, { recursive: true });
  await mkdir(licensesRoot, { recursive: true });
  for (const name of ["ffmpeg", "ffprobe"]) {
    const target = path.join(binRoot, name);
    await copyFile(manifest.tools[name].sourcePath, target);
    await chmod(target, 0o755);
  }
  for (const license of manifest.licenseFiles) await copyFile(license.sourcePath, path.join(licensesRoot, license.targetName));
  const portableManifest = {
    schemaVersion: 1,
    platform: manifest.platform,
    architecture: manifest.architecture,
    binaryKind: manifest.binaryKind,
    approvalReference: manifest.approvalReference,
    sourceUrl: manifest.sourceUrl,
    licenseSpdx: manifest.licenseSpdx,
    buildConfiguration: manifest.buildConfiguration,
    tools: Object.fromEntries(Object.entries(manifest.tools).map(([name, tool]) => [name, { sha256: tool.sha256, version: tool.version }])),
    licenseFiles: manifest.licenseFiles.map(({ targetName, sha256: digest }) => ({ targetName, sha256: digest })),
    stagedAt: new Date().toISOString(),
  };
  await writeFile(path.join(stagingRoot, "ffmpeg-runtime-manifest.json"), `${JSON.stringify(portableManifest, null, 2)}\n`, { mode: 0o644 });
}

process.stdout.write(`${checkOnly ? "Validated" : "Staged"} approved FFmpeg ${manifest.tools.ffmpeg.version} for ${manifest.platform}-${manifest.architecture}.\n`);
