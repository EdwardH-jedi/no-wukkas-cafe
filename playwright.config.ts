import { defineConfig, devices } from '@playwright/test';

// E2E_PORT lets two checkouts run e2e at once (each needs its own dev server; with
// reuseExistingServer a shared port would test the other checkout's code).
const PORT = Number(process.env.E2E_PORT ?? 5179);

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    launchOptions: {
      // Software WebGL so the 3D scene renders in headless Chromium.
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  // Software WebGL is slow; a smaller viewport keeps the frame rate (and input sampling) usable.
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 640 } },
    },
  ],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
