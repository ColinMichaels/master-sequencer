import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const FOLDER_SCRIPT = `
set selectedFolder to choose folder with prompt "Choose an audio folder for Project Sequencer"
return POSIX path of selectedFolder
`;

const FILES_SCRIPT = `
set selectedFiles to choose file with prompt "Choose audio files for Project Sequencer" with multiple selections allowed
set output to ""
repeat with selectedFile in selectedFiles
  set output to output & POSIX path of selectedFile & linefeed
end repeat
return output
`;

const VISUALS_SCRIPT = `
set selectedFiles to choose file with prompt "Choose visual assets for Project Sequencer" of type {"public.image"} with multiple selections allowed
set output to ""
repeat with selectedFile in selectedFiles
  set output to output & POSIX path of selectedFile & linefeed
end repeat
return output
`;

const LYRICS_SCRIPT = `
set selectedFile to choose file with prompt "Choose a lyric file for Project Sequencer" of type {"public.plain-text", "net.daringfireball.markdown"}
return POSIX path of selectedFile
`;

export const parsePickedPaths = (stdout = "") => stdout
  .split(/\r?\n/)
  .map((entry) => entry.trim())
  .filter(Boolean);

const isCancellation = (error) => /user canceled|-128/i.test(`${error?.message || ""}\n${error?.stderr || ""}`);

export const chooseAudioPaths = async ({ kind, platform = process.platform, run = execFileAsync } = {}) => {
  if (!new Set(["files", "folder"]).has(kind)) throw new Error("Choose either audio files or one folder.");
  if (platform !== "darwin") {
    const error = new Error("Native file and folder selection is available on macOS. Enter the full path manually on this platform.");
    error.statusCode = 501;
    throw error;
  }
  try {
    const { stdout } = await run("osascript", ["-e", kind === "folder" ? FOLDER_SCRIPT : FILES_SCRIPT]);
    return parsePickedPaths(stdout);
  } catch (error) {
    if (isCancellation(error)) return [];
    throw error;
  }
};

export const chooseProjectAssetPaths = async ({ kind, platform = process.platform, run = execFileAsync } = {}) => {
  if (!new Set(["visuals", "lyrics"]).has(kind)) throw new Error("Choose visual assets or one lyric file.");
  if (platform !== "darwin") {
    const error = new Error("Native visual and lyric file selection is available on macOS.");
    error.statusCode = 501;
    throw error;
  }
  try {
    const { stdout } = await run("osascript", ["-e", kind === "visuals" ? VISUALS_SCRIPT : LYRICS_SCRIPT]);
    return parsePickedPaths(stdout);
  } catch (error) {
    if (isCancellation(error)) return [];
    throw error;
  }
};
