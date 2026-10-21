import test from 'node:test';
import assert from 'node:assert/strict';
import { convertQuestionType, getQuestionIssues, normalizeQuestion, dropdownKey, EMPTY_DROPDOWN } from '../src/features/exams/utils/questionEditing.js';
import { validateQuestions } from '../src/features/exams/utils/examSafety.js';

const dl = {
  type: 'dropdown', content: 'Giá trị DL?', options: ['DL=10', 'DL=8', 'DL=55h', 'DL=0FFh'],
  choices: [' 38h', '41h ', '55h', '0FFh'], correctAnswer: [0, 1, 2, 3], scoringMethod: 'partial',
};

test('a finished dropdown has no issues, saves with trimmed choices and passes validation', () => {
  assert.deepEqual(getQuestionIssues(dl), []);
  const saved = normalizeQuestion(dl);
  assert.deepEqual(saved.choices, ['38h', '41h', '55h', '0FFh']);
  assert.equal(normalizeQuestion({ ...dl, scoringMethod: undefined }).scoringMethod, 'partial');
  assert.doesNotThrow(() => validateQuestions([saved]));
  assert.deepEqual(dropdownKey(saved), ['38h', '41h', '55h', '0FFh']);
});

test('teachers are told which rows and choices still need work', () => {
  assert.deepEqual(getQuestionIssues({ ...EMPTY_DROPDOWN, type: 'dropdown', content: 'Q' }),
    ['Dòng 1, 2 trống', 'Lựa chọn 1, 2 trống', 'Chưa chọn đáp án cho dòng 1, 2']);
  assert.deepEqual(getQuestionIssues({ ...dl, correctAnswer: [0, null, 2, 9] }), ['Chưa chọn đáp án cho dòng 2, 4']);
  assert.deepEqual(getQuestionIssues({ ...dl, choices: ['38h'], correctAnswer: [0, 0, 0, 0] }), ['Cần ít nhất 2 lựa chọn']);
  assert.deepEqual(getQuestionIssues({ ...dl, choices: ['38h', ' 38h', '55h', '0FFh'] }), ['Có lựa chọn bị trùng']);
  assert.deepEqual(getQuestionIssues({ ...dl, options: [], correctAnswer: [] }), ['Cần ít nhất 1 dòng']);
});

test('converting keeps what can be kept: statements become rows, choice options become the list', () => {
  const tf = { type: 'multi_true_false', content: 'TF', options: ['A', 'B'], correctAnswer: [true, false], scoringMethod: 'gdpt_2018' };
  assert.deepEqual(convertQuestionType(tf, 'dropdown'), { type: 'dropdown', content: 'TF', options: ['A', 'B'], choices: ['Đúng', 'Sai'], correctAnswer: [0, 1], scoringMethod: 'partial' });
  const single = { type: 'single', content: 'S', options: ['x', 'y', 'z'], correctAnswer: 2 };
  assert.deepEqual(convertQuestionType(single, 'dropdown'), { type: 'dropdown', content: 'S', options: [''], choices: ['x', 'y', 'z'], correctAnswer: [2], scoringMethod: 'partial' });
  const fromEssay = convertQuestionType({ type: 'essay', content: 'E' }, 'dropdown');
  assert.deepEqual(fromEssay.choices, ['', '']);
  assert.deepEqual(fromEssay.correctAnswer, [null, null]);
});

test('leaving a dropdown drops its choices and its scoring mode', () => {
  const single = convertQuestionType(dl, 'single');
  assert.equal('choices' in single, false);
  assert.equal('scoringMethod' in single, false);
  assert.deepEqual(single.options, dl.options);
  assert.equal(single.correctAnswer, 0);
  const tf = convertQuestionType(dl, 'multi_true_false');
  assert.deepEqual(tf.correctAnswer, [true, true, true, true]);
  assert.equal(convertQuestionType(dl, 'dropdown'), dl);
});
