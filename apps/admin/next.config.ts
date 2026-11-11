import type { NextConfig } from 'next'
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants'

// Static security headers, without nonces: the admin app is behind Vercel Authentication and renders no visitor
// content as HTML, so inline scripts are allowed (plan assumption 23).
export default function config(phase: string): NextConfig {
  const csp = [
    "default-src 'self'",
    // React needs eval in development only, for its debugging tools.
    `script-src 'self' 'unsafe-inline'${phase === PHASE_DEVELOPMENT_SERVER ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ')

  return {
    transpilePackages: ['@iwb/server', '@iwb/shared'],
    poweredByHeader: false,
    redirects: async () => [{ source: '/', destination: '/tags', permanent: false }],
    headers: async () => [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'geolocation=()' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
    ],
  }
}
