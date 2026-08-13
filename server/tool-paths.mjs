const configuredTool = (environmentName, fallback) => {
  const configured = process.env[environmentName]?.trim();
  return configured || fallback;
};

export const ffmpegExecutable = () => configuredTool("PROJECT_SEQUENCER_FFMPEG_PATH", "ffmpeg");

export const ffprobeExecutable = () => configuredTool("PROJECT_SEQUENCER_FFPROBE_PATH", "ffprobe");
