// Shape checks, answer checks, shuffling and scoring for every question type.
// Shared by the server (policy.js) and the browser (examSafety.js) so both apply the same rules.

export const QUESTION_TYPES = ['single', 'multiple', 'true_false', 'multi_true_false', 'essay', 'dropdown', 'short_answer'];
/** The only question fields a student may receive; everything else (answer keys, explanations) stays secret. */
export const PUBLIC_QUESTION_FIELDS = ['type', 'content', 'options', 'scoringMethod', 'choices', 'answerKind', 'units'];
export const SHORT_ANSWER_MAX = 500;

const isIndex = (v, length) => v !== '' && v != null && Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) < length;
const strings = (list, min = 1, max = 100) => Array.isArray(list) && list.length >= min && list.length <= max && list.every(s => typeof s === 'string');
const normalizeText = (s, caseSensitive) => {
  const text = String(s).normalize('NFC').trim().replace(/\s+/g, ' ');
  return caseSensitive ? text : text.toLowerCase();
};

/**
 * A typed number: digits with an optional `.` or `,` decimal mark and exponent; spaces are ignored.
 * Thousands separators are not supported ("4,096" is 4.096). Anything else is NaN.
 */
export function parseNumber(value) {
  const text = String(value ?? '').replace(/\s+/g, '').replace(',', '.');
  return /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(text) ? Number(text) : NaN;
}

/** Whether a stored short-answer question's unit settings are usable. */
function validUnits(q) {
  if (q.units === undefined || (Array.isArray(q.units) && !q.units.length)) return true;
  if (!strings(q.units, 1, 20) || q.units.some(u => !u.trim())) return false;
  return q.unitFactors === undefined || (Array.isArray(q.unitFactors) && q.unitFactors.length === q.units.length
    && q.unitFactors.every(f => typeof f === 'number' && Number.isFinite(f) && f > 0));
}
const hasUnits = q => Array.isArray(q.units) && q.units.length > 0;

/**
 * What is wrong with question `q`: null when it is usable, 'type', 'options' (what a student sees)
 * or 'answer' (the key, checked only when `requireAnswers`).
 */
export function questionProblem(q, requireAnswers = true) {
  const type = q?.type || 'single';
  if (!q || typeof q !== 'object' || typeof q.content !== 'string' || !QUESTION_TYPES.includes(type)) return 'type';
  if (type === 'essay') return null;
  if (type === 'short_answer') {
    if ((q.answerKind ?? 'text') !== 'text' && q.answerKind !== 'number') return 'options';
    if (q.units !== undefined && !strings(q.units, 0, 20)) return 'options';
    if (!requireAnswers) return null;
    const numeric = q.answerKind === 'number';
    const answersOk = strings(q.acceptedAnswers, 1, 20) && q.acceptedAnswers.every(a => a.trim() && a.length <= SHORT_ANSWER_MAX && (!numeric || Number.isFinite(parseNumber(a))));
    const toleranceOk = q.tolerance === undefined || (typeof q.tolerance === 'number' && Number.isFinite(q.tolerance) && q.tolerance >= 0);
    const modeOk = q.toleranceMode === undefined || ['absolute', 'percent'].includes(q.toleranceMode);
    const caseOk = q.caseSensitive === undefined || typeof q.caseSensitive === 'boolean';
    const unitOk = validUnits(q) && (!hasUnits(q) || isIndex(q.correctUnit, q.units.length));
    return answersOk && toleranceOk && modeOk && caseOk && unitOk ? null : 'answer';
  }
  if (!strings(q.options, 1, 500)) return 'options';
  if (type === 'dropdown') {
    if (!strings(q.choices, 1, 50)) return 'options';
    if (q.scoringMethod !== undefined && !['partial', 'all'].includes(q.scoringMethod)) return 'options';
    if (!requireAnswers) return null;
    return Array.isArray(q.correctAnswer) && q.correctAnswer.length === q.options.length
      && q.correctAnswer.every(v => isIndex(v, q.choices.length)) ? null : 'answer';
  }
  if (!requireAnswers) return null;
  const ok = type === 'multi_true_false'
    ? Array.isArray(q.correctAnswer) && q.correctAnswer.length === q.options.length && q.correctAnswer.every(v => typeof v === 'boolean')
    : type === 'multiple' ? Array.isArray(q.correctAnswer) && q.correctAnswer.length > 0 && q.correctAnswer.every(v => isIndex(v, q.options.length))
      : isIndex(q.correctAnswer, q.options.length);
  return ok ? null : 'answer';
}

