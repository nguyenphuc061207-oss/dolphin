import { randomInt, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { PUBLIC_QUESTION_FIELDS, questionProblem, answerShapeOk, scoreAnswers, shuffleQuestionOptions } from './questionTypes.js';

export class ExamError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
export const fail = (code, message) => { throw new ExamError(code, message); };
export const id = value => {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(value)) fail('invalid-argument', 'Mã không hợp lệ.');
  return value;
};
export const millis = value => typeof value?.toMillis === 'function' ? value.toMillis()
  : typeof value === 'number' ? value : value ? new Date(value).getTime() : 0;
export const pick = (source, keys) => Object.fromEntries(keys.filter(k => source[k] !== undefined).map(k => [k, source[k]]));
export const publicQuestions = questions => questions.map(q => pick(q, PUBLIC_QUESTION_FIELDS));
export const publicDictionary = (questions, dictionary = {}) => {
  const text = JSON.stringify(publicQuestions(questions));
  return Object.fromEntries(Object.entries(dictionary).filter(([key]) => text.includes(key)));
};
export function examInfo(exam) {
  return { ...pick(exam, ['title', 'teacherId', 'teacherName', 'duration', 'startDate', 'endDate', 'securityLevel', 'isAntiCheat', 'allowMobile', 'attemptLimit', 'examFlow', 'accessType', 'reviewSettings']),
    questionCount: exam.questionCount ?? exam.questions?.length ?? 0, hasPassword: !!exam.hasPassword };
}
const VIOLATION_CODES = ['hidden', 'focus', 'fullscreen', 'screens'];
/** Student-reported violations [{ code, at, awayMs }]: invalid entries dropped, at most 200. */
export function sanitizeViolations(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 200).filter(v => v && VIOLATION_CODES.includes(v.code) && Number.isFinite(v.at))
    .map(v => ({ code: v.code, at: Math.round(v.at),
      awayMs: Number.isFinite(v.awayMs) && v.awayMs >= 0 ? Math.round(Math.min(v.awayMs, 86400000)) : null }));
}
/**
 * Recorded violations are never rewritten by a later request: new entries are appended, an
 * unknown away time may be filled in, and a reason may only change to "left the page".
 */
export function mergeViolations(stored = [], incoming) {
  const next = sanitizeViolations(incoming);
  const merged = stored.map((old, i) => {
    const update = next[i];
    if (!update || update.at !== old.at) return old;
    return { ...old, code: update.code === 'hidden' ? 'hidden' : old.code, awayMs: old.awayMs ?? update.awayMs };
  });
  return merged.concat(next.slice(stored.length)).slice(0, 200);
}
export function passwordHash(password) {
  if (!password) return null;
  if (typeof password !== 'string' || password.length > 256) fail('invalid-argument', 'Mật khẩu quá dài hoặc không hợp lệ.');
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 32).toString('hex')}`;
}
export function checkPassword(password, stored) {
  if (!stored) return true;
  if (typeof password !== 'string' || password.length > 256) return false;
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = scryptSync(String(password || ''), salt, 32);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}
export function validateQuestions(questions) {
  if (!Array.isArray(questions) || !questions.length || questions.length > 500) fail('invalid-argument', 'Danh sách câu hỏi không hợp lệ.');
  questions.forEach(q => {
    const problem = questionProblem(q);
    if (problem === 'type') fail('invalid-argument', 'Câu hỏi không hợp lệ.');
    if (problem) fail('invalid-argument', 'Phương án hoặc đáp án không hợp lệ.');
  });
}
function shuffle(values, random = randomInt) {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i--) { const j = random(i + 1); [copy[i], copy[j]] = [copy[j], copy[i]]; }
  return copy;
}
export function attemptQuestions(exam, questions, random = randomInt) {
  let result = structuredClone(questions);
  if (exam.shuffleQuestions) result = shuffle(result, random);
  if (exam.shuffleOptions) result = result.map(q => shuffleQuestionOptions(q, values => shuffle(values, random)));
  return result;
}
export function validateAnswers(questions, answers) {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers) || JSON.stringify(answers).length > 400000) fail('invalid-argument', 'Câu trả lời không hợp lệ.');
  for (const [key, answer] of Object.entries(answers)) {
    if (!/^\d+$/.test(key) || Number(key) >= questions.length) fail('invalid-argument', 'Mã câu hỏi không hợp lệ.');
    if (!answerShapeOk(questions[Number(key)], answer)) fail('invalid-argument', 'Kiểu câu trả lời không hợp lệ.');
  }
  return answers;
}
export function gradeExam(questions, answers = {}) {
  validateQuestions(questions);
  return scoreAnswers(questions, answers);
}
export function reviewAllowed(exam, uid, now) {
  if (exam.teacherId === uid) return true;
  const settings = exam.reviewSettings || { mode: 'always' };
  return settings.mode === 'always' || (settings.mode === 'after_time' && millis(settings.time) > 0 && now >= millis(settings.time));
}
export function authorizeStart(exam, secrets, uid, input, now) {
  if (exam.archived) fail('not-found', 'Đề thi đã được gỡ.');
  if (millis(exam.startDate) > now || (millis(exam.endDate) && millis(exam.endDate) <= now)) fail('failed-precondition', 'Đề thi chưa mở hoặc đã kết thúc.');
  if (exam.accessType === 'restricted' && !(exam.allowedUsers || []).some(u => u.uid === uid)) {
    fail('permission-denied', 'Bạn không có quyền tham gia đề thi này.');
  }
  if (!checkPassword(input.password, secrets.passwordHash)) fail('permission-denied', 'Mật khẩu đề thi không chính xác.');
}
