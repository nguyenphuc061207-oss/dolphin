import { readFile } from 'node:fs/promises';
import { before, after, test } from 'node:test';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, collection, getDoc, getDocs, query, where, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';

let env;
const submission = { studentId: 'student-a', examId: 'exam-a', answers: { 0: 1 }, score: 10, submittedAt: new Date(0) };
const dbFor = uid => uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore();
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-dolphin-access',
    firestore: { rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8') },
  });
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'exams', 'exam-a'), { teacherId: 'teacher-a', reviewSettings: { mode: 'never' } });
    await setDoc(doc(db, 'exams', 'exam-b'), { teacherId: 'teacher-b' });
    await setDoc(doc(db, 'submissions', 'submission-a'), submission);
    await setDoc(doc(db, 'submissions', 'submission-b'), { ...submission, studentId: 'student-b' });
    await setDoc(doc(db, 'submissions', 'legacy'), { examId: 'exam-a', studentName: 'Legacy' });
  });
});
after(async () => { await env?.cleanup(); });

test('copied review links: only the student and exam owner can read the document', async () => {
  for (const uid of ['student-a', 'teacher-a']) await assertSucceeds(getDoc(doc(dbFor(uid), 'submissions', 'submission-a')));
  for (const uid of ['student-b', 'teacher-b', null]) await assertFails(getDoc(doc(dbFor(uid), 'submissions', 'submission-a')));
  // Untrusted profile claims/roles cannot grant access.
  await assertFails(getDoc(doc(env.authenticatedContext('teacher-b', { role: 'teacher' }).firestore(), 'submissions', 'submission-a')));
});

test('student history and teacher statistics remain queryable; global/foreign lists do not', async () => {
  const student = dbFor('student-a');
  const teacher = dbFor('teacher-a');
  await assertSucceeds(getDocs(query(collection(student, 'submissions'), where('studentId', '==', 'student-a'))));
  await assertSucceeds(getDocs(query(collection(student, 'submissions'), where('studentId', '==', 'student-a'), where('examId', '==', 'exam-a'))));
  await assertSucceeds(getDocs(query(collection(teacher, 'submissions'), where('examId', '==', 'exam-a'))));
  await assertFails(getDocs(query(collection(dbFor('teacher-b'), 'submissions'), where('examId', '==', 'exam-a'))));
  await assertFails(getDocs(collection(student, 'submissions')));
  await assertFails(getDocs(collection(teacher, 'submissions')));
  await assertFails(getDocs(query(collection(student, 'submissions'), where('studentId', '==', 'student-b'))));
});

test('legacy submissions without student ID remain private but accessible to their teacher', async () => {
  await assertSucceeds(getDoc(doc(dbFor('teacher-a'), 'submissions', 'legacy')));
  await assertFails(getDoc(doc(dbFor('student-a'), 'submissions', 'legacy')));
});

test('exam ownership cannot be forged, transferred or overwritten by another user', async () => {
  await assertFails(setDoc(doc(dbFor('teacher-b'), 'exams', 'forged'), { teacherId: 'teacher-a' }));
  await assertFails(updateDoc(doc(dbFor('teacher-b'), 'exams', 'exam-a'), { teacherId: 'teacher-b' }));
  await assertFails(updateDoc(doc(dbFor('teacher-a'), 'exams', 'exam-a'), { teacherId: 'teacher-b' }));
  await assertFails(deleteDoc(doc(dbFor('student-a'), 'exams', 'exam-a')));
  await assertSucceeds(updateDoc(doc(dbFor('teacher-a'), 'exams', 'exam-a'), { title: 'Updated title' }));
});

test('students submit only as themselves; retry and hide-history still work', async () => {
  const student = dbFor('student-a');
  const ref = doc(student, 'submissions', 'new');
  await assertSucceeds(setDoc(ref, submission));
  await assertSucceeds(setDoc(ref, { ...submission, submittedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(ref, { deletedByStudent: true }));
  await assertFails(setDoc(doc(student, 'submissions', 'forged'), { ...submission, studentId: 'student-b' }));
  await assertFails(setDoc(doc(student, 'submissions', 'missing-exam'), { ...submission, examId: 'missing' }));
  await assertFails(setDoc(doc(dbFor(null), 'submissions', 'anonymous'), submission));
  await assertFails(updateDoc(ref, { score: 0 }));
  await assertFails(updateDoc(ref, { examId: 'exam-b' }));
  await assertFails(updateDoc(ref, { studentId: 'student-b' }));
  await assertFails(deleteDoc(ref));
});

test('only the responsible teacher may grade/delete and cannot transfer a submission', async () => {
  const ownerRef = doc(dbFor('teacher-a'), 'submissions', 'submission-a');
  const otherRef = doc(dbFor('teacher-b'), 'submissions', 'submission-a');
  await assertFails(updateDoc(otherRef, { score: 2 }));
  await assertFails(deleteDoc(otherRef));
  await assertFails(updateDoc(ownerRef, { studentId: 'student-b' }));
  await assertFails(updateDoc(ownerRef, { examId: 'exam-b' }));
  await assertSucceeds(updateDoc(ownerRef, { score: 9 }));
  await assertSucceeds(deleteDoc(doc(dbFor('teacher-a'), 'submissions', 'new')));
});

test('no wildcard fallback grants access to exam/submission subcollections', async () => {
  await assertFails(setDoc(doc(dbFor('student-b'), 'submissions/submission-a/private/copy'), { answers: [] }));
  await assertFails(setDoc(doc(dbFor('student-b'), 'exams/exam-a/private/copy'), { teacherId: 'student-b' }));
});
