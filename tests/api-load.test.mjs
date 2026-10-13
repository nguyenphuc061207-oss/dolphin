import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

// Vercel's runtime cannot require() ES modules. A dependency that does (firebase-admin 14 →
// jwks-rsa 4 → jose 6) crashes the exam API before any request is handled, while newer local
// Node versions load it fine. Load the route with require(esm) disabled to catch that here.
test('the Vercel exam route loads without require() of ES modules', () => {
  const script = "await import('./api/exam/[method].js'); for (const m of ['app', 'auth', 'app-check', 'firestore']) await import('firebase-admin/' + m); console.log('LOAD_OK');";
  const out = execFileSync(process.execPath, ['--no-experimental-require-module', '--input-type=module', '-e', script], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  assert.match(out, /LOAD_OK/);
});
