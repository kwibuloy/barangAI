import { afterEach, expect, it, vi } from 'vitest'
import { compressPhoto, PHOTO_LONGEST_SIDE } from '../src/features/reports/photo'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function fakeCanvas(output: Blob | null) {
  const drawn: number[][] = []
  const context = { fillRect: vi.fn(), drawImage: (_: unknown, ...size: number[]) => drawn.push(size) }
  const canvas = document.createElement('canvas')
  vi.spyOn(canvas, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
  canvas.toBlob = (done: BlobCallback) => done(output)
  vi.spyOn(document, 'createElement').mockReturnValue(canvas)
  return { canvas, drawn }
}

it('keeps the photo when this browser cannot shrink it', async () => {
  const file = new File(['x'], 'road.png', { type: 'image/png' })
  expect(await compressPhoto(file)).toBe(file)
})

it('shrinks a large camera photo to a JPEG no wider than the stored size', async () => {
  const close = vi.fn()
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 4000, height: 3000, close })),
  )
  const { canvas, drawn } = fakeCanvas(new Blob(['small'], { type: 'image/jpeg' }))
  const result = await compressPhoto(new File([new Uint8Array(4_000_000)], 'IMG_1.png', { type: 'image/png' }))
  expect([canvas.width, canvas.height]).toEqual([PHOTO_LONGEST_SIDE, 1200])
  expect(drawn[0]).toEqual([0, 0, PHOTO_LONGEST_SIDE, 1200])
  expect(result.name).toBe('IMG_1.jpg')
  expect(result.type).toBe('image/jpeg')
  expect(result.size).toBe(5)
  expect(close).toHaveBeenCalled()
})

it('keeps a small JPEG that re-encoding would only make bigger', async () => {
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 800, height: 600, close: vi.fn() })),
  )
  fakeCanvas(new Blob([new Uint8Array(500)], { type: 'image/jpeg' }))
  const file = new File([new Uint8Array(100)], 'road.jpg', { type: 'image/jpeg' })
  expect(await compressPhoto(file)).toBe(file)
})

it('decodes a very large original at reduced size', async () => {
  const decode = vi.fn(async () => ({ width: 1600, height: 1200, close: vi.fn() }))
  vi.stubGlobal('createImageBitmap', decode)
  vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:x', revokeObjectURL: vi.fn() })
  vi.stubGlobal(
    'Image',
    class {
      naturalWidth = 8000
      naturalHeight = 6000
      onload = () => {}
      set src(_: string) {
        setTimeout(() => this.onload())
      }
    },
  )
  fakeCanvas(new Blob(['small'], { type: 'image/jpeg' }))
  await compressPhoto(new File([new Uint8Array(9_000_000)], 'big.jpg', { type: 'image/jpeg' }))
  expect(decode).toHaveBeenCalledWith(expect.any(File), {
    imageOrientation: 'from-image',
    resizeWidth: PHOTO_LONGEST_SIDE,
    resizeQuality: 'high',
  })
})
