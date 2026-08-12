const SHA256_PATTERN = /^[0-9a-f]{64}$/i;

const requiredText = (value, label, maximum = 2_000) => {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > maximum) throw new Error(`${label} is required.`);
  return text;
};

const validateFileRecord = (record, label) => {
  if (!record || typeof record !== "object") throw new Error(`${label} is required.`);
  const sourcePath = requiredText(record.sourcePath, `${label} source path`);
  if (!sourcePath.startsWith("/")) throw new Error(`${label} source path must be absolute.`);
  const sha256 = requiredText(record.sha256, `${label} SHA-256`, 64);
  if (!SHA256_PATTERN.test(sha256)) throw new Error(`${label} SHA-256 is invalid.`);
  return { sourcePath, sha256: sha256.toLowerCase() };
};

export const validateFfmpegBundleManifest = (manifest, { platform = process.platform, architecture = process.arch } = {}) => {
  if (!manifest || typeof manifest !== "object") throw new Error("FFmpeg bundle manifest is missing.");
  if (manifest.schemaVersion !== 1) throw new Error(`FFmpeg bundle manifest version ${manifest.schemaVersion ?? "unknown"} is unsupported.`);
  if (manifest.redistributionApproved !== true) throw new Error("FFmpeg redistribution approval is required before staging.");
  if (manifest.binaryKind !== "self-contained") throw new Error("FFmpeg binaries must be self-contained; package-manager dynamic builds are not accepted.");
  if (manifest.platform !== platform || manifest.architecture !== architecture) throw new Error(`FFmpeg bundle targets ${manifest.platform || "unknown"}-${manifest.architecture || "unknown"}, not ${platform}-${architecture}.`);
  const approvalReference = requiredText(manifest.approvalReference, "FFmpeg approval reference", 240);
  const sourceUrl = requiredText(manifest.sourceUrl, "FFmpeg source URL");
  if (!sourceUrl.startsWith("https://")) throw new Error("FFmpeg source URL must use HTTPS.");
  const licenseSpdx = requiredText(manifest.licenseSpdx, "FFmpeg SPDX license", 120);
  const buildConfiguration = requiredText(manifest.buildConfiguration, "FFmpeg build configuration", 8_000);
  const tools = {};
  for (const name of ["ffmpeg", "ffprobe"]) {
    const tool = validateFileRecord(manifest.tools?.[name], name);
    tools[name] = { ...tool, version: requiredText(manifest.tools[name].version, `${name} version`, 240) };
  }
  if (!Array.isArray(manifest.licenseFiles) || manifest.licenseFiles.length === 0) throw new Error("At least one FFmpeg license file is required.");
  const targetNames = new Set();
  const licenseFiles = manifest.licenseFiles.map((record, index) => {
    const validated = validateFileRecord(record, `license file ${index + 1}`);
    const targetName = requiredText(record.targetName, `license file ${index + 1} target name`, 120);
    if (targetName.includes("/") || targetName.includes("\\") || targetName === "." || targetName === "..") throw new Error("FFmpeg license target names must be plain filenames.");
    if (targetNames.has(targetName)) throw new Error(`Duplicate FFmpeg license target name: ${targetName}.`);
    targetNames.add(targetName);
    return { ...validated, targetName };
  });
  return {
    schemaVersion: 1,
    redistributionApproved: true,
    binaryKind: "self-contained",
    platform,
    architecture,
    approvalReference,
    sourceUrl,
    licenseSpdx,
    buildConfiguration,
    tools,
    licenseFiles,
  };
};
