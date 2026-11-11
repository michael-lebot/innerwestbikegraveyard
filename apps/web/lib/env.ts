// The web app's server environment. Database settings live in @iwb/server.
export const isDev = process.env.NODE_ENV === 'development'
/** Deployed on Vercel, where BotID can judge requests (§6). */
export const onVercel = !!process.env.VERCEL

/** The token Vercel Cron sends to the hourly job (§5.4). Off Vercel a fixed one, so the job runs locally with curl. */
export function cronSecret() {
  const secret = process.env.CRON_SECRET ?? (onVercel ? '' : 'dev-cron-secret')
  if (!secret) throw new Error('CRON_SECRET is not set')
  return secret
}
