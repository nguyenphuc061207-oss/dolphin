// UI checks complement firestore.rules; Firestore remains the authority.
export function ownsExam(userId, exam) {
  return typeof userId === 'string' && userId.length > 0 && exam?.teacherId === userId;
}

export function canReviewSubmission(userId, submission, exam) {
  return typeof userId === 'string' && userId.length > 0 && !!exam && !!submission &&
    (submission.studentId === userId || ownsExam(userId, exam));
}

export function accessErrorMessage(error, fallback) {
  return error?.code === 'permission-denied'
    ? 'Bạn không có quyền xem bài làm này.'
    : error?.message || fallback;
}
