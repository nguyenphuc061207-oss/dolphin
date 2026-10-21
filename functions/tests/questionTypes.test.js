import test from 'node:test';
import assert from 'node:assert/strict';
import { publicQuestions, attemptQuestions, gradeExam, validateQuestions, validateAnswers } from '../policy.js';
import { parseNumber, scoreQuestion } from '../questionTypes.js';
import { gradeExam as clientGrade, validateQuestions as clientValidate } from '../../src/features/exams/utils/examSafety.js';

const dropdown = {
  type: 'dropdown', content: 'Giá trị DL sau mỗi lệnh?',
  options: ['DL=10', 'DL=8', 'DL=55h', 'DL=0FFh'], choices: ['38h', '41h', '55h', '0FFh'], correctAnswer: [0, 1, 2, 3],
};
const capacity = {
  type: 'short_answer', content: 'Dung lượng đĩa?', answerKind: 'number', acceptedAnswers: ['4096'],
  units: ['KB', 'MB', 'GB'], correctUnit: 0, unitFactors: [1, 1024, 1048576], explanation: 'SECRET',
};
const capital = { type: 'short_answer', content: 'Thủ đô?', acceptedAnswers: ['Hà Nội', 'Ha Noi'] };

test('new types: students see rows, choices and units but never keys, tolerances or conversion factors', () => {
  const [d, c] = publicQuestions([dropdown, capacity]);
  assert.deepEqual(d, { type: 'dropdown', content: dropdown.content, options: dropdown.options, choices: dropdown.choices });
  assert.deepEqual(c, { type: 'short_answer', content: capacity.content, answerKind: 'number', units: ['KB', 'MB', 'GB'] });
  const text = JSON.stringify(publicQuestions([dropdown, capacity, capital]));
  for (const word of ['correctAnswer', 'acceptedAnswers', 'correctUnit', 'unitFactors', '4096', 'Hà Nội', 'SECRET']) assert.equal(text.includes(word), false);
  assert.doesNotThrow(() => clientValidate(publicQuestions([dropdown, capacity, capital]), false));
});

test('dropdown scores each row; "all" mode gives points only when every row is right', () => {
  assert.equal(scoreQuestion(dropdown, [0, 1, 2, 3]), 1);
  assert.equal(scoreQuestion(dropdown, [0, 1, null, 0]), 0.5);
  assert.equal(scoreQuestion(dropdown, undefined), 0);
  assert.equal(scoreQuestion({ ...dropdown, scoringMethod: 'all' }, [0, 1, 2, 0]), 0);
  assert.equal(scoreQuestion({ ...dropdown, scoringMethod: 'all' }, [0, 1, 2, 3]), 1);
});

test('numeric short answers accept either decimal mark, tolerance and converted units', () => {
  assert.equal(scoreQuestion(capacity, { value: '4096', unit: 0 }), 1);
  assert.equal(scoreQuestion(capacity, { value: '4', unit: 1 }), 1);
  assert.equal(scoreQuestion(capacity, { value: '0,00390625', unit: 2 }), 1);
  assert.equal(scoreQuestion(capacity, { value: '4096', unit: 1 }), 0);
  assert.equal(scoreQuestion(capacity, { value: '4096', unit: null }), 0, 'a unit is required when the question lists units');
  // Without conversion factors only the teacher's unit counts.
  const strict = { ...capacity, unitFactors: undefined };
  assert.equal(scoreQuestion(strict, { value: '4', unit: 1 }), 0);
  assert.equal(scoreQuestion(strict, { value: '4096', unit: 0 }), 1);
  const pi = { type: 'short_answer', content: 'π', answerKind: 'number', acceptedAnswers: ['3.14'], tolerance: 0.01 };
  assert.equal(scoreQuestion(pi, '3,15'), 1);
  assert.equal(scoreQuestion(pi, '3.16'), 0);
  assert.equal(scoreQuestion({ ...pi, tolerance: 1, toleranceMode: 'percent' }, { value: '3.17' }), 1);
  assert.equal(scoreQuestion({ ...pi, tolerance: 1, toleranceMode: 'percent' }, { value: '3.2' }), 0);
  assert.equal(scoreQuestion({ ...pi, acceptedAnswers: ['0.3'], tolerance: 0 }, String(0.1 + 0.2)), 1, 'float rounding is not a wrong answer');
  for (const junk of ['', ' ', 'abc', '0x10', 'Infinity', '1.2.3', '4,096,000']) assert.ok(Number.isNaN(parseNumber(junk)), junk);
  assert.equal(parseNumber(' 4 096 '), 4096);
  assert.equal(parseNumber('-1.5e3'), -1500);
});

