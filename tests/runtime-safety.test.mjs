import test from 'node:test';
import assert from 'node:assert/strict';
import { withTimeout, storageOperation, timestampDate, timestampMillis, mapConcurrent } from '../src/shared/utils/runtimeSafety.js';
import { gradeExam, restoreProgress, validateQuestions } from '../src/features/exams/utils/examSafety.js';

const q = { content: '2 + 2 = ?', options: ['3', '4'], correctAnswer: 1, type: 'single' };
test('storage quota/security errors are returned instead of crashing', () => {
  for (const operation of ['getItem', 'setItem', 'removeItem']) {
    const storage = { [operation]() { throw new Error('storage unavailable'); } };
    assert.equal(storageOperation(operation, 'attempt', 'data', storage).ok, false);
  }
});
test('expired saved attempts do not regain a full exam duration', () => {
  const raw = JSON.stringify({ examSnapshot: [q], userAnswers: { 0: 1 }, deadline: 1000 });
  const restored = restoreProgress(raw, 600, 2000);
  assert.equal(restored.timeLeft, 0);
  assert.equal(restored.deadline, 1000);
  assert.equal(restoreProgress(JSON.stringify({ examSnapshot: [q], userAnswers: {}, timeLeft: 0 }), 600, 2000).timeLeft, 0);
});
test('recovery preserves shuffled question and answer pairing', () => {
  const questions = [{ ...q, content: 'second', options: ['4', '3'], correctAnswer: 0 }, q];
  const restored = restoreProgress(JSON.stringify({ examSnapshot: questions, userAnswers: { 0: 0, 1: 1 }, deadline: 9000 }), 600, 2000);
  assert.deepEqual(restored.examSnapshot, questions);
  assert.equal(gradeExam(restored.examSnapshot, restored.userAnswers).score, 10);
});
test('malformed snapshots and missing answers are detected before rendering/grading', () => {
  for (const questions of [null, {}, [], [null], [{ ...q, options: [] }], [{ ...q, correctAnswer: null }]]) assert.throws(() => validateQuestions(questions));
  assert.throws(() => restoreProgress('{bad json', 600));
  assert.throws(() => restoreProgress(JSON.stringify({ examSnapshot: [q] }), 600));
});
test('unanswered and numeric string answers grade correctly', () => {
  assert.equal(gradeExam([{ ...q, correctAnswer: 0 }], { 0: '' }).score, 0);
  assert.equal(gradeExam([q], { 0: '1' }).score, 10);
  assert.equal(gradeExam([q], {}).score, 0);
  assert.equal(gradeExam([{ content: 'essay', type: 'essay' }], {}).score, 0);
});
test('partial true/false scores stay finite and multiple-choice answers use sets', () => {
  const multiTF = { ...q, type: 'multi_true_false', correctAnswer: [true, false] };
  assert.equal(gradeExam([multiTF], { 0: [true, true] }).score, 5);
  assert.equal(gradeExam([{ ...multiTF, scoringMethod: 'gdpt_2018' }], { 0: [true, true] }).score, 2.5);
  assert.equal(gradeExam([{ ...q, type: 'multiple', correctAnswer: [0, 1] }], { 0: ['1', 0] }).score, 10);
});
test('legacy timestamps, null and invalid values never throw', () => {
  const time = new Date('2026-10-07T00:00:00Z');
  for (const value of [time, time.toISOString(), { seconds: time.getTime() / 1000 }, { toDate: () => time }, { toMillis: () => time.getTime() }]) assert.equal(timestampMillis(value), time.getTime());
  for (const value of [null, '', 'invalid', {}, { toDate: () => { throw new Error(); } }]) assert.equal(timestampDate(value), null);
});
test('network deadline rejects stalled requests and forwards failures', async () => {
  await assert.rejects(withTimeout(new Promise(() => {}), 5), /quá thời gian/);
  await assert.rejects(withTimeout(Promise.reject(new Error('denied')), 50), /denied/);
  assert.equal(await withTimeout(Promise.resolve('ok'), 50), 'ok');
});
test('uploads are bounded and keep original ordering', async () => {
  let running = 0, maximum = 0;
  const result = await mapConcurrent([1, 2, 3, 4, 5], async item => {
    running++; maximum = Math.max(maximum, running);
    await new Promise(resolve => setTimeout(resolve, 3)); running--;
    return item * 2;
  }, 2);
  assert.equal(maximum, 2);
  assert.deepEqual(result, [2, 4, 6, 8, 10]);
  assert.deepEqual(await mapConcurrent([], () => { throw new Error(); }), []);
});
