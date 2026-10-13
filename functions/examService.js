import { createHash } from 'node:crypto';
import { id, fail, pick, examInfo, publicQuestions, publicDictionary, passwordHash, validateQuestions, attemptQuestions, validateAnswers, gradeExam, millis, reviewAllowed, authorizeStart, mergeViolations } from './policy.js';

export function createExamService(db, now = Date.now) {
  const ref = (collection, key) => db.collection(collection).doc(id(key));
  const stateId = (uid, examId) => createHash('sha256').update(JSON.stringify([uid, examId])).digest('hex');
  const requireDoc = snapshot => { if (!snapshot.exists) fail('not-found', 'Không tìm thấy dữ liệu.'); return snapshot.data(); };
  const owner = (exam, uid) => { if (exam.teacherId !== uid) fail('permission-denied', 'Bạn không phụ trách đề thi này.'); };
  const publicAttempt = (attempt, attemptId) => ({
    attemptId, deadline: attempt.deadline, serverNow: now(), userAnswers: attempt.answers,
    cheatCount: attempt.cheatCount || 0, violations: attempt.violations || [], page: attempt.page || 0, maxPage: attempt.maxPage || 0,
    revision: attempt.revision || 0,
    studentName: attempt.studentName, attemptNumber: attempt.attemptNumber,
    exam: { ...attempt.exam, questions: publicQuestions(attempt.questions), mathDictionary: publicDictionary(attempt.questions, attempt.mathDictionary) },
  });
  /** Grade `answers` and record the submission; the attempt is closed in the same transaction. */
  const recordSubmission = (tx, r, attempt, { answers, violations, cheatCount, autoSubmitted = false }) => {
    const { score, correct, gradable } = gradeExam(attempt.questions, answers);
    const result = { submissionId: r.id, score, correctCount: correct, gradable, expired: now() > attempt.deadline, ...(autoSubmitted && { autoSubmitted }) };
    tx.set(ref('submissions', r.id), { schemaVersion: 2, examId: attempt.examId, teacherId: attempt.teacherId, examTitle: attempt.exam.title,
      studentId: attempt.studentId, studentName: attempt.studentName, shortId: attempt.shortId, attemptNumber: attempt.attemptNumber,
      score, correctCount: correct, totalQuestions: attempt.questions.length, cheatCount, violations,
      submittedAt: new Date(now()), securityLevel: attempt.exam.securityLevel || 'off', ...(autoSubmitted && { autoSubmitted }) });
    tx.set(ref('submissionSecrets', r.id), { teacherId: attempt.teacherId, questions: attempt.questions, answers, mathDictionary: attempt.mathDictionary });
    tx.update(r, { status: 'submitted', answers, result, violations, cheatCount });
    return result;
  };
  /** Time ran out and nobody submitted: submit the answers saved on the server. Null when still open or already submitted. */
  const closeIfExpired = attemptId => db.runTransaction(async tx => {
    const r = ref('attempts', attemptId), snap = await tx.get(r);
    const attempt = snap.exists ? snap.data() : null;
    if (attempt?.status !== 'active' || now() <= attempt.deadline) return null;
    const result = recordSubmission(tx, r, attempt, {
      answers: attempt.answers || {}, violations: attempt.violations || [], cheatCount: attempt.cheatCount || 0, autoSubmitted: true,
    });
    return { ...result, examId: attempt.examId };
  });
  const resolveRoster = async (entries = []) => {
    if (!Array.isArray(entries) || entries.length > 500) fail('invalid-argument', 'Danh sách học sinh không hợp lệ.');
    const result = [];
    for (const entry of entries) {
      const matches = entry.uid ? await ref('users', entry.uid).get()
        : await db.collection('users').where('shortId', '==', String(entry.shortId)).get();
      const users = entry.uid ? (matches.exists ? [matches] : []) : matches.docs;
      const filtered = users.filter(s => String(s.data().displayName || '').trim().toLowerCase() === String(entry.name || '').trim().toLowerCase());
      if (filtered.length !== 1) fail('failed-precondition', 'Không xác định được duy nhất học sinh ' + entry.name + '. Hãy kiểm tra mã và tên tài khoản.');
      result.push({ ...pick(entry, ['name', 'shortId']), uid: filtered[0].id });
    }
    return result;
  };
  return {
    async checkMaintenance() {
      const config = (await db.collection('securityConfig').doc('exams').get()).data();
      if (config?.maintenance) fail('unavailable', 'Bài thi đang được bảo trì. Vui lòng thử lại sau.');
    },
    async rateLimit(uid) {
      const key = createHash('sha256').update(uid).digest('hex');
      await db.runTransaction(async tx => {
        const r = ref('apiLimits', key), snapshot = await tx.get(r), old = snapshot.data();
        const time = now(), sameWindow = old && time - old.windowStart < 60000;
        if (sameWindow && old.count >= 120) fail('resource-exhausted', 'Bạn thao tác quá nhanh. Vui lòng thử lại sau một phút.');
        tx.set(r, { windowStart: sameWindow ? old.windowStart : time, count: sameWindow ? old.count + 1 : 1 });
      });
    },
    async publishExam(uid, input) {
      validateQuestions(input.questions);
      if (!String(input.title || '').trim() || !Number.isFinite(input.duration) || input.duration <= 0 || input.duration > 1440) fail('invalid-argument', 'Tên đề hoặc thời lượng không hợp lệ.');
      if (!Number.isInteger(input.attemptLimit) || input.attemptLimit < 0) fail('invalid-argument', 'Giới hạn lượt thi không hợp lệ.');
      for (const key of ['startDate', 'endDate']) if (input[key] && !Number.isFinite(millis(input[key]))) fail('invalid-argument', 'Ngày mở/đóng đề không hợp lệ.');
      if (millis(input.startDate) && millis(input.endDate) && millis(input.endDate) <= millis(input.startDate)) fail('invalid-argument', 'Ngày đóng phải sau ngày mở đề.');
      if (!['always', 'never', 'after_time'].includes(input.reviewSettings?.mode) || (input.reviewSettings.mode === 'after_time' && !millis(input.reviewSettings.time))) fail('invalid-argument', 'Thời điểm xem lại không hợp lệ.');
      const r = db.collection('exams').doc(), batch = db.batch();
      const metadata = pick(input, ['title', 'duration', 'startDate', 'endDate', 'securityLevel', 'isAntiCheat', 'allowMobile', 'shuffleQuestions', 'shuffleOptions', 'attemptLimit', 'examFlow', 'accessType', 'allowedUsers', 'reviewSettings']);
      metadata.allowedUsers = input.accessType === 'restricted' ? await resolveRoster(input.allowedUsers) : [];
      // The phone switch only exists under Cấp 2; any other level stores it as off.
      metadata.allowMobile = metadata.securityLevel === 'strict' && metadata.allowMobile === true;
      const profile = requireDoc(await ref('users', uid).get());
      batch.set(r, { ...metadata, teacherId: uid, teacherName: profile.displayName || 'Giáo viên', schemaVersion: 2,
        questionCount: input.questions.length, questions: publicQuestions(input.questions), hasPassword: !!input.password, createdAt: new Date(now()), archived: false });
      batch.set(ref('examSecrets', r.id), { teacherId: uid, questions: input.questions, mathDictionary: input.mathDictionary || {}, passwordHash: passwordHash(input.password), imageDeleteUrls: input.imageDeleteUrls || [] });
      await batch.commit();
      return { examId: r.id };
    },
    async getExamInfo(uid, { examId }) {
      const exam = requireDoc(await ref('exams', examId).get());
      if (exam.archived) fail('not-found', 'Đề thi đã được gỡ.');
      if (exam.schemaVersion !== 2) fail('failed-precondition', 'Đề thi đang được chuyển sang hệ thống bảo mật mới.');
      const state = (await ref('attemptStates', stateId(uid, examId)).get()).data();
      let activeAttempt = null, autoSubmitted = null;
      if (state?.activeId) {
        const closed = await closeIfExpired(state.activeId);
        if (closed) autoSubmitted = pick(closed, ['submissionId', 'score', 'correctCount', 'gradable']);
        const snap = closed ? null : await ref('attempts', state.activeId).get();
        if (snap?.exists && snap.data().status === 'active') activeAttempt = publicAttempt(snap.data(), snap.id);
      }
      return { ...examInfo(exam), submissionCount: state?.count || 0, activeAttempt, autoSubmitted };
    },
    async startAttempt(uid, input) {
      const examRef = ref('exams', input.examId), stateRef = ref('attemptStates', stateId(uid, input.examId));
      const newRef = db.collection('attempts').doc();
      return db.runTransaction(async tx => {
        const [examSnap, secretSnap, profileSnap, stateSnap] = await Promise.all([tx.get(examRef), tx.get(ref('examSecrets', input.examId)), tx.get(ref('users', uid)), tx.get(stateRef)]);
        const exam = requireDoc(examSnap), secrets = requireDoc(secretSnap), profile = requireDoc(profileSnap), state = stateSnap.data() || { count: 0 };
        if (exam.schemaVersion !== 2 || exam.archived) fail('failed-precondition', 'Đề thi chưa sẵn sàng.');
        if (state.activeId) {
          const existing = await tx.get(ref('attempts', state.activeId));
          if (existing.exists && existing.data().status === 'active') return publicAttempt(existing.data(), existing.id);
        }
        authorizeStart(exam, secrets, uid, input, now());
        if (exam.attemptLimit > 0 && state.count >= exam.attemptLimit) fail('resource-exhausted', 'Đã hết lượt làm bài.');
        validateQuestions(secrets.questions);
        const startedAt = now(), end = millis(exam.endDate);
        const attempt = { examId: input.examId, studentId: uid, teacherId: exam.teacherId, studentName: String(input.studentName || profile.displayName || '').trim().slice(0, 200),
          shortId: profile.shortId || 'N/A', status: 'active', startedAt, deadline: Math.min(startedAt + exam.duration * 60000, end || Infinity),
          attemptNumber: state.count + 1, exam: examInfo(exam), questions: attemptQuestions(exam, secrets.questions), mathDictionary: secrets.mathDictionary || {}, answers: {}, revision: 0 };
        tx.set(newRef, attempt);
        tx.set(stateRef, { count: state.count + 1, activeId: newRef.id });
        return publicAttempt(attempt, newRef.id);
      });
    },
    async saveAnswers(uid, input) {
      return db.runTransaction(async tx => {
        const r = ref('attempts', input.attemptId), attempt = requireDoc(await tx.get(r));
        if (attempt.studentId !== uid) fail('permission-denied', 'Lượt thi không thuộc tài khoản này.');
        if (attempt.status !== 'active' || now() > attempt.deadline) fail('failed-precondition', 'Lượt thi đã nộp hoặc hết giờ.');
        validateAnswers(attempt.questions, input.answers);
        if (!Number.isInteger(input.revision) || input.revision <= (attempt.revision || 0)) return { saved: false, revision: attempt.revision || 0 };
        const total = attempt.questions.length;
        const page = Math.max(0, Math.min(total - 1, Number(input.page) || 0));
        const violations = mergeViolations(attempt.violations, input.violations);
        tx.update(r, { answers: input.answers, revision: input.revision, savedAt: now(), page,
          maxPage: Math.max(page, attempt.maxPage || 0, Math.min(total - 1, Number(input.maxPage) || 0)),
          violations, cheatCount: Math.max(attempt.cheatCount || 0, Math.min(10000, Number(input.cheatCount) || 0), violations.length) });
        return { saved: true, revision: input.revision };
      });
    },
    async submitAttempt(uid, input) {
      return db.runTransaction(async tx => {
        const r = ref('attempts', input.attemptId), attempt = requireDoc(await tx.get(r));
        if (attempt.studentId !== uid) fail('permission-denied', 'Lượt thi không thuộc tài khoản này.');
        if (attempt.status === 'submitted') return attempt.result;
        // Once expired, only answers received by the server before the deadline count.
        const answers = now() <= attempt.deadline ? validateAnswers(attempt.questions, input.answers) : attempt.answers;
        // A leave just before submitting may not have reached saveAnswers yet.
        const violations = mergeViolations(attempt.violations, input.violations);
        const cheatCount = Math.max(attempt.cheatCount || 0, Math.min(10000, Number(input.cheatCount) || 0), violations.length);
        return recordSubmission(tx, r, attempt, { answers, violations, cheatCount });
      });
    },
    /**
     * Submit every attempt whose time ran out while nobody had the exam open, with the answers
     * the server saved. A student closes their own; a teacher those of one of their exams.
     */
    async finishExpiredAttempts(uid, { examId } = {}) {
      let attempts = db.collection('attempts').where('status', '==', 'active');
      if (examId) {
        owner(requireDoc(await ref('exams', examId).get()), uid);
        attempts = attempts.where('examId', '==', id(examId));
      } else attempts = attempts.where('studentId', '==', uid);
      const closed = [];
      for (const doc of (await attempts.limit(200).get()).docs) {
        if (!(doc.data().deadline < now())) continue;
        const result = await closeIfExpired(doc.id);
        if (result) closed.push({ attemptId: doc.id, examId: result.examId, score: result.score });
      }
      return { closed };
    },
    async getReview(uid, { submissionId }) {
      const sub = requireDoc(await ref('submissions', submissionId).get());
      if (sub.schemaVersion !== 2) fail('failed-precondition', 'Bài làm đang được chuyển sang hệ thống bảo mật mới.');
      if (sub.studentId !== uid && sub.teacherId !== uid) fail('permission-denied', 'Bạn không có quyền xem bài làm này.');
      const exam = requireDoc(await ref('exams', sub.examId).get());
      const summary = { ...pick(sub, ['schemaVersion', 'examId', 'teacherId', 'examTitle', 'studentId', 'studentName', 'shortId', 'attemptNumber', 'score', 'correctCount', 'totalQuestions', 'cheatCount', 'securityLevel']), submittedAt: millis(sub.submittedAt) };
      if (!reviewAllowed(exam, uid, now())) return { submission: summary, exam: examInfo(exam), locked: true };
      const secret = requireDoc(await ref('submissionSecrets', submissionId).get());
      return { submission: { ...summary, examSnapshot: secret.questions, answers: secret.answers, mathDictionary: secret.mathDictionary }, exam: examInfo(exam), locked: false };
    },
    async deleteExam(uid, { examId }) {
      await db.runTransaction(async tx => {
        const r = ref('exams', examId), exam = requireDoc(await tx.get(r)); owner(exam, uid);
        tx.update(r, { archived: true });
      });
      return { deleted: true };
    },
    async updateExamSettings(uid, { examId, settings }) {
      const examRef = ref('exams', examId);
      owner(requireDoc(await examRef.get()), uid);
      if (!['public', 'restricted'].includes(settings?.accessType)) fail('invalid-argument', 'Chế độ truy cập không hợp lệ.');
      const allowedUsers = settings.accessType === 'restricted' ? await resolveRoster(settings.allowedUsers) : [];
      await db.runTransaction(async tx => {
        owner(requireDoc(await tx.get(examRef)), uid);
        tx.update(examRef, { accessType: settings.accessType, allowedUsers });
      });
      return { updated: true };
    },
    async recalculateSubmission(uid, { submissionId, apply = false }) {
      const subRef = ref('submissions', submissionId);
      return db.runTransaction(async tx => {
        const sub = requireDoc(await tx.get(subRef));
        if (sub.teacherId !== uid) fail('permission-denied', 'Bạn không phụ trách bài làm này.');
        const secret = requireDoc(await tx.get(ref('submissionSecrets', submissionId)));
        const result = gradeExam(secret.questions, secret.answers);
        if (apply) tx.update(subRef, { score: result.score, correctCount: result.correct });
        return { score: result.score, correctCount: result.correct, hasMultiple: secret.questions.some(q => q.type === 'multiple') };
      });
    },
  };
}
