import assert from 'node:assert/strict';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createExamService } from '../examService.js';
import { inspectMigration, migrateData } from '../migration.js';

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Emulator required; refuses production.');
initializeApp({ projectId: 'demo-dolphin-access' });
const db = getFirestore();
let time = Date.now();
const service = createExamService(db, () => time);
const teacher = 'api-teacher', student = 'api-student', stranger = 'api-stranger';
for (const uid of [teacher, student, stranger]) await db.collection('users').doc(uid).set({ uid, displayName: uid, shortId: uid });
const examInput = { title: 'Private exam', duration: 1, attemptLimit: 1, reviewSettings: { mode: 'never' },
  accessType: 'public', password: 'top-secret', mathDictionary: { unused: 'PRIVATE-FORMULA' },
  questions: [{ type: 'single', content: 'Q', options: ['A', 'B'], correctAnswer: 1, explanation: 'SECRET-EXPLANATION' }] };
const { examId } = await service.publishExam(teacher, examInput);
const metadata = (await db.collection('exams').doc(examId).get()).data();
for (const word of ['correctAnswer', 'explanation', 'top-secret', 'PRIVATE-FORMULA']) assert.equal(JSON.stringify(metadata).includes(word), false);
const info = await service.getExamInfo(student, { examId });
assert.equal(info.hasPassword, true); assert.equal(info.questions, undefined);
await assert.rejects(service.startAttempt(student, { examId, password: 'bad' }), { code: 'permission-denied' });
const [a, b] = await Promise.all([service.startAttempt(student, { examId, password: 'top-secret' }), service.startAttempt(student, { examId, password: 'top-secret' })]);
assert.equal(a.attemptId, b.attemptId);
assert.equal(a.exam.questions[0].correctAnswer, undefined);
assert.equal(a.exam.questions[0].explanation, undefined);
assert.deepEqual(a.exam.mathDictionary, {});
const resumed = await service.startAttempt(student, { examId, deadline: time + 9999999, studentId: stranger });
assert.equal(resumed.deadline, a.deadline);
await assert.rejects(service.saveAnswers(stranger, { attemptId: a.attemptId, revision: 1, answers: { 0: 1 } }), { code: 'permission-denied' });
await service.saveAnswers(student, { attemptId: a.attemptId, revision: 2, answers: { 0: 0 } });
await service.saveAnswers(student, { attemptId: a.attemptId, revision: 1, answers: { 0: 1 } });
assert.deepEqual((await service.getExamInfo(student, { examId })).activeAttempt.userAnswers, { 0: 0 });
time = a.deadline + 1;
await assert.rejects(service.saveAnswers(student, { attemptId: a.attemptId, revision: 3, answers: { 0: 1 } }), { code: 'failed-precondition' });
const result = await service.submitAttempt(student, { attemptId: a.attemptId, answers: { 0: 1 }, score: 10, deadline: time + 999999, studentId: stranger });
assert.equal(result.score, 0); assert.equal(result.expired, true);
assert.deepEqual(await service.submitAttempt(student, { attemptId: a.attemptId, answers: { 0: 1 } }), result);
await assert.rejects(service.submitAttempt(stranger, { attemptId: a.attemptId, answers: {} }), { code: 'permission-denied' });
await assert.rejects(service.startAttempt(student, { examId, password: 'top-secret' }), { code: 'resource-exhausted' });
assert.equal((await service.getReview(student, { submissionId: a.attemptId })).locked, true);
assert.equal(JSON.stringify(await service.getReview(student, { submissionId: a.attemptId })).includes('correctAnswer'), false);
await assert.rejects(service.getReview(stranger, { submissionId: a.attemptId }), { code: 'permission-denied' });
assert.equal((await service.getReview(teacher, { submissionId: a.attemptId })).submission.examSnapshot[0].correctAnswer, 1);
await db.collection('exams').doc(examId).update({ reviewSettings: { mode: 'after_time', time: new Date(time + 1000).toISOString() } });
assert.equal((await service.getReview(student, { submissionId: a.attemptId })).locked, true);
time += 1000;
assert.equal((await service.getReview(student, { submissionId: a.attemptId })).submission.examSnapshot[0].correctAnswer, 1);
await assert.rejects(service.updateExamSettings(stranger, { examId, settings: { accessType: 'public' } }), { code: 'permission-denied' });
await service.updateExamSettings(teacher, { examId, settings: { accessType: 'restricted', allowedUsers: [{ uid: student, name: student, shortId: student }] } });
await assert.rejects(service.startAttempt(stranger, { examId, password: 'top-secret', studentName: student }), { code: 'permission-denied' });
await assert.rejects(service.deleteExam(stranger, { examId }), { code: 'permission-denied' });
await service.deleteExam(teacher, { examId });
await assert.rejects(service.getExamInfo(student, { examId }), { code: 'not-found' });
assert.equal((await service.getReview(teacher, { submissionId: a.attemptId })).locked, false);

