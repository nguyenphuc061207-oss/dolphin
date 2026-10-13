import { execFileSync } from 'node:child_process';
execFileSync(process.execPath, ['functions/tests/examService.emulator.mjs'], { stdio: 'inherit', env: {
  ...process.env,
  FUNCTIONS_EMULATOR_HOST: process.env.FUNCTIONS_EMULATOR_HOST || '127.0.0.1:5001',
  FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099',
} });
execFileSync(process.execPath, ['--test', 'tests/firestore-access.rules.mjs'], { stdio: 'inherit', env: process.env });
