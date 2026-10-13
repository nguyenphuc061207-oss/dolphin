// Vercel serverless route: POST /api/exam/<method>
// Replaces the Firebase callable functions so the exam backend runs on Firebase's free plan:
// Firestore, Auth and App Check are used through the Admin SDK with a service account.
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getAppCheck } from 'firebase-admin/app-check';
import { getFirestore } from 'firebase-admin/firestore';
import { createExamService } from '../../functions/examService.js';
import { createExamHttpHandler, ApiError } from '../../functions/httpApi.js';

let handle = null;

function setup() {
  if (handle) return handle;
  if (!getApps().length) {
    // FIREBASE_SERVICE_ACCOUNT: the JSON key from Firebase Console → Project settings → Service accounts.
    // Set it only in Vercel's environment variables, never in the frontend.
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (raw) initializeApp({ credential: cert(JSON.parse(raw)) });
    // Local emulator runs only (never set on Vercel): no key needed.
    else if (process.env.FIRESTORE_EMULATOR_HOST) initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-dolphin-access' });
    else throw new Error('FIREBASE_SERVICE_ACCOUNT is not set');
  }
  // Same as the callable functions: App Check is required unless explicitly turned off.
  const requireAppCheck = process.env.APP_CHECK_REQUIRED !== 'false';
  handle = createExamHttpHandler({
    service: createExamService(getFirestore()),
    async verifyUser(authorization = '') {
      const token = /^Bearer (.+)$/.exec(authorization)?.[1];
      if (!token) throw new ApiError(401, 'unauthenticated', 'Vui lòng đăng nhập.');
      try { return (await getAuth().verifyIdToken(token)).uid; } catch {
        throw new ApiError(401, 'unauthenticated', 'Phiên đăng nhập đã hết hạn. Hãy tải lại trang.');
      }
    },
    async verifyAppCheck(token) {
      if (!requireAppCheck) return;
      if (!token) throw new ApiError(401, 'unauthenticated', 'Ứng dụng chưa được xác minh. Hãy tải lại trang.');
      try { await getAppCheck().verifyToken(token); } catch {
        throw new ApiError(401, 'unauthenticated', 'Ứng dụng chưa được xác minh. Hãy tải lại trang.');
      }
    },
    log: (message, meta) => console.warn(message, meta),
  });
  return handle;
}

export default async function exam(req, res) {
  let result;
  try {
    result = await setup()({ method: req.method, name: req.query.method, headers: req.headers, body: req.body });
  } catch (error) {
    console.error('Exam API setup failed:', error.message);
    result = { status: 500, body: { error: { code: 'internal', message: 'Chưa xử lý được yêu cầu. Vui lòng thử lại.' } } };
  }
  res.setHeader('Cache-Control', 'no-store');
  res.status(result.status).json(result.body);
}
