export function encodeMediaCursor(createdAt: string, id: string): string {
  return Buffer.from(JSON.stringify({ createdAt, id })).toString('base64url')
}

export function decodeMediaCursor(cursor: string): { createdAt: string; id: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
      createdAt?: unknown
      id?: unknown
    }
    if (typeof parsed.createdAt !== 'string' || typeof parsed.id !== 'string') return null
    if (Number.isNaN(Date.parse(parsed.createdAt)) || !/^[0-9a-f-]{36}$/i.test(parsed.id)) return null
    return { createdAt: parsed.createdAt, id: parsed.id }
  } catch {
    return null
  }
}
