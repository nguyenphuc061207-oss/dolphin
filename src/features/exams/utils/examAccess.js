// UI checks complement firestore.rules; Firestore remains the authority.
export function ownsExam(userId, exam) {
  return typeof userId === 'string' && userId.length > 0 && exam?.teacherId === userId;
}

export function canReviewSubmission(userId, submission, exam) {
  return typeof userId === 'string' && userId.length > 0 && !!exam && !!submission &&
    (submission.studentId === userId || ownsExam(userId, exam));
}

export function accessErrorMessage(error, fallback) {
  return ['permission-denied', 'functions/permission-denied'].includes(error?.code)
    ? 'Bạn không có quyền xem bài làm này.'
    : error?.message || fallback;
}
