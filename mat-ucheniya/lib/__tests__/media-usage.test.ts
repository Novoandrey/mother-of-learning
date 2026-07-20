import { describe, expect, it, vi } from 'vitest'
import { getMediaAssetUsages } from '@/lib/server/media-usage'

const assetId = '30000000-0000-4000-8000-000000000003'

function clientFor(rows: unknown[]) {
  const eq = vi.fn().mockResolvedValue({ data: rows, error: null })
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ eq }),
    }),
  }
}

describe('getMediaAssetUsages', () => {
  it('returns no usage for an unreferenced asset', async () => {
    await expect(getMediaAssetUsages(clientFor([]) as never, assetId)).resolves.toEqual([])
  })

  it('groups portrait references by node and returns no storage data', async () => {
    const usages = await getMediaAssetUsages(clientFor([
      { character_node_id: 'node-a', node: { id: 'node-a', title: 'Альфа' } },
      { character_node_id: 'node-a', node: { id: 'node-a', title: 'Альфа' } },
      { character_node_id: 'node-b', node: { id: 'node-b', title: 'Бета' } },
    ]) as never, assetId)

    expect(usages).toEqual([
      { kind: 'portrait', nodeId: 'node-a', nodeTitle: 'Альфа', count: 2 },
      { kind: 'portrait', nodeId: 'node-b', nodeTitle: 'Бета', count: 1 },
    ])
    expect(JSON.stringify(usages)).not.toContain('storage_key')
  })
})
