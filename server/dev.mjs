import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const children = [];

function start(command, args, env = {}) {
  const child = spawn(command, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: 'inherit'
  });
  children.push(child);
  child.on('exit', (code) => {
    if (code && code !== 0) stop(code);
  });
}

function stop(code = 0) {
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  process.exit(code);
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

start(process.execPath, ['server/index.mjs', '--api-only'], { RIPO_PORT: process.env.RIPO_PORT || '8788' });
start(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '0.0.0.0']);
