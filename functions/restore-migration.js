import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { readFile } from 'node:fs/promises';
const args = process.argv.slice(2);
const value = name => { const i=args.indexOf(name); return i < 0 ? null : args[i+1]; };
const projectId = value('--project'), file = value('--backup');
if (!projectId || !file) throw new Error('Cần --project PROJECT_ID --backup PATH. Mặc định dry-run; thêm --apply để khôi phục.');
initializeApp({ projectId, ...(process.env.FIRESTORE_EMULATOR_HOST ? {} : { credential: applicationDefault() }) });
const db = getFirestore(), backup = JSON.parse(await readFile(file, 'utf8'));
console.log(JSON.stringify({projectId,exams:backup.exams.length,submissions:backup.submissions.length,apply:args.includes('--apply')}));
if (args.includes('--apply')) {
  await db.collection('securityConfig').doc('exams').set({ maintenance: true });
  for (const collection of ['exams', 'submissions']) for (const { id, data } of backup[collection]) {
    for (const key of ['createdAt', 'submittedAt']) {
      const timestamp = data[key];
      if (timestamp && typeof timestamp === 'object' && Number.isInteger(timestamp._seconds ?? timestamp.seconds)) {
        data[key] = new Timestamp(timestamp._seconds ?? timestamp.seconds, timestamp._nanoseconds ?? timestamp.nanoseconds ?? 0);
      }
    }
    await db.collection(collection).doc(id).set(data);
  }
  console.log('Backup restored. Maintenance stays enabled; restoring old rules would reintroduce answer leakage.');
}
await db.terminate();
