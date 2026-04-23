'use server'

/**
 * Category server actions — spec-010.
 *
 *   • listCategoriesAction — any campaign member
 *   • createCategoryAction / renameCategoryAction / softDeleteCategoryAction
 *     — owner/dm only
 *
 * Writes go through the admin client after an explicit role check
 * (matches the project pattern for transactions.ts).
 */

import { getCurrentUser, getMembership } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { listCategories, type CategoryScope } from '@/lib/categories'
import type { Category } from '@/lib/transactions'

export type CategoryActionResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string }

export type ListCategoriesActionResult = CategoryActionResult<{
  categories: Category[]
}>

// Slug format — matches the migration's expectation of stable
// lowercase-ASCII identifiers. Keeps joins and URLs clean.
const SLUG_RE = /^[a-z0-9_-]+$/

async function requireDm(
  campaignId: string,
): Promise<
  | { ok: true; userId: string }
  | { ok: false; error: string }
> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'Не авторизован' }
  const membership = await getMembership(campaignId)
  if (!membership) return { ok: false, error: 'Нет доступа к этой кампании' }
  if (membership.role !== 'owner' && membership.role !== 'dm') {
    return { ok: false, error: 'Только ДМ или владелец может менять категории' }
  }
  return { ok: true, userId: user.id }
}

/**
 * Campaign-scoped category read. Any member can call it; the dropdown
 * needs categories to render for every player, not just DMs.
 */
export async function listCategoriesAction(
  campaignId: string,
  scope: CategoryScope,
  opts: { includeDeleted?: boolean } = {},
): Promise<ListCategoriesActionResult> {
  if (!campaignId) return { ok: false, error: 'Не указана кампания' }

  const membership = await getMembership(campaignId)
  if (!membership) return { ok: false, error: 'Нет доступа к этой кампании' }

  try {
    const categories = await listCategories(campaignId, scope, opts)
    return { ok: true, categories }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Неизвестная ошибка'
    return { ok: false, error: message }
  }
}

export async function createCategoryAction(
  campaignId: string,
  scope: CategoryScope,
  slug: string,
  label: string,
): Promise<CategoryActionResult> {
  if (!campaignId) return { ok: false, error: 'Не указана кампания' }
  if (!slug) return { ok: false, error: 'Укажите slug' }
  if (!label || !label.trim()) return { ok: false, error: 'Укажите название' }
  if (!SLUG_RE.test(slug)) {
    return {
      ok: false,
      error: 'Slug может содержать только a-z, 0-9, _ и -',
    }
  }

  const auth = await requireDm(campaignId)
  if (!auth.ok) return auth

  const admin = createAdminClient()

  // Pick the next sort_order after the highest current value.
  const { data: existing } = await admin
    .from('categories')
    .select('sort_order')
    .eq('campaign_id', campaignId)
    .eq('scope', scope)
    .order('sort_order', { ascending: false })
    .limit(1)

  const nextSort =
    ((existing?.[0] as { sort_order?: number } | undefined)?.sort_order ?? 0) + 10

  const { error } = await admin.from('categories').insert({
    campaign_id: campaignId,
    scope,
    slug,
    label: label.trim(),
    sort_order: nextSort,
    is_deleted: false,
  })

  if (error) {
    // 23505 = unique_violation — surface a friendlier message.
    if (error.code === '23505') {
      return { ok: false, error: 'Категория с таким slug уже есть' }
    }
    return { ok: false, error: `Не удалось создать: ${error.message}` }
  }

  return { ok: true }
}

export async function renameCategoryAction(
  campaignId: string,
  scope: CategoryScope,
  slug: string,
  newLabel: string,
): Promise<CategoryActionResult> {
  if (!newLabel || !newLabel.trim()) {
    return { ok: false, error: 'Укажите новое название' }
  }

  const auth = await requireDm(campaignId)
  if (!auth.ok) return auth

  const admin = createAdminClient()
  const { error } = await admin
    .from('categories')
    .update({ label: newLabel.trim() })
    .eq('campaign_id', campaignId)
    .eq('scope', scope)
    .eq('slug', slug)

  if (error) {
    return { ok: false, error: `Не удалось переименовать: ${error.message}` }
  }
  return { ok: true }
}

export async function softDeleteCategoryAction(
  campaignId: string,
  scope: CategoryScope,
  slug: string,
): Promise<CategoryActionResult> {
  const auth = await requireDm(campaignId)
  if (!auth.ok) return auth

  const admin = createAdminClient()
  const { error } = await admin
    .from('categories')
    .update({ is_deleted: true })
    .eq('campaign_id', campaignId)
    .eq('scope', scope)
    .eq('slug', slug)

  if (error) {
    return { ok: false, error: `Не удалось удалить: ${error.message}` }
  }
  return { ok: true }
}

export async function restoreCategoryAction(
  campaignId: string,
  scope: CategoryScope,
  slug: string,
): Promise<CategoryActionResult> {
  const auth = await requireDm(campaignId)
  if (!auth.ok) return auth

  const admin = createAdminClient()
  const { error } = await admin
    .from('categories')
    .update({ is_deleted: false })
    .eq('campaign_id', campaignId)
    .eq('scope', scope)
    .eq('slug', slug)

  if (error) {
    return { ok: false, error: `Не удалось восстановить: ${error.message}` }
  }
  return { ok: true }
}
