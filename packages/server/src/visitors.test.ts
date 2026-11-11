import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './client'
import { visitorFrom } from './visitors'

beforeEach(() => db.$executeRaw`TRUNCATE daily_salts`)

describe('visitorFrom', () => {
  it('gives one visitor hash per cookie', async () => {
    const [a, again, b] = await Promise.all([
      visitorFrom('cookie-a', '203.0.113.7'),
      visitorFrom('cookie-a', '198.51.100.1'),
      visitorFrom('cookie-b', '203.0.113.7'),
    ])
    expect(a.visitorHash).toBe(again.visitorHash)
    expect(a.visitorHash).not.toBe(b.visitorHash)
    expect(a.ipHash).toBe(b.ipHash)
  })

  it('counts every IPv6 address in one /64 as one IP, however it is written', async () => {
    const ip = async (address: string) => (await visitorFrom('cookie', address)).ipHash
    const home = await ip('2001:db8:85a3:12::1')
    expect(await ip('2001:0db8:85a3:0012:ffff:ffff:ffff:fffe')).toBe(home)
    expect(await ip('2001:db8:85a3:12:0:0:0:9')).toBe(home)
    expect(await ip('2001:db8:85a3:13::1')).not.toBe(home)
    expect(await ip('2001:db8::1')).toBe(await ip('2001:db8:0:0:1::'))
  })

  it('counts an IPv4 address written as IPv6 as the IPv4 address', async () => {
    const [mapped, plain] = await Promise.all([
      visitorFrom('cookie', '::ffff:203.0.113.7'),
      visitorFrom('cookie', '203.0.113.7'),
    ])
    expect(mapped.ipHash).toBe(plain.ipHash)
  })

  it("makes one salt a day, so a day's IP hashes can't be tied to an IP once it is deleted", async () => {
    await Promise.all([visitorFrom('a', '203.0.113.7'), visitorFrom('b', '203.0.113.8')])
    expect(await db.$queryRaw`SELECT day::text FROM daily_salts`).toEqual([
      { day: (await db.$queryRaw<{ day: string }[]>`SELECT (now() AT TIME ZONE 'utc')::date::text AS day`)[0]!.day },
    ])
  })

  it('stores neither the cookie nor the IP', async () => {
    const visitor = await visitorFrom('the-cookie', '203.0.113.7')
    expect(JSON.stringify(visitor)).not.toMatch(/the-cookie|203\.0\.113\.7/)
    expect(visitor).toEqual({
      visitorHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      ipHash: expect.stringMatching(/^[0-9a-f]{64}$/),
    })
  })
})
