import { createHash, randomUUID } from "node:crypto";
import { readdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { RenderCancelledError, renderAudio } from "./audio-renderer.mjs";

const terminalStatuses = new Set(["completed", "failed", "cancelled"]);
const SUPPORTED_RENDER_MANIFEST_VERSIONS = new Set([1, 2, 3, 4, 5]);

const isWithin = (parentPath, candidatePath) => {
  const relative = path.relative(parentPath, candidatePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

const walkFiles = async (rootPath) => {
  const files = [];
  const visit = async (directory) => {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const candidate = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) await visit(candidate);
      else if (entry.isFile()) files.push(candidate);
    }
  };
  await visit(rootPath);
  return files;
};

export const discoverRenderResults = async (outputRoot) => {
  const results = [];
  const files = await walkFiles(outputRoot);
  // Only remove the exact temporary audio suffix emitted by audio-renderer.
  await Promise.all(files.filter((filePath) => /\.part\.(?:wav|aiff|flac|mp3|m4a)$/i.test(path.basename(filePath))).map((filePath) => rm(filePath, { force: true })));
  for (const manifestPath of files.filter((filePath) => filePath.endsWith("-render-manifest.json"))) {
    try {
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      if (!SUPPORTED_RENDER_MANIFEST_VERSIONS.has(manifest.schemaVersion) || typeof manifest.audioFile !== "string" || path.basename(manifest.audioFile) !== manifest.audioFile) continue;
      const outputDirectory = path.dirname(manifestPath);
      const documentedAudioFiles = Array.isArray(manifest.audioFiles) && manifest.audioFiles.length
        ? manifest.audioFiles
        : [{ fileName: manifest.audioFile, trackId: manifest.tracks?.[0]?.id || "", trackNumber: 1, title: manifest.tracks?.[0]?.title || path.basename(manifest.audioFile, path.extname(manifest.audioFile)) }];
      if (documentedAudioFiles.some((file) => typeof file?.fileName !== "string" || path.basename(file.fileName) !== file.fileName)) continue;
      const audioFiles = await Promise.all(documentedAudioFiles.map(async (file, index) => {
        const audioPath = path.resolve(outputDirectory, file.fileName);
        if (!isWithin(outputRoot, audioPath)) throw new Error("Rendered audio escaped the output root.");
        const fileStat = await stat(audioPath);
        return {
          trackId: typeof file.trackId === "string" ? file.trackId : "",
          trackNumber: Number.isInteger(file.trackNumber) ? file.trackNumber : index + 1,
          title: typeof file.title === "string" ? file.title : path.basename(file.fileName, path.extname(file.fileName)),
          audioName: file.fileName,
          audioPath,
          size: fileStat.size,
        };
      }));
      const audioPath = audioFiles[0].audioPath;
      const firstFileStat = await stat(audioPath);
      const directoryFiles = await readdir(outputDirectory);
      const cueName = directoryFiles.find((name) => name.endsWith("-cue-sheet.txt"));
      const fallbackId = createHash("sha256").update(path.relative(outputRoot, manifestPath)).digest("hex").slice(0, 24);
      results.push({
        id: typeof manifest.renderId === "string" && manifest.renderId ? manifest.renderId : fallbackId,
        scope: manifest.scope,
        format: manifest.format,
        audioSettings: manifest.audioSettings || null,
        audioPath,
        cuePath: cueName ? path.join(outputDirectory, cueName) : "",
        manifestPath,
        outputDirectory,
        audioName: typeof manifest.displayName === "string" && manifest.displayName ? manifest.displayName : manifest.audioFile,
        audioFiles: Array.isArray(manifest.audioFiles) ? audioFiles : [],
        size: audioFiles.reduce((total, file) => total + file.size, 0),
        warnings: Array.isArray(manifest.warnings) ? manifest.warnings : [],
        masteringPrintPlan: manifest.masteringPrintPlan || null,
        createdAt: typeof manifest.createdAt === "string" && manifest.createdAt ? manifest.createdAt : firstFileStat.mtime.toISOString(),
        recovered: true,
      });
    } catch {
      // A malformed or incomplete derivative is not registered for browser access.
    }
  }
  return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

const publicJob = (job) => ({
  id: job.id,
  scope: job.scope,
  format: job.format,
  status: job.status,
  phase: job.phase,
  progress: Math.round(job.progress),
  createdAt: job.createdAt,
  startedAt: job.startedAt,
  completedAt: job.completedAt,
  error: job.error,
  recovered: Boolean(job.recovered),
  result: job.result || null,
});

export const createRenderJobService = ({
  outputRoot,
  getLibraryFile,
  render = renderAudio,
  timeoutMs = 10 * 60_000,
  now = () => new Date().toISOString(),
} = {}) => {
  const jobs = new Map();
  const results = new Map();
  const queue = [];
  let activeJob = null;
  let initialized = false;

  const runNext = async () => {
    if (activeJob) return;
    const job = queue.shift();
    if (!job) return;
    if (job.status === "cancelled") {
      queueMicrotask(runNext);
      return;
    }
    activeJob = job;
    job.status = "running";
    job.phase = "preparing";
    job.startedAt = now();
    job.controller = new AbortController();
    try {
      const result = await render({
        ...job.details,
        outputRoot,
        getLibraryFile,
        timeoutMs,
        signal: job.controller.signal,
        onProgress: (progress, phase) => {
          if (terminalStatuses.has(job.status)) return;
          job.progress = Math.max(job.progress, Math.min(100, Number(progress) || 0));
          job.phase = phase || job.phase;
        },
      });
      job.status = "completed";
      job.phase = "completed";
      job.progress = 100;
      job.completedAt = now();
      job.result = result;
      results.set(result.id, result);
    } catch (error) {
      job.completedAt = now();
      if (error instanceof RenderCancelledError || error.code === "RENDER_CANCELLED" || job.controller.signal.aborted) {
        job.status = "cancelled";
        job.phase = "cancelled";
        job.error = "Audio rendering was cancelled. Partial output was removed.";
      } else {
        job.status = "failed";
        job.phase = "failed";
        job.error = error.message || "Audio rendering failed.";
      }
    } finally {
      delete job.controller;
      delete job.details;
      activeJob = null;
      queueMicrotask(runNext);
    }
  };

  return {
    async initialize() {
      if (initialized) return;
      for (const result of await discoverRenderResults(outputRoot)) {
        results.set(result.id, result);
        jobs.set(result.id, {
          id: result.id,
          scope: result.scope,
          format: result.format,
          status: "completed",
          phase: "completed",
          progress: 100,
          createdAt: result.createdAt,
          startedAt: result.createdAt,
          completedAt: result.createdAt,
          error: "",
          recovered: true,
          result,
        });
      }
      initialized = true;
    },
    create(details) {
      const id = randomUUID();
      const job = {
        id,
        scope: details.scope,
        format: ["preview", "comparison"].includes(details.scope) ? "mp3" : details.format,
        status: "queued",
        phase: "queued",
        progress: 0,
        createdAt: now(),
        startedAt: "",
        completedAt: "",
        error: "",
        details,
        result: null,
      };
      jobs.set(id, job);
      queue.push(job);
      queueMicrotask(runNext);
      return publicJob(job);
    },
    get(jobId) {
      const job = jobs.get(jobId);
      return job ? publicJob(job) : null;
    },
    list() {
      return [...jobs.values()].map(publicJob).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    cancel(jobId) {
      const job = jobs.get(jobId);
      if (!job) return null;
      if (job.status === "queued") {
        job.status = "cancelled";
        job.phase = "cancelled";
        job.completedAt = now();
        job.error = "Audio rendering was cancelled before it started.";
        delete job.details;
      } else if (job.status === "running") {
        job.phase = "cancelling";
        job.controller.abort();
      }
      return publicJob(job);
    },
    result(renderId) {
      return results.get(renderId) || null;
    },
    shutdown() {
      if (activeJob?.controller) activeJob.controller.abort();
      for (const job of queue) {
        job.status = "cancelled";
        job.phase = "cancelled";
        job.completedAt = now();
        job.error = "Audio rendering stopped when Project Sequencer closed.";
      }
      queue.length = 0;
    },
  };
};
