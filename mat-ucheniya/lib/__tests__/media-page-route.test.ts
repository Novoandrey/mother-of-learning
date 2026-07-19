import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getCampaignMediaPage: vi.fn(),
  getMembership: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ getMembership: mocks.getMembership }))
vi.mock('@/lib/queries/media', () => ({ getCampaignMediaPage: mocks.getCampaignMediaPage }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))

import { GET } from '@/app/api/media/route'

const campaignId = '10000000-0000-4000-8000-000000000001'

describe('GET /api/media', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getMembership.mockResolvedValue({ role: 'player' })
    mocks.createClient.mockResolvedValue({})
    mocks.getCampaignMediaPage.mockResolvedValue({ items: [], nextCursor: null })
  })

  it('rejects a user outside the campaign before reading the page', async () => {
    mocks.getMembership.mockResolvedValue(null)
    const response = await GET(new Request(`https://example.test/api/media?campaignId=${campaignId}`) as never)
    expect(response.status).toBe(403)
    expect(mocks.getCampaignMediaPage).not.toHaveBeenCalled()
  })

  it('returns the member-scoped cursor page', async () => {
    const response = await GET(new Request(`https://example.test/api/media?campaignId=${campaignId}&cursor=cursor-1`) as never)
    expect(response.status).toBe(200)
    expect(mocks.getCampaignMediaPage).toHaveBeenCalledWith({}, campaignId, 'cursor-1')
  })

  it('reports a malformed cursor without leaking an internal error', async () => {
    mocks.getCampaignMediaPage.mockRejectedValue(new Error('INVALID_MEDIA_CURSOR'))
    const response = await GET(new Request(`https://example.test/api/media?campaignId=${campaignId}&cursor=bad`) as never)
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Некорректная страница медиатеки.' })
  })
})
