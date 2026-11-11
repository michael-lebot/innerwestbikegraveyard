import { defineConfig, devices } from '@playwright/test'
import { E2E_BLOB_DIR, E2E_DATABASE_URL } from './e2e/support'

// Both apps share the iwb_e2e database and a folder for the photos the tests add, each apart from the dev server's,
// and never reach a Blob store or send an email, whatever token or key the shell has.
const SERVER_ENV = {
  DATABASE_URL: E2E_DATABASE_URL,
  BLOB_READ_WRITE_TOKEN: '',
  LOCAL_BLOB_DIR: E2E_BLOB_DIR,
  RESEND_API_KEY: '',
}

// End-to-end tests run against production builds (`pnpm build` first) of both apps.
export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/global-setup.ts',
  // The tests share one database and one IP address, so they run one at a time.
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://localhost:3000', trace: 'retain-on-failure' },
  projects: [
    { name: 'iphone', use: devices['iPhone 13'], testIgnore: ['admin*.spec.ts', 'perf.spec.ts'] },
    { name: 'pixel', use: devices['Pixel 7'], testIgnore: ['admin*.spec.ts'] },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
      testIgnore: ['perf.spec.ts'],
    },
  ],
  webServer: [
    { command: 'pnpm --filter @iwb/web start', url: 'http://localhost:3000', env: SERVER_ENV },
    {
      command: 'pnpm --filter @iwb/admin start',
      // Playwright starts the servers before global setup creates the database, and every admin page reads it.
      port: 3001,
      env: SERVER_ENV,
    },
  ],
})
