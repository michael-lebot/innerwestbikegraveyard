// The server environment, parsed once. Off Vercel every variable has a local default, so a fresh clone needs no
// env files; on Vercel a missing one throws the first time code that needs it runs (plan §1.6). Only the variables
// turbo.json passes through reach `next build` on Vercel, which loads this file, so only those may be required here.
import { z } from 'zod'

/** Off Vercel: local development, the tests and CI. */
const local = !process.env.VERCEL

export const env = z
  .object({
    DATABASE_URL: local ? z.url().default('postgresql://iwb:iwb@localhost:54318/iwb') : z.url(),
    // Optional here, so the admin app, which never hashes, runs without it; visitors.ts refuses to hash without it.
    HASH_SECRET: local ? z.string().default('dev-hash-secret') : z.string().min(32).optional(),
    // The private photo store (§4.3). Off Vercel, without a token, photos go to a folder instead (plan §1.7), which
    // is resolved from each package's working directory: the repo's .data/blob.
    BLOB_READ_WRITE_TOKEN: local ? z.string().optional() : z.string().min(1),
    LOCAL_BLOB_DIR: z.string().default('../../.data/blob'),
    // Michael's alerts (§4.6), which only the web app sends. Without a key they go to the console, the function log on
    // Vercel; with one, email.ts needs ALERT_EMAIL_TO and ADMIN_URL, so the admin app and the build load without them.
    RESEND_API_KEY: z.string().optional(),
    ALERT_EMAIL_TO: z.string().optional(),
    ALERT_EMAIL_FROM: z.string().default('onboarding@resend.dev'),
    // The admin app, which every alert links to.
    ADMIN_URL: local ? z.url().default('http://localhost:3001') : z.url().optional(),
  })
  .parse(process.env)
