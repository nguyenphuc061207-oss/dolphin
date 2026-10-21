/**
 * Local API dev server — mirrors the Vercel serverless function so
 * `npm run dev` (Vite + this server) works exactly like production.
 *
 * Usage:  node dev-server.js
 * Requires Firebase Emulator to be running (firebase emulators:start).
 */
import { createServer } from 'node:http';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { createExamService } from './functions/examService.js';
import { createExamHttpHandler, ApiError } from './functions/httpApi.js';

const PORT = Number(process.env.DEV_API_PORT) || 3001;

// Initialise Firebase Admin for the emulator
if (!getApps().length) {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (raw) {
    initializeApp({ credential: cert(JSON.parse(raw)) });
  } else if (process.env.FIRESTORE_EMULATOR_HOST) {
    initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-dolphin-access' });
  } else {
    // Default: assume emulator — set the env vars automatically
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
    process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';
    initializeApp({ projectId: 'demo-dolphin-access' });
  }
}

const handle = createExamHttpHandler({
  service: createExamService(getFirestore()),
  async verifyUser(authorization = '') {
    const token = /^Bearer (.+)$/.exec(authorization)?.[1];
    if (!token) throw new ApiError(401, 'unauthenticated', 'Vui lòng đăng nhập.');
    try {
      return (await getAuth().verifyIdToken(token)).uid;
    } catch {
      throw new ApiError(401, 'unauthenticated', 'Phiên đăng nhập đã hết hạn. Hãy tải lại trang.');
    }
  },
  // App Check is disabled in local development
  async verifyAppCheck() {},
  log: (message, meta) => console.warn('[dev-api]', message, meta),
});

const server = createServer(async (req, res) => {
  // CORS for dev
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Firebase-AppCheck');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // Parse /api/exam/<method>
  const match = req.url?.match(/^\/api\/exam\/(\w+)/);
  if (!match) { res.writeHead(404); res.end(JSON.stringify({ error: { code: 'not-found', message: 'Route not found' } })); return; }

  // Read body
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  let body = {};
  try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { /* empty body is fine */ }

  const result = await handle({ method: req.method, name: match[1], headers: req.headers, body });
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');
  res.writeHead(result.status);
  res.end(JSON.stringify(result.body));
});

server.listen(PORT, () => {
  console.log(`\n  🐬 Dev API server running at http://localhost:${PORT}/api/exam/*`);
  console.log(`     Firestore emulator: ${process.env.FIRESTORE_EMULATOR_HOST || '(production)'}`);
  console.log(`     Auth emulator:      ${process.env.FIREBASE_AUTH_EMULATOR_HOST || '(production)'}\n`);
});
