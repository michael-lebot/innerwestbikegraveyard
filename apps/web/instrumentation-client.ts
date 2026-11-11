// Vercel BotID's check runs in the browser before each public write, so the server can tell bots from people (§6).
import { ON_VERCEL } from '@/lib/public-env'

// Elsewhere lib/bot.ts treats every request as human, and the challenge it would fetch only exists on Vercel. Loaded
// after the page's own scripts, as nothing is written before a visitor fills in a form, and every byte loaded with the
// map's preview delays its paint (plan, task 2.9).
if (ON_VERCEL)
  void import('botid/client/core').then(({ initBotId }) => initBotId({ protect: [{ path: '/api/*', method: 'POST' }] }))
