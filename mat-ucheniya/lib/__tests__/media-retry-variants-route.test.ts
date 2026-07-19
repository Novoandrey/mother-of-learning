import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getMembership: vi.fn(),
  maybeSingle: vi.fn(),
  queueUpdate: vi.fn(),
  createAdminClient: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ getMembership: mocks.getMembership }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))

import { POST } from '@/app/api/media/[id]/retry-variants/route'

const assetId = '30000000-0000-4000-8000-000000000003'
const campaignId = '10000000-0000-4000-8000-000000000001'

function params() {
  return { params: Promise.resolve({ id: assetId }) }
}

describe('POST /api/media/:id/retry-variants', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getMembership.mockResolvedValue({ role: 'player' })
    mocks.maybeSingle.mockResolvedValue({ data: {
      id: assetId,
      campaign_id: campaignId,
      variant_version: 1,
      variant_state: 'failed',
    } })
    const assetSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: mocks.maybeSingle }),
    })
    const assetUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    })
    const queueUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    })
    mocks.queueUpdate.mockImplementation(queueUpdate)
    mocks.createAdminClient.mockReturnValue({
      from: vi.fn((table: string) => table === 'media_assets'
        ? { select: assetSelect, update: assetUpdate }
        : { update: mocks.queueUpdate }),
    })
  })

  it('allows a player who belongs to the asset campaign to requeue a failed variant', async () => {
    const response = await POST(new Request('http://localhost'), params())

    expect(response.status).toBe(202)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(mocks.getMembership).toHaveBeenCalledWith(campaignId)
    expect(mocks.queueUpdate).toHaveBeenCalledWith(expect.objectContaining({ state: 'queued' }))
  })

  it('rejects a user outside the asset campaign', async () => {
    mocks.getMembership.mockResolvedValue(null)

    const response = await POST(new Request('http://localhost'), params())

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ error: 'Нет прав.' })
  })
})
