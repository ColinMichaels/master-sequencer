import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRootArgument = process.argv[2] || process.env.PROJECT_SEQUENCER_FACEPLATE_SOURCE_ROOT;
if (!sourceRootArgument) {
  throw new Error("Pass the generated-image source directory as the first argument or PROJECT_SEQUENCER_FACEPLATE_SOURCE_ROOT.");
}
const sourceRoot = path.resolve(sourceRootArgument);
const outputRoot = path.join(root, "src/assets/premium-rack/mockup-slices");
mkdirSync(outputRoot, { recursive: true });

const assets = [
  { source: "exec-1c8c4919-9654-42dd-af66-eadcb638efc5.png", crop: "1891:365:0:140", size: "1328:252", output: "program-eq-faceplate-clean-v2.png" },
  { source: "exec-e1fee5bb-f924-4e37-8a1a-5a08bb023ba9.png", crop: "2032:317:0:188", size: "1328:207", output: "bus-compressor-faceplate-blank-v2.png" },
  { source: "exec-e1eaa8c0-a8a7-464c-b853-aae16122c9ff.png", size: "972:404", output: "bus-compressor-dual-vu-photoreal-v3.png" },
  { source: "exec-8ed3464e-223e-4c8d-8552-6c2312d0494c.png", crop: "2032:245:0:219", size: "1328:160", output: "precision-limiter-faceplate-clean-v2.png" },
];

for (const asset of assets) {
  const sourcePath = path.join(sourceRoot, asset.source);
  if (!existsSync(sourcePath)) throw new Error(`Missing faceplate source: ${sourcePath}`);
  const filters = [asset.crop ? `crop=${asset.crop}` : "", `scale=${asset.size}:flags=lanczos`].filter(Boolean).join(",");
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", sourcePath, "-vf", filters, "-frames:v", "1", path.join(outputRoot, asset.output)]);
}

// Keep the production compressor plate singular: the supplied needle-free VU
// photograph is composited into the control-free navy faceplate once, here.
execFileSync("ffmpeg", [
  "-hide_banner", "-loglevel", "error", "-y",
  "-i", path.join(outputRoot, "bus-compressor-faceplate-blank-v2.png"),
  "-i", path.join(outputRoot, "bus-compressor-dual-vu-photoreal-v3.png"),
  "-filter_complex", "[1:v]scale=294:122:flags=lanczos[vu];[0:v][vu]overlay=431:22",
  "-frames:v", "1",
  path.join(outputRoot, "bus-compressor-faceplate-photoreal-v3.png"),
]);
