import test from 'node:test';
import assert from 'node:assert/strict';
import { ownsExam, canReviewSubmission, accessErrorMessage } from '../src/features/exams/utils/examAccess.js';

const exam = { teacherId: 'teacher-a' };
const submission = { studentId: 'student-a', examId: 'exam-a' };

test('review allows the student and responsible teacher, denies copied links to others', () => {
  assert.equal(canReviewSubmission('student-a', submission, exam), true);
  assert.equal(canReviewSubmission('teacher-a', submission, exam), true);
  for (const uid of ['student-b', 'teacher-b', '', undefined, null]) {
    assert.equal(canReviewSubmission(uid, submission, exam), false);
  }
});

test('missing identity or exam cannot authorize a review', () => {
  assert.equal(canReviewSubmission(undefined, {}, {}), false);
  assert.equal(canReviewSubmission('student-a', submission, null), false);
  assert.equal(canReviewSubmission('teacher-a', null, exam), false);
  assert.equal(ownsExam(undefined, {}), false);
  assert.equal(ownsExam('teacher-a', exam), true);
  assert.equal(ownsExam('teacher-b', exam), false);
});

test('server authorization errors give an actionable Vietnamese message', () => {
  assert.equal(accessErrorMessage({ code: 'permission-denied', message: 'Missing permissions' }, 'fallback'), 'Bạn không có quyền xem bài làm này.');
  assert.equal(accessErrorMessage({}, 'fallback'), 'fallback');
});
