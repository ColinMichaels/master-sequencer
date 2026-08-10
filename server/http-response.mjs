import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { BASE_SECURITY_HEADERS, parseByteRange } from "./http-utils.mjs";

export const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".flac": "audio/flac",
  ".aiff": "audio/aiff",
  ".aif": "audio/aiff",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

export const contentTypeFor = (filePath) => contentTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream";

export const sendJson = (response, statusCode, value) => {
  const body = JSON.stringify(value);
  response.writeHead(statusCode, {
    ...BASE_SECURITY_HEADERS,
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  response.end(body);
};

export const readJsonBody = async (request, maximumBytes = 5_000_000) => {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > maximumBytes) {
      const error = new Error("Request body is too large.");
      error.statusCode = 413;
      throw error;
    }
  }
  try {
    return body ? JSON.parse(body) : {};
  } catch {
    const error = new Error("Request body must contain valid JSON.");
    error.statusCode = 400;
    throw error;
  }
};

const pipeFile = (response, filePath, options) => {
  const stream = createReadStream(filePath, options);
  stream.on("error", (error) => response.destroy(error));
  stream.pipe(response);
};

export const streamFile = async (request, response, filePath, contentType = contentTypeFor(filePath), extraHeaders = {}) => {
  const file = await stat(filePath);
  const range = parseByteRange(request.headers.range, file.size);
  if (range) {
    if (!range.satisfiable) {
      response.writeHead(416, { ...BASE_SECURITY_HEADERS, ...extraHeaders, "Content-Range": `bytes */${file.size}` });
      response.end();
      return;
    }
    response.writeHead(206, {
      ...BASE_SECURITY_HEADERS,
      ...extraHeaders,
      "Accept-Ranges": "bytes",
      "Content-Length": range.end - range.start + 1,
      "Content-Range": `bytes ${range.start}-${range.end}/${file.size}`,
      "Content-Type": contentType,
      "Cache-Control": "no-store",
    });
    if (request.method === "HEAD") response.end();
    else pipeFile(response, filePath, { start: range.start, end: range.end });
    return;
  }
  response.writeHead(200, {
    ...BASE_SECURITY_HEADERS,
    ...extraHeaders,
    "Accept-Ranges": "bytes",
    "Content-Length": file.size,
    "Content-Type": contentType,
    "Cache-Control": "no-store",
  });
  if (request.method === "HEAD") response.end();
  else pipeFile(response, filePath);
};
