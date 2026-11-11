import type { TestProject } from 'vitest/node'
import { expect, it } from 'vitest'
import setup from './global-setup'

const run = (url: string) => () => setup({ config: { env: { DATABASE_URL: url } } } as unknown as TestProject)

it.each(['postgresql://admin:s3cret@prod.example.com/iwb', 'not a url s3cret'])(
  'refuses %s without printing it',
  (url) => {
    expect(run(url)).toThrow('TEST_DATABASE_URL must name a database ending in _test')
    expect(run(url)).not.toThrow(/s3cret/)
  },
)
