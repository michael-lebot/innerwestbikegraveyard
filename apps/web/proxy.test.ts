import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import { proxy } from './proxy'

describe('the visitor cookie', () => {
  it('is made for a new visitor, Secure over HTTPS, and given to the request too', () => {
    const response = proxy(new NextRequest('https://example.com/'))
    const cookie = response.headers.get('set-cookie')
    expect(cookie).toMatch(
      /^iwb_v=[\w-]{22}; Path=\/; Expires=[^;]+; Max-Age=31536000; Secure; HttpOnly; SameSite=lax$/,
    )
    // The route handler sees the request headers proxy.ts passes on, cookie included (assumption 8).
    expect(response.headers.get('x-middleware-request-cookie')).toBe(cookie!.split(';')[0])
  })

  it('is left alone once the visitor has one', () => {
    const response = proxy(new NextRequest('https://example.com/', { headers: { cookie: 'iwb_v=already' } }))
    expect(response.headers.get('set-cookie')).toBeNull()
    expect(response.headers.get('x-middleware-request-cookie')).toBe('iwb_v=already')
  })
})
