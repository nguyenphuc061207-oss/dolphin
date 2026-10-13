import { ExamError } from './policy.js';

// Everything a student or teacher may call. Anything else is 404 before touching data.
export const METHODS = ['publishExam', 'getExamInfo', 'startAttempt', 'saveAnswers', 'submitAttempt', 'finishExpiredAttempts', 'getReview', 'deleteExam', 'updateExamSettings', 'recalculateSubmission'];

const STATUS = {
  'invalid-argument': 400, 'failed-precondition': 400, unauthenticated: 401, 'permission-denied': 403,
  'not-found': 404, 'resource-exhausted': 429, unavailable: 503, internal: 500,
};

/** Error raised by the HTTP layer itself (login, App Check). */
export class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

const reply = (status, code, message) => ({ status, body: { error: { code, message } } });

/**
 * Pure request handler: no Firebase imports, so the same checks run in tests and on Vercel.
 * Order matters: the caller is identified and App Check passes before any data is read.
 */
export function createExamHttpHandler({ service, verifyUser, verifyAppCheck, log = () => {} }) {
  return async function handle({ method, name, headers = {}, body }) {
    if (method !== 'POST') return reply(405, 'invalid-argument', 'Chỉ nhận yêu cầu POST.');
    if (!METHODS.includes(name)) return reply(404, 'not-found', 'Không có chức năng này.');
    try {
      const uid = await verifyUser(headers.authorization);
      await verifyAppCheck(headers['x-firebase-appcheck']);
      await service.checkMaintenance();
      await service.rateLimit(uid);
      const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
      return { status: 200, body: await service[name](uid, input) };
    } catch (error) {
      if (error instanceof ApiError) return reply(error.status, error.code, error.message);
      if (error instanceof ExamError) return reply(STATUS[error.code] ?? 400, error.code, error.message);
      log('Exam API failed', { name, code: error?.code || 'internal' });
      return reply(500, 'internal', 'Chưa xử lý được yêu cầu. Vui lòng thử lại.');
    }
  };
}
