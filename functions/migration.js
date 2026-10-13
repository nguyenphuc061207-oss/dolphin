import { createHash } from 'node:crypto';
import { pick, publicQuestions, passwordHash, validateQuestions } from './policy.js';

// Invoke only during a maintenance window. The CLI always saves a private backup
// and defaults to dry-run; no production writes occur without --apply.
export async function inspectMigration(db, ownerMap = {}, legacyOffset = '+07:00') {
  const [exams, submissions, users] = await Promise.all(['exams', 'submissions', 'users'].map(c => db.collection(c).get()));
  const owners = Object.fromEntries(exams.docs.map(d => [d.id, d.data().teacherId]));
  const profiles = users.docs.map(d => ({ uid: d.id, ...d.data() }));
  const issues = [];
  const roster = entries => entries.map(entry => {
    const matches = profiles.filter(u => entry.uid ? u.uid === entry.uid
      : u.shortId === entry.shortId && String(u.displayName || '').trim().toLowerCase() === String(entry.name || '').trim().toLowerCase());
    if (matches.length !== 1) throw new Error('Không xác định duy nhất học sinh ' + entry.name);
    return { ...pick(entry, ['name', 'shortId']), uid: matches[0].uid };
  });
  for (const d of exams.docs) {
    if (d.data().schemaVersion === 2) continue;
    try { validateQuestions(d.data().questions); roster(d.data().allowedUsers || []); }
    catch (e) { issues.push({ collection: 'exams', id: d.id, reason: e.message }); }
  }
  for (const d of submissions.docs) {
    if (d.data().schemaVersion === 2) continue;
    if (!(owners[d.data().examId] || ownerMap[d.data().examId])) issues.push({ collection: 'submissions', id: d.id, reason: 'Thiếu chủ sở hữu đề thi đã xóa; cần owner-map được xác minh.' });
    try { validateQuestions(d.data().examSnapshot); }
    catch (e) { issues.push({ collection: 'submissions', id: d.id, reason: e.message }); }
  }
  const normalizeTime = value => {
    if (typeof value !== 'string' || !value) return value;
    return /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?$/.test(value) ? new Date(value + legacyOffset).toISOString() : value;
  };
  return { exams, submissions, owners: { ...ownerMap, ...owners }, issues, roster, normalizeTime };
}

export async function migrateData(db, inspection) {
  if (inspection.issues.length) throw new Error('Dừng chuyển dữ liệu: cần giải quyết toàn bộ mục được báo lỗi.');
  for (const snapshot of inspection.exams.docs) {
    await db.runTransaction(async tx => {
      const latest = await tx.get(snapshot.ref), exam = latest.data();
      if (!exam || exam.schemaVersion === 2) return;
      tx.set(db.collection('examSecrets').doc(snapshot.id), {
        teacherId: exam.teacherId, questions: exam.questions, mathDictionary: exam.mathDictionary || {},
        passwordHash: passwordHash(exam.password), imageDeleteUrls: exam.imageDeleteUrls || [],
      });
      tx.set(snapshot.ref, { ...pick(exam, ['teacherId', 'teacherName', 'title', 'duration', 'startDate', 'endDate', 'securityLevel', 'isAntiCheat', 'allowMobile', 'shuffleQuestions', 'shuffleOptions', 'attemptLimit', 'examFlow', 'accessType', 'reviewSettings', 'createdAt']),
        startDate: inspection.normalizeTime(exam.startDate) || null, endDate: inspection.normalizeTime(exam.endDate) || null,
        reviewSettings: { ...(exam.reviewSettings || { mode: 'always' }), time: inspection.normalizeTime(exam.reviewSettings?.time) || null },
        questions: publicQuestions(exam.questions), questionCount: exam.questions.length, hasPassword: !!exam.password,
        allowedUsers: inspection.roster(exam.allowedUsers || []), archived: false, schemaVersion: 2 });
    });
  }
  for (const snapshot of inspection.submissions.docs) {
    await db.runTransaction(async tx => {
      const latest = await tx.get(snapshot.ref), sub = latest.data();
      if (!sub || sub.schemaVersion === 2) return;
      const teacherId = inspection.owners[sub.examId];
      const examRef = db.collection('exams').doc(sub.examId), exam = await tx.get(examRef);
      if (!exam.exists) tx.set(examRef, { teacherId, title: sub.examTitle || 'Đề đã gỡ', archived: true, schemaVersion: 2, reviewSettings: { mode: 'never' } });
      tx.set(db.collection('submissionSecrets').doc(snapshot.id), { teacherId, questions: sub.examSnapshot, answers: sub.answers || {}, mathDictionary: sub.mathDictionary || {} });
      tx.set(snapshot.ref, { ...pick(sub, ['examId', 'examTitle', 'studentId', 'studentName', 'shortId', 'score', 'correctCount', 'totalQuestions', 'cheatCount', 'securityLevel', 'submittedAt', 'attemptNumber', 'deletedByStudent']), teacherId, schemaVersion: 2 });
    });
  }
  // Include hidden histories. Existing active reservations are never reduced.
  const counts = new Map();
  for (const snapshot of inspection.submissions.docs) {
    const sub = snapshot.data();
    if (!sub.studentId || !sub.examId) continue;
    const key = createHash('sha256').update(JSON.stringify([sub.studentId, sub.examId])).digest('hex');
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  for (const [key, count] of counts) await db.runTransaction(async tx => {
    const r = db.collection('attemptStates').doc(key), old = (await tx.get(r)).data() || {};
    tx.set(r, { ...old, count: Math.max(old.count || 0, count) });
  });
}
