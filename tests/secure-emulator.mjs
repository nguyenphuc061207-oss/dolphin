import { execFileSync } from 'node:child_process';
execFileSync(process.execPath, ['functions/tests/examService.emulator.mjs'], { stdio: 'inherit', env: process.env });
execFileSync(process.execPath, ['tests/vercel-api.emulator.mjs'], { stdio: 'inherit', env: process.env });
execFileSync(process.execPath, ['--test', 'tests/firestore-access.rules.mjs'], { stdio: 'inherit', env: process.env });
