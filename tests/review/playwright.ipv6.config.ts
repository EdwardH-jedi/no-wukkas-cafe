// Isolate this review from an unrelated server bound to 127.0.0.1:5196.
import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import base from '../../playwright.config';

const port = Number(process.env.E2E_PORT ?? 5196);
const url = `http://[::1]:${port}`;

export default defineConfig({
  ...base,
  testDir: '../e2e',
  outputDir: './.e2e-results',
  use: { ...base.use, baseURL: url },
  webServer: {
    cwd: resolve(import.meta.dirname, '../..'),
    command: `npx vite --host ::1 --port ${port} --strictPort`,
    url,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
