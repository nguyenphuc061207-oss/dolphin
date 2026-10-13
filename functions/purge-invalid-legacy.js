// Backs up, then deletes, legacy submissions that cannot be migrated: their exam was deleted and the
// saved exam snapshot has questions without a valid answer key (see diagnose-migration.js).
// Dry-run by default.
//   node functions/purge-invalid-legacy.js --project ID                  list what would be removed
//   node functions/purge-invalid-legacy.js --project ID --apply          back up to security-backups.local/, then delete
//   node functions/purge-invalid-legacy.js --project ID --restore PATH   put the backed-up documents back (never overwrites)
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateQuestions } from './policy.js';

const args = process.argv.slice(2);
const option = flag => { const i = args.indexOf(flag); return i < 0 ? null : args[i + 1]; };
const projectId = option('--project');
if (!projectId) throw new Error('Cần --project PROJECT_ID. Mặc định chỉ liệt kê, thêm --apply để sao lưu rồi xóa.');
initializeApp({ projectId, ...(process.env.FIRESTORE_EMULATOR_HOST ? {} : { credential: applicationDefault() }) });
const db = getFirestore();

// Firestore timestamps survive the JSON round trip as { __ts: ISO string }.
const encode = function (key, value) { const raw = this[key]; return raw instanceof Timestamp ? { __ts: raw.toDate().toISOString() } : value; };
const decode = (key, value) => (value && typeof value === 'object' && typeof value.__ts === 'string' ? Timestamp.fromDate(new Date(value.__ts)) : value);

if (option('--restore')) {
  const backup = JSON.parse(await readFile(resolve(option('--restore')), 'utf8'), decode);
  let restored = 0, skipped = 0;
  for (const { id, data } of backup.submissions) {
    try { await db.collection('submissions').doc(id).create(data); restored++; } catch (e) {
      if (e.code === 6) skipped++; else throw e; // 6 = ALREADY_EXISTS
    }
  }
  console.log(JSON.stringify({ projectId, restored, đãTồnTạiBỏQua: skipped }, null, 2));
  await db.terminate();
  process.exit(0);
}

const [exams, submissions] = await Promise.all(['exams', 'submissions'].map(c => db.collection(c).get()));
const examIds = new Set(exams.docs.map(d => d.id));
const targets = submissions.docs.filter(d => {
  const s = d.data();
  if (s.schemaVersion === 2 || examIds.has(s.examId)) return false;
  try { validateQuestions(s.examSnapshot); return false; } catch { return true; }
});
console.log(JSON.stringify({ projectId, apply: args.includes('--apply'), tổngBàiNộp: submissions.size, sẽXóa: targets.length,
  bài: targets.map(d => ({ id: d.id, examId: d.data().examId, điểm: d.data().score })) }, null, 2));

if (args.includes('--apply') && targets.length) {
  const directory = option('--backup-dir') ? resolve(option('--backup-dir')) : fileURLToPath(new URL('../security-backups.local/', import.meta.url));
  await mkdir(directory, { recursive: true });
  const file = resolve(directory, `invalid-legacy-${projectId}-${Date.now()}.json`);
  const backup = { projectId, submissions: targets.map(d => ({ id: d.id, data: d.data() })) };
  await writeFile(file, JSON.stringify(backup, encode), { flag: 'wx', mode: 0o600 });
  const written = JSON.parse(await readFile(file, 'utf8'));
  if (written.submissions.length !== targets.length) throw new Error('Sao lưu không đầy đủ; không xóa gì.');
  // Each delete is conditional on the document being unchanged since it was read.
  for (let i = 0; i < targets.length; i += 400) {
    const batch = db.batch();
    targets.slice(i, i + 400).forEach(d => batch.delete(d.ref, { lastUpdateTime: d.updateTime }));
    await batch.commit();
  }
  console.log(`Đã xóa ${targets.length} bài. Sao lưu (chứa dữ liệu học sinh, giữ ngoài Git): ${file}`);
  console.log(`Khôi phục: node functions/purge-invalid-legacy.js --project ${projectId} --restore "${file}"`);
}
await db.terminate();
