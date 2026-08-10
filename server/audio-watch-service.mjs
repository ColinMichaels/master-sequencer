import { watch as watchFileSystem } from "node:fs";

export const createAudioWatchService = ({ onChange, watch = watchFileSystem, debounceMs = 750, platform = process.platform } = {}) => {
  const watchers = new Map();
  let timer;
  let lastEventAt = "";
  let configured = false;
  const schedule = () => {
    lastEventAt = new Date().toISOString();
    clearTimeout(timer);
    timer = setTimeout(() => onChange().catch(() => {}), debounceMs);
    timer.unref?.();
  };
  return {
    configure(roots, enabled) {
      configured = Boolean(enabled);
      for (const watcher of watchers.values()) watcher.close();
      watchers.clear();
      clearTimeout(timer);
      if (!enabled) return;
      for (const root of roots.filter((item) => item.kind === "folder" && item.connected)) {
        try {
          const watcher = watch(root.path, { persistent: false, recursive: ["darwin", "win32"].includes(platform) }, schedule);
          watcher.on?.("error", () => { watcher.close(); watchers.delete(root.id); });
          watchers.set(root.id, watcher);
        } catch {
          // An unavailable root stays visible as unwatched; rescans remain manual.
        }
      }
    },
    status() {
      return { configured, enabled: watchers.size > 0, watchedRootIds: [...watchers.keys()], lastEventAt };
    },
    close() {
      clearTimeout(timer);
      for (const watcher of watchers.values()) watcher.close();
      watchers.clear();
    },
  };
};
