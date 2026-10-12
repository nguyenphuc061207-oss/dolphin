import test from 'node:test';
import assert from 'node:assert/strict';
import { readExamProgress, listExamProgress, progressKey } from '../src/features/exams/utils/examProgress.js';

const examSnapshot = [{ type: 'essay', content: 'Saved question' }];
const draft = { examSnapshot, userAnswers: { 0: 'My answer' }, deadline: 1000, attemptId: 'same-attempt', page: 2, maxPage: 3, cheatCount: 2 };
function storage(entries) {
  const data = new Map(entries);
  return { get length() { return data.size; }, key: i => [...data.keys()][i], getItem: key => data.get(key) ?? null };
}

test('reopening preserves answers, order, position, attempt and violations without resetting expiry', () => {
  const store = storage([[progressKey('exam', 'student'), JSON.stringify(draft)]]);
  const saved = readExamProgress('exam', 'student', 300, store);
  for (const key of ['examSnapshot', 'userAnswers', 'deadline', 'attemptId', 'page', 'maxPage', 'cheatCount']) assert.deepEqual(saved[key], draft[key]);
  assert.equal(saved.timeLeft, 0);
});

test('dashboard isolates accounts, includes older drafts, and ignores damaged entries', () => {
  const store = storage([
    [progressKey('a', 'alice'), JSON.stringify(draft)],
    [progressKey('b', 'bob'), JSON.stringify(draft)],
    [progressKey('broken', 'alice'), 'broken json'],
    ['unrelated', 'value'],
  ]);
  assert.deepEqual(listExamProgress('alice', store).map(d => d.examId), ['a']);
  assert.deepEqual(listExamProgress('bob', store).map(d => d.examId), ['b']);
  assert.deepEqual(listExamProgress(null, store), []);
});

test('mismatched owner/exam cannot be restored and failed storage does not mean a fresh attempt', () => {
  const store = storage([[progressKey('a', 'alice'), JSON.stringify({ ...draft, studentId: 'bob' })]]);
  assert.throws(() => readExamProgress('a', 'alice', 300, store));
  assert.deepEqual(listExamProgress('alice', store), []);
  assert.throws(() => readExamProgress('a', 'alice', 300, { getItem() { throw new Error('blocked'); } }));
  assert.equal(readExamProgress('missing', 'alice', 300, store), null);
});
