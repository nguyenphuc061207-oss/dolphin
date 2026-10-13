import { readFile } from 'node:fs/promises';
import { before, after, test } from 'node:test';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, collection, getDoc, getDocs, query, where, setDoc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
let env;
const dbFor = uid => uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore();
before(async () => {
 env = await initializeTestEnvironment({projectId:'demo-dolphin-access',firestore:{rules:await readFile(new URL('../firestore.rules',import.meta.url),'utf8')}});
 await env.withSecurityRulesDisabled(async context => {
  const db=context.firestore();
  await setDoc(doc(db,'exams','exam-a'),{teacherId:'teacher-a',duration:5,questions:[{correctAnswer:1}]});
  await setDoc(doc(db,'submissions','submission-a'),{schemaVersion:2,teacherId:'teacher-a',studentId:'student-a',examId:'exam-a',score:5});
  await setDoc(doc(db,'submissions','legacy'),{teacherId:'teacher-a',studentId:'student-a',examSnapshot:[{correctAnswer:1}]});
  for(const path of ['examSecrets/exam-a','submissionSecrets/submission-a','attempts/attempt-a','attemptStates/state-a','apiLimits/limit-a']) await setDoc(doc(db,path),{teacherId:'teacher-a',studentId:'student-a',correctAnswer:1});
 });
});
after(async()=>{await env?.cleanup();});
test('students cannot read exam documents or any secrets, including direct REST-compatible reads',async()=>{
 for(const uid of ['student-a','stranger',null]) await assertFails(getDoc(doc(dbFor(uid),'exams','exam-a')));
 await assertSucceeds(getDoc(doc(dbFor('teacher-a'),'exams','exam-a')));
 for(const uid of ['student-a','teacher-a']) for(const path of ['examSecrets/exam-a','submissionSecrets/submission-a','attempts/attempt-a','attemptStates/state-a','apiLimits/limit-a']) await assertFails(getDoc(doc(dbFor(uid),path)));
});
test('only safe summaries are readable by owners, with legacy answer-key documents blocked',async()=>{
 for(const uid of ['student-a','teacher-a']) await assertSucceeds(getDoc(doc(dbFor(uid),'submissions','submission-a')));
 for(const uid of ['student-b','teacher-b',null]) await assertFails(getDoc(doc(dbFor(uid),'submissions','submission-a')));
 for(const uid of ['student-a','teacher-a']) await assertFails(getDoc(doc(dbFor(uid),'submissions','legacy')));
});
test('filtered histories and teacher statistics work; unrestricted queries fail',async()=>{
 await assertSucceeds(getDocs(query(collection(dbFor('student-a'),'submissions'),where('studentId','==','student-a'),where('schemaVersion','==',2))));
 await assertSucceeds(getDocs(query(collection(dbFor('teacher-a'),'submissions'),where('teacherId','==','teacher-a'),where('schemaVersion','==',2))));
 await assertFails(getDocs(collection(dbFor('student-a'),'submissions')));
});
test('all score/submission creation and ownership/deadline writes are forbidden from the client',async()=>{
 const student=dbFor('student-a');
 await assertFails(setDoc(doc(student,'submissions','forged'),{schemaVersion:2,studentId:'student-a',score:10}));
 for(const change of [{score:10},{teacherId:'student-a'},{studentId:'other'},{examId:'other'}]) await assertFails(updateDoc(doc(student,'submissions','submission-a'),change));
 await assertSucceeds(updateDoc(doc(student,'submissions','submission-a'),{deletedByStudent:true}));
 await assertFails(updateDoc(doc(dbFor('teacher-a'),'submissions','submission-a'),{score:10}));
 await assertFails(deleteDoc(doc(student,'submissions','submission-a')));
});
test('exam creation/deletion/roster takeover goes through backend; responsible teachers may update settings',async()=>{
 await assertFails(setDoc(doc(dbFor('student-a'),'exams','forged'),{teacherId:'student-a'}));
 await assertFails(updateDoc(doc(dbFor('student-a'),'exams','exam-a'),{teacherId:'student-a'}));
 await assertFails(updateDoc(doc(dbFor('teacher-a'),'exams','exam-a'),{allowedUsers:[{uid:'other'}]}));
 await assertSucceeds(updateDoc(doc(dbFor('teacher-a'),'exams','exam-a'),{duration:10}));
 await assertFails(deleteDoc(doc(dbFor('teacher-a'),'exams','exam-a')));
});
test('no wildcard grants access to unknown collections or sensitive subcollections',async()=>{
 for(const path of ['unknown/test','exams/exam-a/private/copy','submissions/submission-a/private/copy']) await assertFails(setDoc(doc(dbFor('student-a'),path),{secret:1}));
});
test('profiles cannot grant roles or change identity, and friendship acceptance remains atomic',async()=>{
 const db=dbFor('student-a');
 await assertSucceeds(setDoc(doc(db,'users','student-a'),{uid:'student-a',role:'student',shortId:'1234'}));
 await assertFails(updateDoc(doc(db,'users','student-a'),{role:'teacher'}));
 await assertFails(updateDoc(doc(db,'users','student-a'),{shortId:'9999'}));
 await assertSucceeds(setDoc(doc(db,'friendRequests','request-fixture'),{fromUid:'student-a',toUid:'student-b',status:'pending'}));
 const recipient=dbFor('student-b'),batch=writeBatch(recipient);
 batch.set(doc(recipient,'friendships','a-b'),{userId:'student-a',friendId:'student-b',requestId:'request-fixture'});
 batch.set(doc(recipient,'friendships','b-a'),{userId:'student-b',friendId:'student-a',requestId:'request-fixture'});
 batch.delete(doc(recipient,'friendRequests','request-fixture'));
 await assertSucceeds(batch.commit());
 await assertFails(setDoc(doc(dbFor('stranger'),'friendships','fake'),{userId:'stranger',friendId:'student-a',requestId:'request-fixture'}));
});