/** Whether a student's `answer` has the right shape for question `q` (null means unanswered). */
export function answerShapeOk(q, answer) {
  if (answer === null) return true;
  const type = q.type || 'single';
  const index = v => Number.isInteger(v) && v >= 0 && v < q.options.length;
  if (type === 'essay') return typeof answer === 'string' && answer.length <= 20000;
  if (type === 'short_answer') {
    if (typeof answer === 'string') return answer.length <= SHORT_ANSWER_MAX;
    if (!answer || typeof answer !== 'object' || Array.isArray(answer) || typeof answer.value !== 'string' || answer.value.length > SHORT_ANSWER_MAX) return false;
    return answer.unit == null || (Number.isInteger(answer.unit) && answer.unit >= 0 && answer.unit < (q.units?.length || 0));
  }
  if (type === 'dropdown') return Array.isArray(answer) && answer.length <= q.options.length
    && answer.every(v => v === null || (Number.isInteger(v) && v >= 0 && v < q.choices.length));
  if (type === 'multiple') return Array.isArray(answer) && answer.length <= q.options.length && answer.every(index);
  if (type === 'multi_true_false') return Array.isArray(answer) && answer.length <= q.options.length && answer.every(v => v === null || typeof v === 'boolean');
  return index(answer);
}

function shortAnswerCorrect(q, answer) {
  const { value, unit } = typeof answer === 'string' ? { value: answer, unit: null } : answer || {};
  if (typeof value !== 'string' || !value.trim()) return false;
  const units = hasUnits(q), correctUnit = Number(q.correctUnit);
  if (units && !Number.isInteger(unit)) return false;
  if (q.answerKind !== 'number') {
    if (units && unit !== correctUnit) return false;
    const typed = normalizeText(value, q.caseSensitive);
    return q.acceptedAnswers.some(a => normalizeText(a, q.caseSensitive) === typed);
  }
  const typed = parseNumber(value);
  if (!Number.isFinite(typed)) return false;
  // With conversion factors any listed unit is accepted and compared in a common base; otherwise the unit must match.
  const convert = units && Array.isArray(q.unitFactors);
  if (units && !convert && unit !== correctUnit) return false;
  const actual = convert ? typed * q.unitFactors[unit] : typed;
  const scale = convert ? q.unitFactors[correctUnit] : 1;
  return q.acceptedAnswers.some(a => {
    const expected = parseNumber(a) * scale;
    const allowed = q.toleranceMode === 'percent' ? Math.abs(expected) * (q.tolerance || 0) / 100 : (q.tolerance || 0) * scale;
    return Math.abs(actual - expected) <= allowed + 1e-9 * Math.max(1, Math.abs(expected));
  });
}

/** Points (0–1) earned on question `q`, or null when it is not auto-graded (essay). */
export function scoreQuestion(q, ans) {
  const type = q.type || 'single';
  if (type === 'essay') return null;
  if (type === 'multiple') {
    const canonical = a => [...new Set(a.map(Number))].sort((x, y) => x - y).join(',');
    return Array.isArray(ans) && canonical(q.correctAnswer) === canonical(ans) ? 1 : 0;
  }
  if (type === 'multi_true_false') {
    const ratio = q.correctAnswer.filter((v, j) => Array.isArray(ans) && ans[j] === v).length / q.options.length;
    return q.scoringMethod === 'gdpt_2018' ? (ratio === 1 ? 1 : ratio >= .75 ? .5 : ratio >= .5 ? .25 : ratio >= .25 ? .1 : 0) : ratio;
  }
  if (type === 'dropdown') {
    const ratio = q.correctAnswer.filter((v, j) => Array.isArray(ans) && ans[j] != null && Number(ans[j]) === Number(v)).length / q.options.length;
    return q.scoringMethod === 'all' ? (ratio === 1 ? 1 : 0) : ratio;
  }
  if (type === 'short_answer') return shortAnswerCorrect(q, ans) ? 1 : 0;
  return ans != null && ans !== '' && Number(ans) === Number(q.correctAnswer) ? 1 : 0;
}

/** Score out of 10 for already-validated questions. */
export function scoreAnswers(questions, answers = {}) {
  let correct = 0, gradable = 0;
  questions.forEach((q, i) => {
    const points = scoreQuestion(q, answers[i]);
    if (points === null) return;
    gradable++;
    correct += points;
  });
  return { score: gradable ? Number((correct / gradable * 10).toFixed(2)) : 0, correct, gradable };
}

/** A copy of `q` with options (and dropdown choices) reordered; the answer key follows them. `shuffle` returns a permuted copy. */
export function shuffleQuestionOptions(q, shuffle) {
  if (!q.options?.length) return q;
  const order = shuffle(q.options.map((_, i) => i));
  if (q.type === 'dropdown') {
    const choiceOrder = shuffle(q.choices.map((_, i) => i));
    return { ...q, options: order.map(i => q.options[i]), choices: choiceOrder.map(i => q.choices[i]),
      correctAnswer: order.map(i => choiceOrder.indexOf(Number(q.correctAnswer[i]))) };
  }
  const correctAnswer = q.type === 'multi_true_false' ? order.map(i => q.correctAnswer[i])
    : q.type === 'multiple' ? q.correctAnswer.map(i => order.indexOf(Number(i))) : order.indexOf(Number(q.correctAnswer));
  return { ...q, options: order.map(i => q.options[i]), correctAnswer };
}
