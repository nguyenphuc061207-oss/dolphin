import { restoreProgress } from './examSafety.js';

export const progressKey = (examId, userId) => `exam_progress_${examId}_${userId}`;

export function readExamProgress(examId, userId, durationSeconds, storage = globalThis.localStorage) {
  const raw = storage.getItem(progressKey(examId, userId));
  if (!raw) return null;
  const saved = restoreProgress(raw, durationSeconds);
  // Old browser backups may contain answer keys. They are never trusted or reused.
  saved.examSnapshot = saved.examSnapshot.map(q => Object.fromEntries(
    ['type', 'content', 'options', 'scoringMethod'].filter(k => q[k] !== undefined).map(k => [k, q[k]])
  ));
  const publicText = JSON.stringify(saved.examSnapshot);
  saved.mathDictionary = Object.fromEntries(Object.entries(saved.mathDictionary || {}).filter(([key]) => publicText.includes(key)));
  if ((saved.studentId && saved.studentId !== userId) || (saved.examId && saved.examId !== examId)) {
    throw new Error('Bản lưu không thuộc tài khoản hoặc đề thi này.');
  }
  return saved;
}

/** Forget this browser's copy of an attempt (answers, position, recorded leaves). */
export function removeExamProgress(examId, userId, storage = globalThis.localStorage) {
  storage.removeItem(progressKey(examId, userId));
  storage.removeItem(`exam_violations_${examId}_${userId}`);
}

export function listExamProgress(userId, storage = globalThis.localStorage) {
  if (!userId) return [];
  const drafts = [];
  const suffix = `_${userId}`;
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith('exam_progress_') || !key.endsWith(suffix)) continue;
    const examId = key.slice('exam_progress_'.length, -suffix.length);
    if (!/^[a-zA-Z0-9_-]+$/.test(examId)) continue;
    try {
      const saved = readExamProgress(examId, userId, Infinity, storage);
      if (saved) drafts.push({ ...saved, examId });
    } catch { /* A damaged entry must not hide the other recoverable exams. */ }
  }
  return drafts.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
}
