'use strict';

// Loopback-only HTTP server for the PC tile editor. Every API call needs the random
// token that is only placed in the URL Vitals opens, so other local pages cannot use it.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const EDITOR_DIR = path.join(__dirname, '..', 'editor');
const files = { '/': ['index.html', 'text/html; charset=utf-8'], '/editor.js': ['editor.js', 'text/javascript; charset=utf-8'], '/editor.css': ['editor.css', 'text/css; charset=utf-8'] };

function createEditorServer({ state, save }) {
  const token = crypto.randomBytes(24).toString('hex');
  let server, ready;

  function send(res, status, body, type = 'application/json; charset=utf-8') {
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:" });
    res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
  }

  function handle(req, res) {
    const url = new URL(req.url, 'http://127.0.0.1');
    // Reject DNS-rebinding: only our own loopback host may talk to us.
    if (!/^(127\.0\.0\.1|localhost):\d+$/.test(req.headers.host || '')) return send(res, 403, { error: 'Hôte refusé.' });
    if (req.method === 'GET' && files[url.pathname]) {
      const [file, type] = files[url.pathname];
      return fs.readFile(path.join(EDITOR_DIR, file), (err, data) => err ? send(res, 500, { error: 'Fichier de l’éditeur manquant.' }) : send(res, 200, data, type));
    }
    if (!url.pathname.startsWith('/api/')) return send(res, 404, { error: 'Introuvable.' });
    const given = Buffer.from(String(req.headers['x-vitals-token'] || ''));
    if (given.length !== token.length || !crypto.timingSafeEqual(given, Buffer.from(token))) return send(res, 401, { error: 'Jeton invalide. Rouvrez l’éditeur depuis Vitals.' });
    if (req.method === 'GET' && url.pathname === '/api/state') return send(res, 200, state());
    if (req.method === 'PUT' && url.pathname === '/api/layout') {
      let body = '';
      req.setEncoding('utf8');
      req.on('data', chunk => { body += chunk; if (body.length > 256 * 1024) req.destroy(); });
      req.on('end', () => {
        try { save(JSON.parse(body)); send(res, 200, state()); }
        catch (e) { send(res, 400, { error: e instanceof SyntaxError ? 'Requête illisible.' : e.message }); }
      });
      return;
    }
    send(res, 404, { error: 'Introuvable.' });
  }

  return {
    start() {
      ready ||= new Promise((resolve, reject) => {
        server = http.createServer(handle);
        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}/#${token}`));
      });
      return ready;
    },
    close() { server?.close(); server = undefined; ready = undefined; }
  };
}

module.exports = { createEditorServer };
