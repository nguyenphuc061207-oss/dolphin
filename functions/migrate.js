import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectMigration, migrateData } from './migration.js';

const args = process.argv.slice(2);
const option = flag => { const i = args.indexOf(flag); return i < 0 ? null : args[i + 1]; };
const projectId = option('--project');
if (!projectId) throw new Error('Cần --project PROJECT_ID. Mặc định chỉ kiểm tra, thêm --apply để chuyển dữ liệu.');
initializeApp({ projectId, ...(process.env.FIRESTORE_EMULATOR_HOST ? {} : { credential: applicationDefault() }) });
const db = getFirestore();
const ownerMap = option('--owner-map') ? JSON.parse(await readFile(option('--owner-map'), 'utf8')) : {};
if (args.includes('--resume')) {
  for (const collection of ['exams', 'submissions']) {
    const documents = await db.collection(collection).get();
    if (documents.docs.some(doc => doc.data().schemaVersion !== 2)) throw new Error('Không mở lại API khi còn dữ liệu chưa chuyển xong.');
  }
  await db.collection('securityConfig').doc('exams').set({ maintenance: false });
  console.log('Exam APIs resumed.');
  await db.terminate();
  process.exit(0);
}
if (args.includes('--apply')) await db.collection('securityConfig').doc('exams').set({ maintenance: true });
const inspection = await inspectMigration(db, ownerMap, option('--legacy-offset') || '+07:00');
console.log(JSON.stringify({ projectId, apply: args.includes('--apply'), exams: inspection.exams.size, submissions: inspection.submissions.size, issues: inspection.issues }, null, 2));
if (args.includes('--apply')) {
  if (inspection.issues.length) throw new Error('Chưa chuyển dữ liệu: cần giải quyết các lỗi đã báo.');
  const directory = option('--backup-dir') ? resolve(option('--backup-dir')) : fileURLToPath(new URL('../security-backups.local/', import.meta.url));
  await mkdir(directory, { recursive: true });
  const backup = Object.fromEntries(['exams', 'submissions'].map(c => [c, inspection[c].docs.map(d => ({ id: d.id, data: d.data() }))]));
  await writeFile(resolve(directory, `backup-${projectId}-${Date.now()}.json`), JSON.stringify(backup), { flag: 'wx', mode: 0o600 });
  await migrateData(db, inspection);
  console.log('Migration completed. Maintenance remains enabled until --resume. Backup contains private data; keep it outside Git.');
}
await db.terminate();
