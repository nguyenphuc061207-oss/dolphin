import test from 'node:test';
import assert from 'node:assert/strict';
import { publicQuestions, publicDictionary, attemptQuestions, gradeExam, passwordHash, checkPassword, reviewAllowed, authorizeStart, validateAnswers, sanitizeViolations, mergeViolations } from '../policy.js';
import { gradeExam as clientGrade } from '../../src/features/exams/utils/examSafety.js';

const questions = [
  { type: 'single', content: '[!m:q]', options: ['A', 'B'], correctAnswer: 1, explanation: 'SECRET', answer: 'SECRET', hidden: { secret: 'SECRET' } },
  { type: 'multiple', content: 'Multiple', options: ['A', 'B', 'C'], correctAnswer: [0, 2] },
  { type: 'multi_true_false', content: 'TF', options: ['A', 'B', 'C', 'D'], correctAnswer: [true, false, true, false], scoringMethod: 'gdpt_2018' },
  { type: 'essay', content: 'Essay', explanation: 'PRIVATE MODEL ANSWER' },
];
test('allowlisted responses omit all keys, explanations and unrelated formula entries', () => {
  const text = JSON.stringify(publicQuestions(questions));
  for (const word of ['correctAnswer', 'explanation', 'SECRET', 'PRIVATE', 'hidden']) assert.equal(text.includes(word), false);
  assert.deepEqual(publicDictionary(questions, { q: 'x^2', answerFormula: 'TOP SECRET' }), { q: 'x^2' });
});
test('server scoring preserves current rules for every question type and partial scores', () => {
  const cases = [
    [{}, { score: 0, correct: 0, gradable: 3 }],
    [{ 0: 1, 1: [2, 0], 2: [true, false, true, false], 3: 'Essay' }, { score: 10, correct: 3, gradable: 3 }],
    [{ 0: 0, 1: [0], 2: [true, false, null, null] }, { score: 0.83, correct: 0.25, gradable: 3 }],
  ];
  for (const [answers, expected] of cases) {
    assert.deepEqual(gradeExam(questions, answers), expected);
    assert.deepEqual(clientGrade(questions, answers), expected);
  }
});
test('option shuffling retains correct mapping for multiple choice and statement truth values', () => {
  const shuffled = attemptQuestions({ shuffleOptions: true }, questions, () => 0);
  assert.equal(shuffled[0].options[shuffled[0].correctAnswer], 'B');
  assert.deepEqual(shuffled[1].correctAnswer.map(i => shuffled[1].options[i]).sort(), ['A', 'C']);
  assert.deepEqual(shuffled[2].options.map((opt, i) => [opt, shuffled[2].correctAnswer[i]]).sort(), [['A', true], ['B', false], ['C', true], ['D', false]]);
});
test('review never/after_time is decided on the server, with teacher access retained', () => {
  const exam = { teacherId: 'teacher', reviewSettings: { mode: 'never' } };
  assert.equal(reviewAllowed(exam, 'student', 1000), false);
  assert.equal(reviewAllowed(exam, 'teacher', 1000), true);
  exam.reviewSettings = { mode: 'after_time', time: new Date(2000).toISOString() };
  assert.equal(reviewAllowed(exam, 'student', 1999), false);
  assert.equal(reviewAllowed(exam, 'student', 2000), true);
});
test('password hash, roster UID and server date checks resist profile/client manipulation', () => {
  const stored = passwordHash('secret');
  assert.equal(stored.includes('secret'), false);
  assert.equal(checkPassword('secret', stored), true);
  assert.equal(checkPassword('bad', stored), false);
  assert.throws(() => authorizeStart({ accessType: 'restricted', allowedUsers: [{ uid: 'other' }] }, {}, 'student', { studentName: 'Spoofed name', shortId: '1234' }, 1000));
  assert.throws(() => authorizeStart({ startDate: 2000 }, {}, 'student', {}, 1000));
  assert.throws(() => authorizeStart({ endDate: 1000 }, {}, 'student', {}, 1000));
});
test('invalid question IDs, answer shapes and excess payloads are rejected', () => {
  for (const answers of [{ 99: 1 }, { 0: '1' }, { 1: [999] }, { 2: ['true'] }, { 3: 'x'.repeat(20001) }]) assert.throws(() => validateAnswers(questions, answers));
});
test('violation reports are cleaned: unknown reasons, bad times and oversized lists are dropped', () => {
  assert.deepEqual(sanitizeViolations([{ code: 'hidden', at: 10, awayMs: 99999999999 }, { code: 'admin', at: 1 }, 'x', { code: 'focus', at: NaN }]),
    [{ code: 'hidden', at: 10, awayMs: 86400000 }]);
  assert.equal(sanitizeViolations(Array.from({ length: 500 }, (_, i) => ({ code: 'hidden', at: i }))).length, 200);
  assert.deepEqual(sanitizeViolations({ code: 'hidden' }), []);
});
test('recorded violations only grow: a later request cannot erase, shorten or rewrite them', () => {
  const stored = [{ code: 'hidden', at: 1, awayMs: 45000 }, { code: 'focus', at: 2, awayMs: null }];
  assert.deepEqual(mergeViolations(stored, []), stored);
  assert.deepEqual(mergeViolations(stored, [{ code: 'hidden', at: 1, awayMs: 1 }]), stored);
  assert.deepEqual(mergeViolations(stored, [{ code: 'screens', at: 1, awayMs: 1 }, { code: 'hidden', at: 2, awayMs: 5000 }, { code: 'hidden', at: 3 }]),
    [{ code: 'hidden', at: 1, awayMs: 45000 }, { code: 'hidden', at: 2, awayMs: 5000 }, { code: 'hidden', at: 3, awayMs: null }]);
  assert.deepEqual(mergeViolations(undefined, [{ code: 'hidden', at: 7, awayMs: 3000 }]), [{ code: 'hidden', at: 7, awayMs: 3000 }]);
});
