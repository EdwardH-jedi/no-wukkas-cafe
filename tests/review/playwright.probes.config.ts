import { defineConfig } from '@playwright/test';
import base from './playwright.ipv6.config';

export default defineConfig({
  ...base,
  testDir: '.',
  testMatch: 'independentSlowAudio.browser.ts',
  outputDir: './.e2e-results/probes',
});
