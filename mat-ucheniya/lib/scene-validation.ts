export type SceneSpeakerKind = 'character' | 'dm'
export type SceneMessageKind = 'speech' | 'description'

export function isSceneSpeakerKind(value: string): value is SceneSpeakerKind {
  return value === 'character' || value === 'dm'
}

export function isSceneMessageKind(value: string): value is SceneMessageKind {
  return value === 'speech' || value === 'description'
}

export function normalizeSceneBody(value: string): string | null {
  const body = value.trim()
  return body.length >= 1 && body.length <= 8000 ? body : null
}
