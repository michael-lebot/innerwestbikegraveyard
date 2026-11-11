import { checkBotId } from 'botid/server'
import { onVercel } from './env'

/**
 * Whether Vercel BotID judges this request a bot (§6). Its verdict needs Vercel's request context, so elsewhere every
 * request is human.
 * shortcut: no bot check locally or in CI, the runbook checks BotID on a preview deployment.
 */
export async function isBot() {
  return onVercel && (await checkBotId()).isBot
}