// Time ran out while the student was away: the server submits the answers it saved.
const { examId: awayExam } = await service.publishExam(teacher, { ...examInput, password: '', attemptLimit: 2 });
const away = await service.startAttempt(student, { examId: awayExam });
await service.saveAnswers(student, { attemptId: away.attemptId, revision: 1, answers: { 0: 1 } });
assert.deepEqual((await service.finishExpiredAttempts(student, {})).closed, []);
time = away.deadline + 1;
assert.deepEqual((await service.finishExpiredAttempts(student, {})).closed, [{ attemptId: away.attemptId, examId: awayExam, score: 10 }]);
assert.equal((await db.collection('submissions').doc(away.attemptId).get()).data().autoSubmitted, true);
assert.equal((await service.submitAttempt(student, { attemptId: away.attemptId, answers: { 0: 0 } })).score, 10);
const awayAgain = await service.startAttempt(student, { examId: awayExam });
time = awayAgain.deadline + 1;
const reopened = await service.getExamInfo(student, { examId: awayExam });
assert.equal(reopened.activeAttempt, null);
assert.equal(reopened.autoSubmitted.submissionId, awayAgain.attemptId);
const { examId: teacherExam } = await service.publishExam(teacher, { ...examInput, password: '' });
const unattended = await service.startAttempt(student, { examId: teacherExam });
time = unattended.deadline + 1;
await assert.rejects(service.finishExpiredAttempts(stranger, { examId: teacherExam }), { code: 'permission-denied' });
assert.deepEqual((await service.finishExpiredAttempts(teacher, { examId: teacherExam })).closed.map(c => c.attemptId), [unattended.attemptId]);

// Idempotent migration keeps historical points, hidden histories and keys private.
await db.collection('exams').doc('migration-exam').set({ ...examInput, teacherId: teacher });
await db.collection('submissions').doc('migration-submission').set({ examId: 'migration-exam', studentId: student, score: 7, correctCount: 1, deletedByStudent: true,
  examSnapshot: examInput.questions, answers: { 0: 1 }, submittedAt: new Date(1000) });
const plan = await inspectMigration(db);
assert.deepEqual(plan.issues, []);
await assert.rejects(service.getReview(student,{submissionId:'migration-submission'}),{code:'failed-precondition'});
assert.equal((await db.collection('exams').doc('migration-exam').get()).data().schemaVersion, undefined);
await migrateData(db, plan);
await migrateData(db, await inspectMigration(db));
const migrated = (await db.collection('submissions').doc('migration-submission').get()).data();
assert.equal(migrated.score, 7); assert.equal(migrated.deletedByStudent, true);
assert.equal(migrated.examSnapshot, undefined);
assert.equal((await service.getReview(teacher, { submissionId: 'migration-submission' })).submission.examSnapshot[0].correctAnswer, 1);
await db.collection('securityConfig').doc('exams').set({maintenance:true});
await assert.rejects(service.checkMaintenance(),{code:'unavailable'});
await db.collection('securityConfig').doc('exams').set({maintenance:false});
await service.checkMaintenance();
await db.collection('submissions').doc('migration-orphan').set({ examId: 'missing-exam', examSnapshot: examInput.questions, studentId: student });
assert.ok((await inspectMigration(db)).issues.some(issue => issue.id === 'migration-orphan'));

// Endpoint-level auth smoke test, in addition to the real database service tests.
const functionsHost = process.env.FUNCTIONS_EMULATOR_HOST || (process.env.FIREBASE_AUTH_EMULATOR_HOST ? '127.0.0.1:5001' : null);
if (functionsHost) {
  const response = await fetch(`http://${functionsHost}/demo-dolphin-access/asia-southeast1/getExamInfo`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data: { examId } }),
  });
  assert.equal(response.status, 401);
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    const authResponse = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-key`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }),
    });
    const auth = await authResponse.json();
    assert.ok(auth.idToken);
    await db.collection('users').doc(auth.localId).set({ uid: auth.localId, displayName: 'HTTP student', shortId: '4321' });
    const { examId: httpExam } = await service.publishExam(teacher, { ...examInput, password: '', reviewSettings: { mode: 'always' } });
    const http = async (method, data) => {
      const response = await fetch(`http://${functionsHost}/demo-dolphin-access/asia-southeast1/${method}`, {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${auth.idToken}` }, body: JSON.stringify({ data }),
      });
      assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
      return (await response.json()).result;
    };
    const session = await http('startAttempt', { examId: httpExam });
    assert.equal(JSON.stringify(session).includes('correctAnswer'), false);
    await http('saveAnswers', { attemptId: session.attemptId, revision: 1, answers: { 0: 1 } });
    const score = await http('submitAttempt', { attemptId: session.attemptId, answers: { 0: 1 }, score: 0 });
    assert.equal(score.score, 10);
    const review = await http('getReview', { submissionId: session.attemptId });
    assert.equal(review.submission.examSnapshot[0].correctAnswer, 1);
    console.log('PASS: HTTP callable authentication, sanitized start, autosave, server score and authorized review');
  }
}
console.log('PASS: private responses, concurrent starts, deadlines, immutable scores, retries, review release, roster, archive, dry-run/idempotent migration, authentication');
await db.terminate();
