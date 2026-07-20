import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getMembership: vi.fn(),
  getMediaAssetUsages: vi.fn(),
  maybeSingle: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ getMembership: mocks.getMembership }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/server/media-usage', () => ({ getMediaAssetUsages: mocks.getMediaAssetUsages }))

import { GET } from '@/app/api/media/[id]/usage/route'

const assetId = '30000000-0000-4000-8000-000000000003'
const campaignId = '10000000-0000-4000-8000-000000000001'

describe('GET /api/media/[id]/usage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getMembership.mockResolvedValue({ role: 'player' })
    mocks.getMediaAssetUsages.mockResolvedValue([{ kind: 'portrait', nodeId: 'node-1', nodeTitle: 'Зориан', count: 1 }])
    const eqCampaign = vi.fn().mockReturnValue({ maybeSingle: mocks.maybeSingle })
    const eqId = vi.fn().mockReturnValue({ eq: eqCampaign })
    mocks.createClient.mockResolvedValue({ from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ eq: eqId }) }) })
    mocks.maybeSingle.mockResolvedValue({ data: { id: assetId }, error: null })
  })

  it('rejects outsiders before reading the asset', async () => {
    mocks.getMembership.mockResolvedValue(null)
    const response = await GET(new Request(`https://example.test/api/media/${assetId}/usage?campaignId=${campaignId}`), { params: Promise.resolve({ id: assetId }) })
    expect(response.status).toBe(403)
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('returns only a member-safe usage summary', async () => {
    const response = await GET(new Request(`https://example.test/api/media/${assetId}/usage?campaignId=${campaignId}`), { params: Promise.resolve({ id: assetId }) })
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body).toEqual({ usages: [{ kind: 'portrait', nodeId: 'node-1', nodeTitle: 'Зориан', count: 1 }] })
    expect(JSON.stringify(body)).not.toContain('storage_key')
  })

  it('does not disclose an asset from another campaign', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null })
    const response = await GET(new Request(`https://example.test/api/media/${assetId}/usage?campaignId=${campaignId}`), { params: Promise.resolve({ id: assetId }) })
    expect(response.status).toBe(404)
    expect(mocks.getMediaAssetUsages).not.toHaveBeenCalled()
  })
})
