// The photo files' seam (plan §1.7): the private Vercel Blob store when there is a token, otherwise a local folder.
// Nothing else knows which it is. Paths are made by photos.ts, never by a visitor.
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { del, get, list, put } from '@vercel/blob'
import { env } from './env'

const token = env.BLOB_READ_WRITE_TOKEN
const folder = resolve(env.LOCAL_BLOB_DIR)

/** For a local file or folder that isn't there: `fallback`, rather than the error. */
const ifMissing =
  <T>(fallback: T) =>
  (error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error
    return fallback
  }

export async function putFile(path: string, bytes: Buffer) {
  // The store takes the content type from the extension.
  if (token) await put(path, bytes, { access: 'private', token })
  else {
    await mkdir(folder, { recursive: true })
    await writeFile(join(folder, path), bytes)
  }
}

/** A file's bytes as a stream, or null when there is no such file. */
export async function getFile(path: string): Promise<ReadableStream<Uint8Array> | null> {
  if (token) return (await get(path, { access: 'private', token }))?.stream ?? null
  const bytes = await readFile(join(folder, path)).catch(ifMissing(null))
  return bytes && new Blob([bytes]).stream()
}

/** Deletes files. One that is already gone is no error, so a deletion can always be tried again. */
export async function deleteFiles(paths: string[]) {
  if (!paths.length) return
  if (token) await del(paths, { token })
  else await Promise.all(paths.map((path) => rm(join(folder, path), { force: true })))
}

/** Every stored file, with when it was stored. */
export async function listFiles() {
  const files: { path: string; uploadedAt: Date }[] = []
  if (!token) {
    for (const path of await readdir(folder).catch(ifMissing([]))) {
      // Another run of the hourly job may delete it in the meantime.
      const stats = await stat(join(folder, path)).catch(ifMissing(null))
      if (stats) files.push({ path, uploadedAt: stats.mtime })
    }
    return files
  }
  let cursor: string | undefined
  do {
    const page = await list({ cursor, token })
    files.push(...page.blobs.map((blob) => ({ path: blob.pathname, uploadedAt: blob.uploadedAt })))
    cursor = page.hasMore ? page.cursor : undefined
  } while (cursor)
  return files
}
