import { getToken } from 'firebase/app-check';
import { auth, appCheck } from '@/shared/config/firebase';

// Errors keep the callable-style code ("functions/failed-precondition") the pages already check.
const apiError = (code, message) => Object.assign(new Error(message), { code: `functions/${code}` });

const call = name => async input => {
  const user = auth.currentUser;
  if (!user) throw apiError('unauthenticated', 'Vui lòng đăng nhập.');
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` };
  if (appCheck) headers['X-Firebase-AppCheck'] = (await getToken(appCheck, false)).token;
  let response;
  try {
    response = await fetch(`/api/exam/${name}`, {
      method: 'POST', headers, body: JSON.stringify(input ?? {}), signal: AbortSignal.timeout(60000),
    });
  } catch {
    throw apiError('unavailable', 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.');
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw apiError(body?.error?.code || 'internal', body?.error?.message || 'Chưa xử lý được yêu cầu. Vui lòng thử lại.');
  }
  return body;
};
export const publishExam = call('publishExam');
export const getExamInfo = call('getExamInfo');
export const startAttempt = call('startAttempt');
export const saveAnswers = call('saveAnswers');
export const submitAttempt = call('submitAttempt');
export const finishExpiredAttempts = call('finishExpiredAttempts');
export const getReview = call('getReview');
export const deleteExam = call('deleteExam');
export const updateExamSettings = call('updateExamSettings');
export const recalculateSubmission = call('recalculateSubmission');
