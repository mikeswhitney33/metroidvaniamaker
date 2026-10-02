import { defineConfig, devices } from '@playwright/test';

/** Browser smoke tests: `npm run e2e`. They start the dev server themselves. */
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:5174', viewport: { width: 1440, height: 900 } },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: { command: 'npx vite --port 5174 --strictPort', url: 'http://localhost:5174', reuseExistingServer: true },
});
