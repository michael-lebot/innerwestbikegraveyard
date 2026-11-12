# The Inner West E-bike Graveyard

A simple, interactive map of Sydney's Inner West Council area where anyone can tag a dumped share bike
(Lime, Hello, Ario). MIT license.

- Tags expire after 48 hours unless someone marks them **Still there**.
- **Notify the service provider?** on each tag opens the visitor's own email app with a message to the operator's
  support address, and offers the message to copy. The site itself sends nothing.
- Photos can be reported. The first report hides a photo straight away and queues it for admin review. Once a photo has
  been reviewed and restored, later reports are queued but no longer hide it.

## Status

Live at [innerwestbikegraveyard.com](https://innerwestbikegraveyard.com). Built with Claude Code.

## Stack

Next.js 16 · Neon Postgres (Prisma, via the Vercel Marketplace) · Vercel (Sydney region) · Vercel Blob ·
MapLibre GL JS with self-hosted Protomaps tiles · Vercel BotID · Resend.

## Develop

You need Node 24 or later, pnpm 9.15.9 (`corepack enable` picks it up from `package.json`) and Docker.

```sh
pnpm install
pnpm db:up                                              # Postgres 18 on localhost:54318
cp packages/server/.env.example packages/server/.env    # the Prisma CLI reads DATABASE_URL from here
pnpm db:reset                                           # migrate the dev database and load 14 seeded tags
pnpm tiles                                              # the map tiles (needs the pmtiles CLI, see below)
pnpm dev                                                # the site on localhost:3000, admin on localhost:3001
pnpm exec playwright install chromium webkit            # once, for the end-to-end tests
```

| Script           | What it does                                                                      |
| ---------------- | --------------------------------------------------------------------------------- |
| `pnpm db:up`     | Start Postgres in Docker and wait until it is healthy                             |
| `pnpm db:down`   | Stop it (the data volume is kept)                                                 |
| `pnpm db:reset`  | Empty the dev database, apply every migration and load the seed                   |
| `pnpm tiles`     | Cut the Inner West map tiles out of the pinned Protomaps build (git-ignored)      |
| `pnpm dev`       | Both apps in development mode                                                     |
| `pnpm start`     | Both apps from their production builds                                            |
| `pnpm lint`      | ESLint, including the import rules, and Prettier                                  |
| `pnpm typecheck` | TypeScript in every package and in the end-to-end tests                           |
| `pnpm test`      | Vitest in every package, against the `iwb_test` database                          |
| `pnpm build`     | Production builds of both apps                                                    |
| `pnpm e2e`       | Playwright and axe on iPhone, Pixel and desktop, against the builds and `iwb_e2e` |
| `pnpm lhci`      | Lighthouse CI on `/` and `/list`, after `pnpm e2e`                                |
| `pnpm verify`    | All of the above from `lint` on, in that order                                    |

Photos go to a private Vercel Blob store in production. Without `BLOB_READ_WRITE_TOKEN`, as in development, they are
files in `.data/blob/` (git-ignored), or wherever `LOCAL_BLOB_DIR` says (relative to each app's folder); the tests
use `.data/blob-test/` and the end-to-end servers `.data/blob-e2e/`. The hourly job also deletes any file there that
is an hour old and that no photo in the dev database has.

The site's icon is [`apps/web/app/icon.svg`](apps/web/app/icon.svg), the header's headstone. `pnpm dev` and
`pnpm build` first draw the iPhone home-screen icon and `favicon.ico` from it (git-ignored) with
[`apps/web/scripts/build-icons.ts`](apps/web/scripts/build-icons.ts).

## Map data

- **Tiles:** `pnpm tiles` runs [`apps/web/scripts/fetch-tiles.sh`](apps/web/scripts/fetch-tiles.sh), which needs the
  [`pmtiles` CLI](https://github.com/protomaps/go-pmtiles/releases) (`brew install pmtiles`). It writes
  `apps/web/public/tiles/inner-west.pmtiles` (about 13 MB), which `next start` serves with range requests.
- **Label glyphs:** the map draws its labels in Atkinson Hyperlegible from signed-distance-field PBFs, range 0–255
  only, committed in `apps/web/public/glyphs/` (the font's licence is `apps/web/public/fonts/OFL.txt`). To make them
  again, put `AtkinsonHyperlegible-Regular.ttf` and `-Bold.ttf` from
  [google/fonts](https://github.com/google/fonts/tree/main/ofl/atkinsonhyperlegible) in a folder `fonts/`, then:

  ```sh
  cargo install build_pbf_glyphs@1.5.1
  build_pbf_glyphs fonts glyphs
  for style in Regular Bold; do
    cp glyphs/AtkinsonHyperlegible-$style/0-255.pbf apps/web/public/glyphs/AtkinsonHyperlegible-$style/
  done
  ```

- **Council, suburbs, streets and house numbers:** the committed files in `packages/shared/data/` come from NSW
  Spatial Services. `pnpm --filter @iwb/shared data:fetch` downloads them again (about 50 MB, two minutes) and
  `data:build` rebuilds the files: `places.json` for placing a tag, and for Choose by street `picker.json` (every
  street with its corners) and `addresses/<suburb>.json` (its house numbers).
- **Preview image:** `pnpm dev` and `pnpm build` first draw `apps/web/public/preview.webp` (git-ignored) from that
  data with [`apps/web/scripts/build-preview.ts`](apps/web/scripts/build-preview.ts). The map screen shows it until
  the map is ready, and keeps it if the map can't load.

## Data attribution

- Map data © OpenStreetMap contributors.
- Council and suburb boundaries and street names © State of New South Wales (Spatial Services, DCS NSW), CC BY 4.0.
- House numbers © State of New South Wales (Spatial Services, DCS NSW), under a Creative Commons licence whose
  version is to be confirmed before launch.

## Licence

The code is MIT-licensed: see [LICENSE](LICENSE). The map, boundary and address data keep the licences above.
