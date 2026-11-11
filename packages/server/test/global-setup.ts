import { execSync } from 'node:child_process'
import type { TestProject } from 'vitest/node'

/**
 * Brings the test database up to the latest migration, creating it if needed. Tests empty the tables they use. The web
 * app's route tests run it too, from their own folder.
 */
export default function setup(project: TestProject) {
  const url = project.config.env.DATABASE_URL ?? ''
  // Tests truncate tables. The message leaves out the URL, which may hold a password.
  if (!URL.canParse(url) || !new URL(url).pathname.endsWith('_test'))
    throw new Error('TEST_DATABASE_URL must name a database ending in _test')
  execSync('pnpm exec prisma migrate deploy', {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, DATABASE_URL: url },
    stdio: ['ignore', 'ignore', 'inherit'],
  })
}
