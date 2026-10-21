import { questionProblem, scoreAnswers } from '../../../../functions/questionTypes.js';

export { PUBLIC_QUESTION_FIELDS, scoreQuestion } from '../../../../functions/questionTypes.js';

const MESSAGES = { type: 'có dữ liệu không hợp lệ', options: 'thiếu phương án trả lời', answer: 'thiếu đáp án hợp lệ' };

export function validateQuestions(questions, requireAnswers = true) {
  if (!Array.isArray(questions) || questions.length === 0) throw new Error('Đề thi thiếu danh sách câu hỏi. Vui lòng liên hệ giáo viên.');
  for (const [index, q] of questions.entries()) {
    const problem = questionProblem(q, requireAnswers);
    if (problem) throw new Error(`Câu ${index + 1} ${MESSAGES[problem]}.`);
  }
  return questions;
}

export function gradeExam(questions, answers = {}) {
  validateQuestions(questions);
  return scoreAnswers(questions, answers);
}

export function restoreProgress(raw, durationSeconds, now = Date.now()) {
  const progress = JSON.parse(raw);
  validateQuestions(progress.examSnapshot, false);
  if (!progress.userAnswers || typeof progress.userAnswers !== 'object' || Array.isArray(progress.userAnswers)) throw new Error('Bản lưu câu trả lời không hợp lệ.');
  // Older snapshots have only remaining seconds. Zero must stay expired.
  const deadline = Number.isFinite(progress.deadline) ? progress.deadline
    : Number.isFinite(progress.timeLeft) && progress.timeLeft >= 0
      ? now + Math.min(progress.timeLeft, durationSeconds) * 1000 : NaN;
  if (!Number.isFinite(deadline)) throw new Error('Bản lưu thiếu thời gian làm bài.');
  return { ...progress, deadline, timeLeft: Math.max(0, Math.ceil((deadline - now) / 1000)), cheatCount: Number(progress.cheatCount) || 0 };
}
