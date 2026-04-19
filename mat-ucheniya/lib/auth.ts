import { redirect } from 'next/navigation'
import { createClient } from './supabase/server'

export type UserProfile = {
  user_id: string
  login: string
  display_name: string | null
  must_change_password: boolean
  created_at: string
}

export type Role = 'owner' | 'dm' | 'player'

export type CampaignMembership = {
  campaign_id: string
  user_id: string
  role: Role
}

/**
 * Gets the currently authenticated user, or null.
 * Safe in Server Components and Server Actions.
 */
export async function getCurrentUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

/**
 * Gets the current user plus their profile row. Returns null if not
 * authenticated or profile doesn't exist yet.
 */
export async function getCurrentUserAndProfile() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single()

  return { user, profile: (profile ?? null) as UserProfile | null }
}

/**
 * Redirects to /login if not authenticated, or to /onboarding if
 * must_change_password=true. Returns user+profile otherwise.
 * Use this at the top of protected Server Components.
 */
export async function requireAuth() {
  const result = await getCurrentUserAndProfile()
  if (!result) redirect('/login')
  const { user, profile } = result
  if (!profile) redirect('/login') // shouldn't happen, but fail safe
  if (profile.must_change_password) redirect('/onboarding')
  return { user, profile }
}

/**
 * Returns the user's membership in a campaign, or null if not a member.
 */
export async function getMembership(campaignId: string): Promise<CampaignMembership | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('campaign_members')
    .select('campaign_id, user_id, role')
    .eq('campaign_id', campaignId)
    .eq('user_id', user.id)
    .single()

  return (data as CampaignMembership | null) ?? null
}

/**
 * Require the current user to be a member of the given campaign.
 * Redirects to /login if not authenticated, or / if not a member.
 */
export async function requireMembership(campaignId: string) {
  const { user, profile } = await requireAuth()
  const membership = await getMembership(campaignId)
  if (!membership) redirect('/')
  return { user, profile, membership }
}

/**
 * Convert a login to the synthetic email used in Supabase Auth.
 * Never displayed in the UI.
 */
export function loginToEmail(login: string): string {
  return `${login.toLowerCase()}@mol.local`
}
