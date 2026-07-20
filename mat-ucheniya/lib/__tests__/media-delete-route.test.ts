import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  deleteCampaignImageObjects: vi.fn(),
  getCurrentUser: vi.fn(),
  getMembership: vi.fn(),
  getMediaAssetUsages: vi.fn(),
  logActivity: vi.fn(),
  logActivityError: vi.fn(),
  logActivityWarning: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ getCurrentUser: mocks.getCurrentUser, getMembership: mocks.getMembership }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))
vi.mock('@/lib/server/image-upload', () => ({ deleteCampaignImageObjects: mocks.deleteCampaignImageObjects }))
vi.mock('@/lib/server/media-usage', () => ({ getMediaAssetUsages: mocks.getMediaAssetUsages }))
vi.mock('@/lib/server/activity-log', () => ({
  logActivity: mocks.logActivity,
  logActivityError: mocks.logActivityError,
  logActivityWarning: mocks.logActivityWarning,
}))

import { DELETE } from '@/app/api/media/[id]/route'

const assetId = '30000000-0000-4000-8000-000000000003'
const campaignId = '10000000-0000-4000-8000-000000000001'
const userId = '20000000-0000-4000-8000-000000000002'

function request() {
  return new Request(`https://example.test/api/media/${assetId}?campaignId=${campaignId}`, { method: 'DELETE' })
}

function adminForDelete(error: { code?: string } | null = null) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: { id: assetId, storage_key: 'media/original.png', media_asset_variants: [{ storage_key: 'media/thumb.webp' }] },
    error: null,
  })
  const selectCampaign = vi.fn().mockReturnValue({ maybeSingle })
  const selectId = vi.fn().mockReturnValue({ eq: selectCampaign })
  const deleteCampaign = vi.fn().mockResolvedValue({ error })
  const deleteId = vi.fn().mockReturnValue({ eq: deleteCampaign })
  const from = vi.fn()
    .mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: selectId }) })
    .mockReturnValueOnce({ delete: vi.fn().mockReturnValue({ eq: deleteId }) })
  return { from, deleteCampaign }
}

describe('DELETE /api/media/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getMembership.mockResolvedValue({ role: 'player' })
    mocks.getCurrentUser.mockResolvedValue({ id: userId })
    mocks.getMediaAssetUsages.mockResolvedValue([])
    mocks.deleteCampaignImageObjects.mockResolvedValue({ failedCount: 0 })
    const admin = adminForDelete()
    mocks.createAdminClient.mockReturnValue(admin)
  })

  it('rejects outsiders before reading or deleting the asset', async () => {
    mocks.getMembership.mockResolvedValue(null)
    const response = await DELETE(request(), { params: Promise.resolve({ id: assetId }) })
    expect(response.status).toBe(403)
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
  })

  it('refuses an asset that has a portrait usage', async () => {
    mocks.getMediaAssetUsages.mockResolvedValue([{ kind: 'portrait', nodeId: 'node-1', nodeTitle: 'Зориан', count: 1 }])
    const response = await DELETE(request(), { params: Promise.resolve({ id: assetId }) })
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({ usages: [{ nodeId: 'node-1' }] })
    expect(mocks.deleteCampaignImageObjects).not.toHaveBeenCalled()
  })

  it('deletes only server-read original and variant keys after database delete', async () => {
    const response = await DELETE(request(), { params: Promise.resolve({ id: assetId }) })
    expect(response.status).toBe(200)
    expect(mocks.deleteCampaignImageObjects).toHaveBeenCalledWith(['media/original.png', 'media/thumb.webp'])
    expect(mocks.logActivity).toHaveBeenCalledWith('media.deleted', expect.objectContaining({ campaignId, userId, assetId }))
  })

  it('turns an FK race into an in-use response without storage cleanup', async () => {
    mocks.createAdminClient.mockReturnValue({ from: adminForDelete({ code: '23503' }).from })
    mocks.getMediaAssetUsages
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ kind: 'portrait', nodeId: 'node-1', nodeTitle: 'Зориан', count: 1 }])
    const response = await DELETE(request(), { params: Promise.resolve({ id: assetId }) })
    expect(response.status).toBe(409)
    expect(mocks.deleteCampaignImageObjects).not.toHaveBeenCalled()
  })

  it('keeps the successful database deletion and logs an R2 cleanup failure', async () => {
    mocks.deleteCampaignImageObjects.mockResolvedValue({ failedCount: 1 })
    const response = await DELETE(request(), { params: Promise.resolve({ id: assetId }) })
    expect(response.status).toBe(200)
    expect(mocks.logActivityError).toHaveBeenCalledWith(
      'media.delete.storage_cleanup_failed',
      expect.any(Error),
      expect.objectContaining({ failedObjectCount: 1 }),
    )
  })
})
