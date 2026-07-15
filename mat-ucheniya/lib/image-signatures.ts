export const SUPPORTED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
] as const

export type SupportedImageType = (typeof SUPPORTED_IMAGE_TYPES)[number]

const IMAGE_EXTENSIONS: Record<SupportedImageType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

export function isSupportedImageType(type: string): type is SupportedImageType {
  return SUPPORTED_IMAGE_TYPES.includes(type as SupportedImageType)
}

export function imageExtensionFor(type: string): string | null {
  return isSupportedImageType(type) ? IMAGE_EXTENSIONS[type] : null
}

/**
 * Checks the file header instead of trusting a client-supplied MIME type.
 * The header is intentionally tiny: callers only need to read the first 12
 * bytes before uploading the complete image to object storage.
 */
export function hasMatchingImageSignature(
  type: string,
  bytes: Uint8Array,
): boolean {
  if (type === 'image/png') {
    return (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    )
  }

  if (type === 'image/jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  }

  if (type === 'image/webp') {
    return (
      bytes.length >= 12 &&
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    )
  }

  return false
}
