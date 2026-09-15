/*
 * PageEcho — minimal static server for the real-browser smoke test.
 *   node tools/serve-fixture.js [port]
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.argv[2] || 8791);
const FILE = path.join(__dirname, 'browser-fixture.html');

const server = http.createServer((req, res) => {
  if (req.url === '/favicon.ico') {
    res.writeHead(204);
    res.end();
    return;
  }
  const body = fs.readFileSync(FILE);
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('fixture server on http://127.0.0.1:' + PORT + '/');
});

process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
