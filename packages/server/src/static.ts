import { createReadStream, existsSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, normalize, sep } from "node:path";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
};

/**
 * Serves the built game (packages/web/dist) from the same server as the API, for hosting.
 * Unknown paths get index.html so reloading any page works.
 */
export function staticFiles(root: string) {
  const index = join(root, "index.html");
  return (req: IncomingMessage, res: ServerResponse): void => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405).end();
      return;
    }
    const path = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
    const file = normalize(join(root, path));
    const inside = file === root || file.startsWith(root.endsWith(sep) ? root : root + sep);
    const found = inside && existsSync(file) && statSync(file).isFile() ? file : index;
    // Built scripts have a content hash in their name, so they can be cached for good; the page itself never is.
    const cache = found === index ? "no-cache" : path.startsWith("/assets/index-") || /-[A-Za-z0-9_-]{8}\.(js|css)$/.test(path) ? "public, max-age=31536000, immutable" : "public, max-age=3600";
    res.writeHead(200, { "content-type": TYPES[extname(found)] ?? "application/octet-stream", "cache-control": cache });
    if (req.method === "HEAD") res.end();
    else createReadStream(found).pipe(res);
  };
}
