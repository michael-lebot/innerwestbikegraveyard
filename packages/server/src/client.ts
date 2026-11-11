import { PrismaPg } from '@prisma/adapter-pg'
import { env } from './env'
import { PrismaClient } from './generated/prisma/client'

// One client, so one connection pool, per process: Next's dev server re-runs modules after every edit.
const cache = globalThis as typeof globalThis & { db?: PrismaClient }

export const db = (cache.db ??= new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) }))
