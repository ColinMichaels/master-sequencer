import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { cwd: repositoryRoot, stdio: "inherit", ...options });
  if (result.status !== 0) process.exit(result.status || 1);
};

const identities = spawnSync("security", ["find-identity", "-v", "-p", "codesigning"], { encoding: "utf8" });
const localDeveloperId = /Developer ID Application:/.test(`${identities.stdout || ""}${identities.stderr || ""}`);
const certificateReady = localDeveloperId || Boolean(process.env.CSC_LINK && process.env.CSC_KEY_PASSWORD);
const appleIdReady = Boolean(process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID);
const apiKeyReady = Boolean(process.env.APPLE_API_KEY && process.env.APPLE_API_KEY_ID && process.env.APPLE_API_ISSUER && process.env.APPLE_TEAM_ID);
const keychainReady = Boolean(process.env.APPLE_KEYCHAIN && process.env.APPLE_KEYCHAIN_PROFILE && process.env.APPLE_TEAM_ID);
const stagedRoot = path.join(repositoryRoot, "desktop-resources", "staged");
const missing = [];
if (!certificateReady) missing.push("Developer ID Application identity or CSC_LINK + CSC_KEY_PASSWORD");
if (!(appleIdReady || apiKeyReady || keychainReady)) missing.push("one complete Apple notarization credential set");
for (const relativePath of ["bin/ffmpeg", "bin/ffprobe", "ffmpeg-runtime-manifest.json"]) {
  await access(path.join(stagedRoot, relativePath)).catch(() => missing.push(`staged ${relativePath}`));
}
try {
  const manifest = JSON.parse(await readFile(path.join(stagedRoot, "ffmpeg-runtime-manifest.json"), "utf8"));
  if (!manifest.approvalReference || !manifest.licenseSpdx) missing.push("portable FFmpeg approval and license metadata");
  if (!manifest.licenseFiles?.length) missing.push("staged FFmpeg license notices");
  for (const license of manifest.licenseFiles || []) {
    await access(path.join(stagedRoot, "licenses", license.targetName)).catch(() => missing.push(`staged licenses/${license.targetName}`));
  }
} catch {
  // Missing manifest is already reported above.
}
if (missing.length) {
  process.stderr.write(`macOS distribution build blocked:\n- ${[...new Set(missing)].join("\n- ")}\n`);
  process.exit(1);
}

run("npm", ["run", "build"]);
run(process.execPath, [path.join(repositoryRoot, "node_modules", "electron-builder", "out", "cli", "cli.js"), "--mac", "dmg", "zip", "-c.forceCodeSigning=true", "-c.mac.notarize=true"]);
run(process.execPath, [path.join(repositoryRoot, "scripts", "audit-macos-release.mjs"), "--require-distribution"]);
