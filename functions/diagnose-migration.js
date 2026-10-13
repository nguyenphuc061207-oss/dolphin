// Read-only: explains the issues reported by migrate.js and proposes an --owner-map.
// Usage: node functions/diagnose-migration.js --project PROJECT_ID [--out owner-map.local.json] [--assign-all-to UID]
// --assign-all-to maps every deleted exam without a recorded teacher to UID (use only with an owner you verified).
// Prints counts and IDs only; never writes to Firestore.
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { writeFile } from 'node:fs/promises';
import { validateQuestions } from './policy.js';

const args = process.argv.slice(2);
const option = flag => { const i = args.indexOf(flag); return i < 0 ? null : args[i + 1]; };
const projectId = option('--project');
if (!projectId) throw new Error('Cần --project PROJECT_ID.');
initializeApp({ projectId, ...(process.env.FIRESTORE_EMULATOR_HOST ? {} : { credential: applicationDefault() }) });
const db = getFirestore();

const [exams, submissions] = await Promise.all(['exams', 'submissions'].map(c => db.collection(c).get()));
const examOwners = Object.fromEntries(exams.docs.map(d => [d.id, d.data().teacherId]));
console.log('Đề còn lại:', exams.docs.map(d => ({ id: d.id, teacherId: d.data().teacherId, title: d.data().title, v2: d.data().schemaVersion === 2 })));
// Who are the teachers? Helps you recognise your own UID (names only, no contact details).
const users = await db.collection('users').get();
console.log('Giáo viên của các đề còn lại:', [...new Set(Object.values(examOwners))].map(uid => {
  const u = users.docs.find(d => d.id === uid)?.data() || {};
  return { uid, displayName: u.displayName, shortId: u.shortId };
}));

// 1. Orphan submissions: which teacher do the submissions themselves name?
const orphans = new Map();
for (const d of submissions.docs) {
  const s = d.data();
  if (s.schemaVersion === 2 || examOwners[s.examId]) continue;
  const g = orphans.get(s.examId) || { count: 0, teachers: new Map(), titles: new Set() };
  g.count++;
  g.teachers.set(s.teacherId ?? '(không có teacherId)', (g.teachers.get(s.teacherId ?? '(không có teacherId)') || 0) + 1);
  if (s.examTitle) g.titles.add(s.examTitle);
  orphans.set(s.examId, g);
}
const assignAll = option('--assign-all-to');
if (assignAll && !users.docs.some(d => d.id === assignAll) && !Object.values(examOwners).includes(assignAll)) throw new Error('UID ' + assignAll + ' không có trong users hoặc đề nào; kiểm tra lại.');
const ownerMap = {}, ambiguous = [];
for (const [examId, g] of orphans) {
  const names = [...g.teachers.keys()];
  if (assignAll) ownerMap[examId] = assignAll;
  else if (names.length === 1 && !names[0].startsWith('(')) ownerMap[examId] = names[0];
  else ambiguous.push({ examId, bài: g.count, teachers: Object.fromEntries(g.teachers), tiêuĐề: [...g.titles] });
}
const teacherTotals = {};
for (const t of Object.values(ownerMap)) teacherTotals[t] = (teacherTotals[t] || 0) + 1;
console.log(`\nĐề đã xóa còn bài nộp: ${orphans.size}; xác định được giáo viên duy nhất: ${Object.keys(ownerMap).length}; chưa rõ: ${ambiguous.length}`);
console.log('Số đề đã xóa theo giáo viên (UID):', teacherTotals);
if (ambiguous.length) console.log('Chưa rõ chủ sở hữu:', JSON.stringify(ambiguous, null, 1));

// 2. Invalid snapshots: say what is wrong, without printing question text.
const shape = q => ({ type: q?.type || 'single', options: Array.isArray(q?.options) ? q.options.length : typeof q?.options, correctAnswer: Array.isArray(q?.correctAnswer) ? 'array' + q.correctAnswer.length : JSON.stringify(q?.correctAnswer) });
const invalid = [];
for (const d of submissions.docs) {
  const s = d.data();
  if (s.schemaVersion === 2) continue;
  try { validateQuestions(s.examSnapshot); } catch {
    const bad = [];
    if (Array.isArray(s.examSnapshot)) s.examSnapshot.forEach((q, i) => { try { validateQuestions([q]); } catch { bad.push({ câu: i + 1, ...shape(q) }); } });
    invalid.push({ id: d.id, examId: s.examId, điểm: s.score, lỗi: Array.isArray(s.examSnapshot) ? bad.slice(0, 5) : 'examSnapshot=' + typeof s.examSnapshot, tổngCâuLỗi: bad.length, tổngCâu: s.examSnapshot?.length });
  }
}
console.log(`\nBài có đề không hợp lệ: ${invalid.length}`);
console.log(JSON.stringify(invalid, null, 1));

const out = option('--out') || 'owner-map.local.json';
await writeFile(out, JSON.stringify(ownerMap, null, 2));
console.log(`\nĐã ghi owner-map đề xuất (${Object.keys(ownerMap).length} đề) vào ${out}. Hãy kiểm tra UID trước khi dùng với --owner-map.`);
await db.terminate();
