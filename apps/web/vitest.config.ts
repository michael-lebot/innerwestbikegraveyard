import { defineConfig } from 'vitest/config'

// Route tests run against real Postgres, in the test database packages/server's tests use, one file at a time.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://iwb:iwb@localhost:54318/iwb_test'

export default defineConfig({
  resolve: { alias: { '@': import.meta.dirname } },
  test: {
    // Photo files go to the folder packages/server's tests use, never to a Blob store, and no email is sent, whatever
    // token or key the shell has.
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      BLOB_READ_WRITE_TOKEN: '',
      LOCAL_BLOB_DIR: '../../.data/blob-test',
      RESEND_API_KEY: '',
    },
    globalSetup: '../../packages/server/test/global-setup.ts',
    fileParallelism: false,
  },
})
