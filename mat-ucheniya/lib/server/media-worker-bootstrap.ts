let started = false

/**
 * The existing web service is autodeployed as one Node process. Start the
 * durable worker only from a dynamic media request, never from Next's build
 * instrumentation hook (which also runs during `next build`).
 */
export async function ensureMediaWorkerStarted(): Promise<void> {
  if (started || process.env.NODE_ENV !== 'production') return
  started = true
  try {
    const { startMediaWorkerInProcess } = await import('../../media-worker/runner.mjs')
    startMediaWorkerInProcess()
  } catch (error) {
    started = false
    console.error(JSON.stringify({
      event: 'media.worker.bootstrap_failed',
      code: error instanceof Error ? error.message : 'UNKNOWN',
    }))
  }
}
