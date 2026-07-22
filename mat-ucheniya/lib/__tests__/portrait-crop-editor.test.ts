import { describe, expect, it } from 'vitest'
import { portraitCropStyle } from '@/components/portrait-crop-editor'

describe('portraitCropStyle', () => {
  it('keeps a landscape portrait proportional instead of squeezing it into a square', () => {
    expect(portraitCropStyle({ crop_x: 0.5, crop_y: 0.5, crop_zoom: 1 }, 2)).toMatchObject({
      width: 'auto',
      height: '100%',
      left: '-50%',
      top: '0%',
    })
  })

  it('keeps a portrait image proportional and constrains a crop to the circular frame', () => {
    expect(portraitCropStyle({ crop_x: 0, crop_y: 0, crop_zoom: 1 }, 0.5)).toMatchObject({
      width: '100%',
      height: 'auto',
      left: '0%',
      top: '0%',
    })
  })
})
