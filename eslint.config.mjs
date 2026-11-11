import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

// The import rules of tasks/plan.md §1.3. When two blocks set the same rule for a file, ESLint keeps only the last,
// so each folder's block lists every ban that applies to it, built from this one table.
const BANS = {
  '@iwb/server': 'Only app/ and lib/ import @iwb/server. Components and map/ get data as props or over /api/*.',
  '@iwb/shared/geo': 'Load it with import(), so its data stays out of the first bundle.',
  '@iwb/shared/picker': 'Load it with import(), so its data stays out of the first bundle.',
  'maplibre-gl': 'Only apps/web/map/ imports MapLibre.',
  pmtiles: 'Only apps/web/map/ imports pmtiles.',
  '@/map/*': 'Load the map with import() from components/MapScreen.tsx.',
  sharp: 'Only apps/web/lib/image.ts, the preview and icon scripts and tests import sharp.',
  botid: 'Only lib/bot.ts, instrumentation-client.ts and next.config.ts import botid.',
  '@iwb/web': 'Apps never import each other, and packages never import apps.',
  '@iwb/admin': 'Apps never import each other, and packages never import apps.',
}

const bansExcept = (...allowed) => [
  'error',
  {
    patterns: Object.entries(BANS)
      .filter(([name]) => !allowed.includes(name))
      .map(([name, message]) => ({ group: [name], message })),
  },
]

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores(['**/.next/', '**/next-env.d.ts', 'packages/server/src/generated/']),
  // App Router only: this Pages Router rule has nothing to check.
  { rules: { '@next/next/no-html-link-for-pages': 'off' } },

  {
    files: ['packages/shared/**'],
    // Tests and the data build scripts run in Node only.
    ignores: ['**/*.test.ts', 'packages/shared/scripts/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['node:*', '@prisma/*', 'react', 'react-dom', 'next', '@iwb/*'],
              message: 'packages/shared runs in the browser too: npm packages only.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/server/**'],
    rules: { 'no-restricted-imports': bansExcept('@iwb/shared/geo', '@iwb/shared/picker') },
  },
  { files: ['apps/**'], rules: { 'no-restricted-imports': bansExcept('@iwb/server') } },
  { files: ['apps/*/components/**'], rules: { 'no-restricted-imports': bansExcept() } },
  { files: ['apps/web/map/**'], rules: { 'no-restricted-imports': bansExcept('maplibre-gl', 'pmtiles') } },
  // A type written as import('@iwb/server').X is no import statement, so no-restricted-imports can't see it.
  {
    files: ['apps/*/components/**', 'apps/web/map/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: "TSImportType Literal[value='@iwb/server']", message: BANS['@iwb/server'] },
      ],
    },
  },
  {
    // Tests make their pictures with it.
    files: [
      'apps/web/lib/image.ts',
      'apps/web/scripts/build-preview.ts',
      'apps/web/scripts/build-icons.ts',
      'apps/web/**/*.test.ts',
    ],
    rules: { 'no-restricted-imports': bansExcept('@iwb/server', 'sharp') },
  },
  {
    files: ['apps/web/lib/bot.ts', 'apps/web/instrumentation-client.ts', 'apps/web/next.config.ts'],
    rules: { 'no-restricted-imports': bansExcept('@iwb/server', 'botid') },
  },

  // §1.6: environment variables are read and parsed in one place per deployable.
  {
    files: ['apps/**', 'packages/*/src/**'],
    // The test configs pick the test database, which TEST_DATABASE_URL may override.
    ignores: ['packages/server/src/env.ts', 'apps/web/lib/env.ts', 'apps/web/lib/public-env.ts', '**/vitest.config.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'process', property: 'env', message: 'Read environment variables through env.ts.' },
      ],
    },
  },
])
