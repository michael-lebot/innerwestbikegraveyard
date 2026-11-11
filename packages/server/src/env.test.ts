import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

const root = new URL('../../../', import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), 'utf8')
const names = (text: string, pattern: RegExp) => [...text.matchAll(pattern)].map((match) => (match[1] ?? match[2])!)

it('loads on Vercel with only the variables turbo.json passes through, as `next build` there loads it', () => {
  // A process of its own, given only what Turbo passes the build. A URL is a valid value for each.
  const passed: string[] = JSON.parse(read('turbo.json')).globalPassThroughEnv
  // Without VERCEL the build would take itself for a local one.
  expect(passed).toContain('VERCEL')
  const load = () =>
    execFileSync(process.execPath, ['--input-type=module', '--eval', "await import('./src/env.ts')"], {
      cwd: new URL('..', import.meta.url),
      env: Object.fromEntries(passed.map((name) => [name, 'https://example.com'])),
      stdio: 'pipe',
    })
  expect(load).not.toThrow()
})

it('describes every variable the apps and packages read in an .env.example, and nothing more', () => {
  // Local and test settings with working defaults, and what Vercel or Node set themselves.
  const unlisted = [
    'LOCAL_BLOB_DIR',
    'TEST_DATABASE_URL',
    'ADMIN_PREVIEW_URL',
    'CI',
    'NODE_ENV',
    'VERCEL',
    'NEXT_PUBLIC_VERCEL_ENV',
  ]
  const code = execFileSync('git', ['ls-files', 'apps', 'packages'], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter((path) => /\.tsx?$/.test(path) && !path.includes('.test.'))
    .map(read)
    .join('\n')
  // process.env reads (not a comment's NEXT_PUBLIC_*), and the keys of the schema in packages/server/src/env.ts.
  const used = names(code, /process\.env\.([A-Z_]+)(?![\w*])|^ {4}([A-Z_]+): (?:local|z\.)/gm)
  const examples = ['apps/web', 'apps/admin', 'packages/server'].map((dir) => read(`${dir}/.env.example`))
  const described = names(examples.join('\n'), /^([A-Z_]+)=/gm)
  expect(new Set(used.filter((name) => !unlisted.includes(name)))).toEqual(new Set(described))
})
