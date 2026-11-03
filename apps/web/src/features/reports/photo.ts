/**
 * Photos are shrunk in the browser before upload: a phone camera's 3–12 MB original becomes a ~200–500 KB JPEG
 * whose longest side is at most 1600 px. That keeps uploads quick on mobile data and stored photos
 * small, while street signs, wiring and potholes stay readable. The server applies the same limits again, so an
 * old or unusual browser that cannot shrink here still stores a small photo.
 *
 * Redrawing on a canvas also drops all metadata (GPS, camera, time); read the photo's GPS before calling this.
 */
export const PHOTO_LONGEST_SIDE = 1600
export const PHOTO_QUALITY = 0.8
/** The largest original a resident can pick; it is shrunk before upload. */
export const MAX_PICK_BYTES = 25_000_000
/** The API's upload limit (MAX_IMAGE_BYTES), for browsers that could not shrink the photo. */
export const MAX_UPLOAD_BYTES = 5_000_000

/** Above this, decode at reduced size: a 50–200 MP original decoded in full can crash a phone's browser tab. */
const FULL_DECODE_PIXELS = 24_000_000

/** Width and height as displayed, without decoding the pixels; null when unknown. */
function photoSize(file: File): Promise<[number, number] | null> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    const done = (size: [number, number] | null) => {
      clearTimeout(timer)
      URL.revokeObjectURL(url)
      resolve(size)
    }
    const timer = setTimeout(() => done(null), 3000)
    image.onload = () => done(image.naturalWidth ? [image.naturalWidth, image.naturalHeight] : null)
    image.onerror = () => done(null)
    image.src = url
  })
}

async function decode(file: File) {
  const options: ImageBitmapOptions = { imageOrientation: 'from-image' }
  // Big files only; everyday phone photos (up to ~12 MP) decode in full, which is quick and safe.
  if (file.size > 8_000_000 && typeof URL.createObjectURL === 'function') {
    const size = await photoSize(file)
    if (size && size[0] * size[1] > FULL_DECODE_PIXELS) {
      // Width only, so the aspect ratio is always kept; the canvas below sets the exact size.
      options.resizeWidth = Math.round((size[0] * PHOTO_LONGEST_SIDE) / Math.max(...size))
      options.resizeQuality = 'high'
    }
  }
  return createImageBitmap(file, options)
}

export async function compressPhoto(file: File): Promise<File> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file
  let bitmap: ImageBitmap | null = null
  try {
    bitmap = await decode(file)
    const scale = Math.min(1, PHOTO_LONGEST_SIDE / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return file
    // PNG/WebP transparency would turn black in a JPEG.
    context.fillStyle = '#fff'
    context.fillRect(0, 0, width, height)
    context.imageSmoothingQuality = 'high'
    context.drawImage(bitmap, 0, 0, width, height)
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', PHOTO_QUALITY))
    if (!blob) return file
    // A small, already-compressed JPEG can grow when re-encoded; keep the original then (the server strips it).
    if (scale === 1 && file.type === 'image/jpeg' && blob.size >= file.size) return file
    const name = file.name.replace(/\.[^.]*$/, '') || 'photo'
    return new File([blob], `${name}.jpg`, { type: 'image/jpeg', lastModified: file.lastModified })
  } catch {
    return file
  } finally {
    bitmap?.close()
  }
}

/** Capture time and camera from the original file. Shrinking drops them, so the form sends them alongside. */
export type PhotoDetails = { takenAt: string | null; camera: boolean }

export async function photoDetails(file: File): Promise<PhotoDetails> {
  try {
    const { default: exifr } = await import('exifr')
    // reviveValues: false keeps the raw "YYYY:MM:DD HH:MM:SS" camera time, which the API reads as Philippine time.
    const tags = await exifr.parse(file, { pick: ['DateTimeOriginal', 'Make', 'Model'], reviveValues: false })
    const taken = typeof tags?.DateTimeOriginal === 'string' ? tags.DateTimeOriginal : null
    return { takenAt: taken, camera: Boolean(tags?.Make || tags?.Model) }
  } catch {
    return { takenAt: null, camera: false }
  }
}
