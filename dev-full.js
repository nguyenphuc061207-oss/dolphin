/**
 * Runs the local API server and Vite together (cross-platform `dev:full`).
 * Usage:  node dev-full.js
 */
import { spawn } from 'node:child_process';

const children = ['dev-server.js', 'node_modules/vite/bin/vite.js'].map(script =>
  spawn(process.execPath, [script], { stdio: 'inherit' }),
);

const stop = () => children.forEach(child => child.kill());
children.forEach(child => child.on('exit', code => { stop(); process.exit(code ?? 0); }));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
