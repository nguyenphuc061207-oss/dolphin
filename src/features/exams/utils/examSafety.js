const types = new Set(['single', 'multiple', 'true_false', 'multi_true_false', 'essay']);

export function validateQuestions(questions) {
  if (!Array.isArray(questions) || questions.length === 0) throw new Error('Đề thi thiếu danh sách câu hỏi. Vui lòng liên hệ giáo viên.');
  for (const [index, q] of questions.entries()) {
    const type = q?.type || 'single';
    if (!q || typeof q !== 'object' || !types.has(type) || typeof q.content !== 'string') throw new Error(`Câu ${index + 1} có dữ liệu không hợp lệ.`);
    if (type === 'essay') continue;
    if (!Array.isArray(q.options) || !q.options.length || q.options.some(o => typeof o !== 'string')) throw new Error(`Câu ${index + 1} thiếu phương án trả lời.`);
    const validIndex = v => v !== '' && v != null && Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) < q.options.length;
    const validAnswer = type === 'multi_true_false'
      ? Array.isArray(q.correctAnswer) && q.correctAnswer.length === q.options.length && q.correctAnswer.every(v => typeof v === 'boolean')
      : type === 'multiple'
        ? Array.isArray(q.correctAnswer) && q.correctAnswer.length > 0 && q.correctAnswer.every(validIndex)
        : validIndex(q.correctAnswer);
    if (!validAnswer) throw new Error(`Câu ${index + 1} thiếu đáp án hợp lệ.`);
  }
  return questions;
}

export function gradeExam(questions, answers = {}) {
  validateQuestions(questions);
  let correct = 0;
  let gradable = 0;
  questions.forEach((q, i) => {
    const type = q.type || 'single';
    const ans = answers[i];
    if (type === 'essay') return;
    gradable++;
    if (type === 'multiple') {
      const expected = [...new Set(q.correctAnswer.map(Number))].sort((a, b) => a - b).join(',');
      const actual = Array.isArray(ans) ? [...new Set(ans.map(Number))].sort((a, b) => a - b).join(',') : '';
      if (expected === actual) correct++;
    } else if (type === 'multi_true_false') {
      const count = q.correctAnswer.filter((v, j) => Array.isArray(ans) && ans[j] === v).length;
      const ratio = count / q.options.length;
      correct += q.scoringMethod === 'gdpt_2018' ? (ratio === 1 ? 1 : ratio >= .75 ? .5 : ratio >= .5 ? .25 : ratio >= .25 ? .1 : 0) : ratio;
    } else if (ans != null && ans !== '' && Number(ans) === Number(q.correctAnswer)) correct++;
  });
  return { score: gradable ? Number((correct / gradable * 10).toFixed(2)) : 0, correct, gradable };
}

export function restoreProgress(raw, durationSeconds, now = Date.now()) {
  const progress = JSON.parse(raw);
  validateQuestions(progress.examSnapshot);
  if (!progress.userAnswers || typeof progress.userAnswers !== 'object' || Array.isArray(progress.userAnswers)) throw new Error('Bản lưu câu trả lời không hợp lệ.');
  // Older snapshots have only remaining seconds. Zero must stay expired.
  const deadline = Number.isFinite(progress.deadline) ? progress.deadline
    : Number.isFinite(progress.timeLeft) && progress.timeLeft >= 0
      ? now + Math.min(progress.timeLeft, durationSeconds) * 1000 : NaN;
  if (!Number.isFinite(deadline)) throw new Error('Bản lưu thiếu thời gian làm bài.');
  return { ...progress, deadline, timeLeft: Math.max(0, Math.ceil((deadline - now) / 1000)), cheatCount: Number(progress.cheatCount) || 0 };
}
