import 'server-only'

type Context = Record<string, string | number | boolean | null | undefined>

function serialise(context: Context) {
  return JSON.stringify({
    at: new Date().toISOString(),
    ...Object.fromEntries(Object.entries(context).filter(([, value]) => value !== undefined)),
  })
}

/**
 * Compact, searchable server-side events for mutations and integration
 * failures. Context must only contain identifiers and safe operational data;
 * never include credentials, request bodies, or image contents.
 */
export function logActivity(event: string, context: Context = {}) {
  console.info(`[activity] ${event} ${serialise(context)}`)
}

export function logActivityWarning(event: string, context: Context = {}) {
  console.warn(`[activity] ${event} ${serialise(context)}`)
}

export function logActivityError(event: string, error: unknown, context: Context = {}) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[activity] ${event} ${serialise({ ...context, error: message.slice(0, 300) })}`)
}
