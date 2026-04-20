/**
 * Branding configuration for open-source multi-deployment support.
 *
 * Mat-Ucheniya is the flagship test campaign, but the app itself is a
 * universal tabletop RPG tool (see Constitution X: «универсальность»).
 * Forks and new deployments override these via env vars at build time.
 *
 * Defaults preserve the current production experience.
 */
export const APP_NAME =
  process.env.NEXT_PUBLIC_APP_NAME || 'Мать Учения'

export const APP_DESCRIPTION =
  process.env.NEXT_PUBLIC_APP_DESCRIPTION ||
  'Граф сущностей для настольных ролевых кампаний'

export const APP_LOGIN_SUBTITLE =
  process.env.NEXT_PUBLIC_APP_LOGIN_SUBTITLE ||
  'Войдите, чтобы продолжить'
