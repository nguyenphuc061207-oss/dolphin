// End-to-end check of the Vercel exam API against the Firestore + Auth emulators.
// Run: firebase emulators:exec --project demo-dolphin-access --only firestore,auth "node tests/vercel-api.emulator.mjs"
import assert from 'node:assert/strict';

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('Emulators required; refuses production.');
process.env.APP_CHECK_REQUIRED = 'false';
process.env.GCLOUD_PROJECT = 'demo-dolphin-access';

const { default: route } = await import('../api/exam/[method].js');
const { getFirestore } = await import('firebase-admin/firestore');

async function signUp(email) {
  const res = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'secret123', returnSecureToken: true }),
  });
  const body = await res.json();
  return { uid: body.localId, token: body.idToken };
}

async function call(name, input, token) {
  let out;
  const res = { setHeader() {}, status(s) { out = { status: s }; return this; }, json(b) { out.body = b; } };
  await route({ method: 'POST', query: { method: name }, headers: token ? { authorization: `Bearer ${token}` } : {}, body: input }, res);
  return out;
}

// The route initializes the Admin app on its first request, so these run before getFirestore().
assert.equal((await call('getExamInfo', { examId: 'x' })).status, 401, 'no token is rejected');
assert.equal((await call('getExamInfo', { examId: 'x' }, 'forged')).status, 401, 'forged token is rejected');

const teacher = await signUp('teacher@example.com');
const student = await signUp('student@example.com');
const db = getFirestore();
for (const u of [teacher, student]) await db.collection('users').doc(u.uid).set({ uid: u.uid, displayName: u.uid === teacher.uid ? 'Giáo viên' : 'Học sinh', shortId: u.uid.slice(0, 6) });

const published = await call('publishExam', {
  title: 'Đề thử', duration: 10, attemptLimit: 1, accessType: 'public', reviewSettings: { mode: 'never' },
  securityLevel: 'strict', isAntiCheat: true, allowMobile: true,
  questions: [{ type: 'single', content: 'Q1', options: ['A', 'B'], correctAnswer: 1 }],
}, teacher.token);
assert.equal(published.status, 200, JSON.stringify(published.body));
const { examId } = published.body;
const stored = (await db.collection('exams').doc(examId).get()).data();
assert.equal(stored.allowMobile, true);
assert.equal(JSON.stringify(stored).includes('correctAnswer'), false, 'answer key is not in the public exam document');

const info = await call('getExamInfo', { examId }, student.token);
assert.equal(info.status, 200);
assert.equal(info.body.allowMobile, true);

const attempt = await call('startAttempt', { examId, studentName: 'Học sinh' }, student.token);
assert.equal(attempt.status, 200, JSON.stringify(attempt.body));
assert.equal(JSON.stringify(attempt.body).includes('correctAnswer'), false, 'student never receives the answer key');

const violations = [{ code: 'hidden', at: Date.now() - 50000, awayMs: 45000 }];
const saved = await call('saveAnswers', { attemptId: attempt.body.attemptId, answers: { 0: 1 }, revision: 1, page: 0, maxPage: 0, cheatCount: 1, violations }, student.token);
assert.equal(saved.status, 200, JSON.stringify(saved.body));

const stranger = await call('submitAttempt', { attemptId: attempt.body.attemptId, answers: { 0: 1 } }, teacher.token);
assert.equal(stranger.status, 403, 'another account cannot submit this attempt');

const result = await call('submitAttempt', { attemptId: attempt.body.attemptId, answers: { 0: 1 }, cheatCount: 1, violations: [] }, student.token);
assert.equal(result.status, 200, JSON.stringify(result.body));
assert.equal(result.body.score, 10);
const submission = (await db.collection('submissions').doc(result.body.submissionId).get()).data();
assert.deepEqual(submission.violations, violations, 'an empty list at submit cannot erase recorded violations');
assert.equal(submission.cheatCount, 1);

const studentReview = await call('getReview', { submissionId: result.body.submissionId }, student.token);
assert.equal(studentReview.status, 200, JSON.stringify(studentReview.body));
assert.equal(studentReview.body.locked, true, 'review mode "never" keeps the key from the student');
assert.equal(JSON.stringify(studentReview.body).includes('correctAnswer'), false);
const teacherReview = await call('getReview', { submissionId: result.body.submissionId }, teacher.token);
assert.equal(teacherReview.body.submission.examSnapshot[0].correctAnswer, 1, 'the exam owner still reviews with the key');

const expired = await call('saveAnswers', { attemptId: attempt.body.attemptId, answers: { 0: 0 }, revision: 2 }, student.token);
assert.equal(expired.status, 400);
assert.equal(expired.body.error.code, 'failed-precondition', 'pages rely on this code after submit');

console.log('Vercel exam API: all emulator checks passed');
process.exit(0);
