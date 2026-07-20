/** Client-side helpers to turn a picked poster picture into a compact data URL. */

const MAX_DIMENSION = 1000
const JPEG_QUALITY = 0.78
/** Reject absurdly large source files before even attempting to decode them. */
const MAX_SOURCE_FILE_BYTES = 20 * 1024 * 1024

export const IMAGE_FILE_ACCEPT = 'image/png,image/jpeg,image/webp'

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()

    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('invalidImage'))
    image.src = src
  })
}

/**
 * Reads an image file, downsizes it (longest side capped at `MAX_DIMENSION`)
 * and re-encodes it as JPEG, returning a compact base64 data URL. This keeps
 * the tournament row (and every listing response, which embeds each
 * tournament's picture) reasonably sized regardless of the original photo.
 */
export async function compressImageToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('invalidImage')
  }

  if (file.size > MAX_SOURCE_FILE_BYTES) {
    throw new Error('imageTooLarge')
  }

  const objectUrl = URL.createObjectURL(file)

  try {
    const image = await loadImage(objectUrl)
    const scale = Math.min(1, MAX_DIMENSION / Math.max(image.width, image.height))
    const width = Math.max(1, Math.round(image.width * scale))
    const height = Math.max(1, Math.round(image.height * scale))
    const canvas = document.createElement('canvas')

    canvas.width = width
    canvas.height = height

    const context = canvas.getContext('2d')

    if (!context) {
      throw new Error('invalidImage')
    }

    // JPEG has no alpha channel: flatten any transparency onto white first.
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
    context.drawImage(image, 0, 0, width, height)

    return canvas.toDataURL('image/jpeg', JPEG_QUALITY)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

/** Converts a `data:` URL back into a File — used to attach the poster to a Web Share. */
export function dataUrlToFile(dataUrl: string, filename: string): File | null {
  const match = /^data:(.+?);base64,(.*)$/.exec(dataUrl)

  if (!match) {
    return null
  }

  const [, mime, base64] = match
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }

  return new File([bytes], filename, { type: mime })
}
