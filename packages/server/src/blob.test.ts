import { rm } from 'node:fs/promises'
import { beforeEach, expect, it } from 'vitest'
import { deleteFiles, getFile, listFiles, putFile } from './blob'
import { env } from './env'

// The tests' own folder (vitest.config.ts), emptied before each.
beforeEach(() => rm(env.LOCAL_BLOB_DIR, { recursive: true, force: true }))

const read = async (path: string) => {
  const stream = await getFile(path)
  return stream && new Response(stream).text()
}

it('stores, lists, reads and deletes files in the local folder', async () => {
  const before = Date.now()
  await putFile('a.webp', Buffer.from('first'))
  await putFile('b.webp', Buffer.from('second'))

  expect(await read('a.webp')).toBe('first')
  const files = await listFiles()
  expect(files.map((file) => file.path).toSorted()).toEqual(['a.webp', 'b.webp'])
  for (const { uploadedAt } of files) expect(uploadedAt.getTime()).toBeGreaterThanOrEqual(before - 1000)

  await deleteFiles(['a.webp'])
  expect(await read('a.webp')).toBeNull()
  expect((await listFiles()).map((file) => file.path)).toEqual(['b.webp'])
})

it('lists nothing before the first file, and deletes a file that is already gone without an error', async () => {
  expect(await listFiles()).toEqual([])
  await expect(deleteFiles(['gone.webp'])).resolves.toBeUndefined()
})
