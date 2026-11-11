import { execSync } from 'node:child_process'
import { E2E_DATABASE_URL, resetDb } from './support'

/** Migrates the end-to-end database, creating it if needed. Every test then resets it to the seed. */
export default function globalSetup() {
  execSync('pnpm --filter @iwb/server exec prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL },
    stdio: ['ignore', 'ignore', 'inherit'],
  })
  // Teardown: leave the seed in place for Lighthouse, which runs next against this database.
  return resetDb
}