test('text short answers ignore case and extra spaces unless the teacher asks for exact case', () => {
  assert.equal(scoreQuestion(capital, '  hà   NỘI '), 1);
  assert.equal(scoreQuestion(capital, { value: 'ha noi', unit: null }), 1);
  assert.equal(scoreQuestion(capital, 'Hà Nam'), 0);
  assert.equal(scoreQuestion(capital, null), 0);
  assert.equal(scoreQuestion({ ...capital, caseSensitive: true }, 'hà nội'), 0);
  // Decomposed Vietnamese (common from some keyboards) matches the precomposed key.
  assert.equal(scoreQuestion(capital, 'Hà Nội'), 1);
});

test('new types count toward the 10-point score on server and client alike', () => {
  const questions = [dropdown, capacity, capital, { type: 'essay', content: 'Viết' }];
  const answers = { 0: [0, 1, null, null], 1: { value: '4', unit: 1 }, 2: 'Huế', 3: 'Bài làm' };
  const expected = { score: 5, correct: 1.5, gradable: 3 };
  assert.deepEqual(gradeExam(questions, answers), expected);
  assert.deepEqual(clientGrade(questions, answers), expected);
});

test('shuffling dropdown rows and choices keeps every row paired with its right choice', () => {
  const pairs = q => q.options.map((row, i) => [row, q.choices[q.correctAnswer[i]]]).sort();
  for (const pick of [() => 0, i => i - 1, i => Math.floor(i / 2)]) {
    const [shuffled, short] = attemptQuestions({ shuffleOptions: true }, [dropdown, capacity], pick);
    assert.deepEqual(pairs(shuffled), pairs(dropdown));
    assert.deepEqual(short, capacity, 'short answers have nothing to shuffle');
  }
});

test('broken new-type questions are refused when an exam is published', () => {
  const bad = [
    { ...dropdown, choices: [] },
    { ...dropdown, correctAnswer: [0, 1, 2] },
    { ...dropdown, correctAnswer: [0, 1, 2, 4] },
    { ...dropdown, scoringMethod: 'gdpt_2018' },
    { ...capacity, acceptedAnswers: [] },
    { ...capacity, acceptedAnswers: ['bốn nghìn'] },
    { ...capacity, correctUnit: 3 },
    { ...capacity, unitFactors: [1, 0, 1024] },
    { ...capacity, unitFactors: [1, 1024] },
    { ...capacity, units: ['KB', ' '] },
    { ...capacity, tolerance: -1 },
    { ...capacity, toleranceMode: 'relative' },
    { ...capital, answerKind: 'date' },
    { ...capital, acceptedAnswers: ['  '] },
    { ...capital, caseSensitive: 'yes' },
  ];
  for (const q of bad) {
    assert.throws(() => validateQuestions([q]), undefined, JSON.stringify(q));
    assert.throws(() => clientValidate([q]), undefined, JSON.stringify(q));
  }
  assert.doesNotThrow(() => validateQuestions([dropdown, capacity, capital, { ...capacity, units: [], correctUnit: undefined }]));
});

test('student answers for new types must have the right shape', () => {
  const questions = [dropdown, capacity, capital];
  assert.doesNotThrow(() => validateAnswers(questions, { 0: [3, null], 1: { value: '4', unit: 2 }, 2: 'Hà Nội' }));
  assert.doesNotThrow(() => validateAnswers(questions, { 1: { value: '' }, 2: { value: 'x', unit: null } }));
  for (const answers of [
    { 0: [4] }, { 0: [0, 0, 0, 0, 0] }, { 0: ['0'] }, { 0: 1 },
    { 1: { value: '4', unit: 3 } }, { 1: { value: 4 } }, { 1: ['4'] }, { 1: { value: 'x'.repeat(501) } },
    { 2: { value: 'x', unit: 0 } },
  ]) assert.throws(() => validateAnswers(questions, answers), undefined, JSON.stringify(answers));
});
