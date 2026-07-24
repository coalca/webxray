import { createReadStream } from 'node:fs';
import { access } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';

const root = path.resolve(process.argv[2] || 'frontend');
const port = Number(process.argv[3] || 5173);
const host = process.argv[4] || '127.0.0.1';

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml'
};

createServer(async (req, res) => {
  try {
    if (!['GET', 'HEAD'].includes(req.method || 'GET')) {
      res.writeHead(405, { allow: 'GET, HEAD' });
      res.end('Method Not Allowed');
      return;
    }
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const requested = decodeURIComponent(url.pathname);
    const relative = requested === '/' ? 'index.html' : requested.replace(/^\/+/, '');
    let target = path.resolve(root, relative);
    if (!target.startsWith(`${root}${path.sep}`) && target !== root) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    try {
      await access(target);
    } catch {
      target = path.join(root, 'index.html');
    }
    const extension = path.extname(target);
    res.writeHead(200, {
      'content-type': types[extension] || 'application/octet-stream',
      'cache-control': extension === '.html' ? 'no-cache' : 'public, max-age=3600',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'no-referrer',
      'content-security-policy': "default-src 'self'; connect-src http: https:; img-src 'self' data:; style-src 'self'; script-src 'self'"
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    const stream = createReadStream(target);
    stream.once('error', () => res.destroy());
    stream.pipe(res);
  } catch (error) {
    res.writeHead(error instanceof URIError ? 400 : 500, {
      'content-type': 'text/plain; charset=utf-8',
      'x-content-type-options': 'nosniff'
    });
    res.end(error instanceof URIError ? 'Bad Request' : 'Internal Server Error');
  }
}).listen(port, host, () => {
  console.log(`Static frontend listening on http://${host}:${port}`);
});
