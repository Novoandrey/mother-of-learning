import 'server-only'

/** Public URL for a map image stored alongside the existing portrait assets. */
export function mapImageUrl(key: string): string | null {
  const base = process.env.NEXT_PUBLIC_R2_PORTRAIT_BASE
  return base ? `${base.replace(/\/$/, '')}/${key}` : null
}

export function clampMapPosition(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 100000) / 100000
}
