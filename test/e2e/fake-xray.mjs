#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';

const args = process.argv.slice(2);

if (args.includes('-version')) {
  console.log('Xray 26.7.11 (WebXray browser test)');
  process.exit(0);
}

const configIndex = args.indexOf('-c');
if (args[0] !== 'run' || configIndex < 0 || !args[configIndex + 1]) process.exit(2);
const config = JSON.parse(await readFile(args[configIndex + 1], 'utf8'));

if (args.includes('-test')) {
  console.log('Configuration OK.');
  process.exit(0);
}

const inbound = config.inbounds?.find((item) => item.protocol === 'mixed');
if (!inbound?.port) process.exit(3);

const server = createServer((socket) => socket.end());
server.on('error', (error) => {
  console.error(`Failed to start: ${error.message}`);
  process.exit(1);
});
server.listen(inbound.port, inbound.listen || '127.0.0.1', () => {
  console.log(`Xray test core listening on ${inbound.listen || '127.0.0.1'}:${inbound.port}`);
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 1000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
