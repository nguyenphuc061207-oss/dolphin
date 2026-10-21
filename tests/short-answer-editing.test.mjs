import test from 'node:test';
import assert from 'node:assert/strict';
import { convertQuestionType, getQuestionIssues, normalizeShortAnswer, describeShortAnswer, formatShortAnswer } from '../src/features/exams/utils/questionEditing.js';
import { validateQuestions } from '../src/features/exams/utils/examSafety.js';

const disk = {
  type: 'short_answer', content: 'Dung lượng đĩa?', answerKind: 'number', acceptedAnswers: [' 4096 ', ''],
  units: [' KB', 'MB '], correctUnit: 0, unitFactors: [1, 1024], tolerance: 0, caseSensitive: true,
};

test('saving a short answer trims answers and units and drops settings that do not apply', () => {
  const saved = normalizeShortAnswer(disk);
  assert.deepEqual(saved, { type: 'short_answer', content: disk.content, answerKind: 'number', acceptedAnswers: ['4096'], units: ['KB', 'MB'], correctUnit: 0, unitFactors: [1, 1024], options: [] });
  assert.doesNotThrow(() => validateQuestions([saved]));
  const text = normalizeShortAnswer({ ...disk, answerKind: 'text', units: [] });
  for (const key of ['tolerance', 'unitFactors', 'units', 'correctUnit']) assert.equal(key in text, false, key);
  assert.equal(text.caseSensitive, true);
  const single = { type: 'single', content: 'x', options: ['a', 'b'], correctAnswer: 1 };
  assert.equal(normalizeShortAnswer(single), single);
});

test('teachers are told what is missing before a short answer can be added', () => {
  assert.deepEqual(getQuestionIssues(normalizeShortAnswer(disk)), []);
  assert.deepEqual(getQuestionIssues({ ...disk, acceptedAnswers: ['  '] }), ['Chưa nhập đáp án đúng']);
  assert.deepEqual(getQuestionIssues({ ...disk, acceptedAnswers: ['bốn'] }), ['Đáp án phải là số']);
  assert.deepEqual(getQuestionIssues({ ...disk, units: ['KB', ''] }), ['Có đơn vị chưa đặt tên']);
  assert.deepEqual(getQuestionIssues({ ...disk, correctUnit: undefined }), ['Chưa chọn đơn vị đúng']);
  assert.deepEqual(getQuestionIssues({ ...disk, unitFactors: [1, undefined] }), ['Hệ số quy đổi phải là số dương']);
  assert.deepEqual(getQuestionIssues({ ...disk, content: '' }), ['Thiếu nội dung câu hỏi']);
});

test('key and student answers read naturally', () => {
  assert.equal(describeShortAnswer(normalizeShortAnswer(disk)), '4096 KB · chấp nhận quy đổi đơn vị');
  assert.equal(describeShortAnswer({ answerKind: 'number', acceptedAnswers: ['3.14'], tolerance: 1, toleranceMode: 'percent' }), '3.14 · ±1%');
  assert.equal(describeShortAnswer({ acceptedAnswers: ['Hà Nội', 'Ha Noi'] }), 'Hà Nội / Ha Noi');
  assert.equal(formatShortAnswer({ value: ' 4 ', unit: 1 }, ['KB', 'MB']), '4 MB');
  assert.equal(formatShortAnswer('Huế'), 'Huế');
  assert.equal(formatShortAnswer({ value: '  ', unit: 0 }, ['KB']), '');
  assert.equal(formatShortAnswer(undefined), '');
});

test('switching types keeps the old key text and leaves no stale fields behind', () => {
  const single = { type: 'single', content: 'Thủ đô?', options: ['Hà Nội', 'Huế'], correctAnswer: 0 };
  const short = convertQuestionType(single, 'short_answer');
  assert.deepEqual(short.acceptedAnswers, ['Hà Nội']);
  assert.equal('correctAnswer' in short, false);
  assert.deepEqual(short.options, []);
  const back = convertQuestionType({ ...short, units: ['m'], correctUnit: 0 }, 'single');
  for (const key of ['answerKind', 'acceptedAnswers', 'units', 'correctUnit']) assert.equal(key in back, false, key);
  assert.deepEqual(back.options, ['', '', '', '']);
});
