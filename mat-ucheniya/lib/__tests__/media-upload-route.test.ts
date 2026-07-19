import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  deleteCampaignImageObject: vi.fn(),
  getCurrentUser: vi.fn(),
  getMembership: vi.fn(),
  insert: vi.fn(),
  logActivity: vi.fn(),
  logActivityError: vi.fn(),
  logActivityWarning: vi.fn(),
  select: vi.fn(),
  single: vi.fn(),
  uploadCampaignImage: vi.fn(),
  validateImageFile: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  getCurrentUser: mocks.getCurrentUser,
  getMembership: mocks.getMembership,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}))

vi.mock('@/lib/server/image-upload', () => ({
  deleteCampaignImageObject: mocks.deleteCampaignImageObject,
  uploadCampaignImage: mocks.uploadCampaignImage,
  validateImageFile: mocks.validateImageFile,
}))

vi.mock('@/lib/server/activity-log', () => ({
  logActivity: mocks.logActivity,
  logActivityError: mocks.logActivityError,
  logActivityWarning: mocks.logActivityWarning,
}))

import { POST } from '@/app/api/media/upload/route'

const campaignId = '10000000-0000-4000-8000-000000000001'
const userId = '20000000-0000-4000-8000-000000000002'
const uploadedKey = `media/${campaignId}/asset.png`
const image = new File([new Uint8Array([137, 80, 78, 71])], ' map.png ', {
  type: 'image/png',
})

function uploadRequest() {
  const form = new FormData()
  form.set('campaignId', campaignId)
  form.set('file', image)

  return { formData: vi.fn().mockResolvedValue(form) } as unknown as Request
}

describe('POST /api/media/upload', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mocks.getMembership.mockResolvedValue({ role: 'player' })
    mocks.getCurrentUser.mockResolvedValue({ id: userId })
    mocks.validateImageFile.mockResolvedValue(image)
    mocks.uploadCampaignImage.mockResolvedValue({ key: uploadedKey })
    mocks.deleteCampaignImageObject.mockResolvedValue(undefined)
    mocks.single.mockResolvedValue({
      data: {
        id: '30000000-0000-4000-8000-000000000003',
        campaign_id: campaignId,
        storage_key: uploadedKey,
        original_filename: 'map.png',
        mime_type: 'image/png',
        size_bytes: image.size,
        uploaded_by: userId,
        created_at: '2026-07-20T10:00:00.000Z',
      },
      error: null,
    })
    mocks.select.mockReturnValue({ single: mocks.single })
    mocks.insert.mockReturnValue({ select: mocks.select })
    mocks.createAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ insert: mocks.insert }),
    })
  })

  it('rejects a non-member before validating or uploading the file', async () => {
    mocks.getMembership.mockResolvedValue(null)

    const response = await POST(uploadRequest())

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ error: 'Нет прав.' })
    expect(mocks.validateImageFile).not.toHaveBeenCalled()
    expect(mocks.uploadCampaignImage).not.toHaveBeenCalled()
  })

  it('persists a player upload and does not expose its storage key', async () => {
    const response = await POST(uploadRequest())
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(mocks.uploadCampaignImage).toHaveBeenCalledWith(
      `media/${campaignId}`,
      image,
    )
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        campaign_id: campaignId,
        storage_key: uploadedKey,
        uploaded_by: userId,
      }),
    )
    expect(body.asset).toMatchObject({
      campaignId,
      originalFilename: 'map.png',
      mimeType: 'image/png',
    })
    expect(body.asset).not.toHaveProperty('storageKey')
    expect(body.asset).not.toHaveProperty('storage_key')
    expect(mocks.deleteCampaignImageObject).not.toHaveBeenCalled()
  })

  it('deletes the object when Postgres rejects the metadata row', async () => {
    mocks.single.mockResolvedValue({
      data: null,
      error: new Error('insert failed'),
    })

    const response = await POST(uploadRequest())

    expect(response.status).toBe(502)
    expect(mocks.deleteCampaignImageObject).toHaveBeenCalledWith(uploadedKey)
    expect(mocks.logActivityError).toHaveBeenCalledOnce()
  })

  it('deletes the object when the admin client throws', async () => {
    mocks.createAdminClient.mockImplementation(() => {
      throw new Error('missing service configuration')
    })

    const response = await POST(uploadRequest())

    expect(response.status).toBe(502)
    expect(mocks.deleteCampaignImageObject).toHaveBeenCalledWith(uploadedKey)
    expect(mocks.logActivityError).toHaveBeenCalledOnce()
  })
})
