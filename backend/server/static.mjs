import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const ASSETS = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml; charset=utf-8']]
]);

export function staticAsset(pathname) {
  try {
    return ASSETS.get(decodeURIComponent(pathname)) || null;
  } catch {
    return null;
  }
}

export async function serveStatic(req, res, frontendDir) {
  const method = req.method || 'GET';
  if (method !== 'GET' && method !== 'HEAD') return false;

  const url = new URL(req.url || '/', 'http://localhost');
  const asset = staticAsset(url.pathname);
  if (!asset) return false;

  const [filename, contentType] = asset;
  const file = path.join(frontendDir, filename);
  const info = await stat(file);
  const etag = `W/"${info.size.toString(16)}-${Math.trunc(info.mtimeMs).toString(16)}"`;
  const headers = {
    'content-type': contentType,
    'content-length': String(info.size),
    'cache-control': 'no-cache',
    etag
  };

  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { etag, 'cache-control': 'no-cache' });
    res.end();
    return true;
  }

  const body = method === 'HEAD' ? undefined : await readFile(file);
  res.writeHead(200, headers);
  res.end(body);
  return true;
}
