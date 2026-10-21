import test from 'node:test';
import assert from 'node:assert/strict';
import { readExamProgress, listExamProgress, progressKey, removeExamProgress } from '../src/features/exams/utils/examProgress.js';

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

test('saved dropdown and short-answer questions keep what students see and drop any answer key', () => {
  const snapshot = [
    { type: 'dropdown', content: 'Q', options: ['DL=10'], choices: ['38h', '41h'], correctAnswer: [0] },
    { type: 'short_answer', content: 'Q', answerKind: 'number', units: ['KB', 'MB'], acceptedAnswers: ['4096'], correctUnit: 0, unitFactors: [1, 1024] },
  ];
  const store = storage([[progressKey('exam', 'student'), JSON.stringify({ ...draft, examSnapshot: snapshot })]]);
  assert.deepEqual(readExamProgress('exam', 'student', 300, store).examSnapshot, [
    { type: 'dropdown', content: 'Q', options: ['DL=10'], choices: ['38h', '41h'] },
    { type: 'short_answer', content: 'Q', answerKind: 'number', units: ['KB', 'MB'] },
  ]);
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

test('removing a draft forgets only that exam and account on this browser', () => {
  const store = storage([
    [progressKey('exam', 'student'), JSON.stringify(draft)], ['exam_violations_exam_student', '{}'],
    [progressKey('other', 'student'), JSON.stringify(draft)], [progressKey('exam', 'friend'), JSON.stringify(draft)],
  ]);
  const data = new Map([...Array(store.length).keys()].map(i => [store.key(i), store.getItem(store.key(i))]));
  const writable = { ...storage(data), get length() { return data.size; }, key: i => [...data.keys()][i], getItem: k => data.get(k) ?? null, removeItem: k => data.delete(k) };
  removeExamProgress('exam', 'student', writable);
  assert.deepEqual([...data.keys()].sort(), [progressKey('exam', 'friend'), progressKey('other', 'student')].sort());
  assert.deepEqual(listExamProgress('student', writable).map(d => d.examId), ['other']);
});
