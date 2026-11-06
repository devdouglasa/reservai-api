import { loadEnvFile } from 'node:process';
import { spawnSync } from 'node:child_process';
try {
  loadEnvFile('.env');
} catch {
  /* CI may supply environment variables directly. */
}
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test')) {
  console.error(
    'Set TEST_DATABASE_URL to a dedicated PostgreSQL database ending in _test. Its tables will be cleared.',
  );
  process.exit(1);
}
const result = spawnSync(
  process.execPath,
  ['node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.config.e2e.ts'],
  { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url } },
);
process.exit(result.status ?? 1);
