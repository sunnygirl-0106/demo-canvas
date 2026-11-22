import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useCanvas } from '../store/canvas'
import { DEFAULT_IMAGE_SETTINGS, type ImageSettings } from '../generator/imageOptions'
import { fakeImageGen } from './fake'

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('window', globalThis)
  useCanvas.getState().setAll({ nodes: [], edges: [] })
})
afterEach(() => { vi.clearAllTimers(); vi.unstubAllGlobals(); vi.useRealTimers() })

it.each([1, 2, 4] as const)('生成 %s 张结果，保留提交时的数量、尺寸，整组可撤销', (count) => {
  const store = useCanvas.getState()
  const id = store.addNode('image', { x: 0, y: 0 }, { src: 'original.jpg' })
  const settings: ImageSettings = { ...DEFAULT_IMAGE_SETTINGS, count, resolution: '2K', ratio: '9:16' }
  fakeImageGen(id, settings)
  expect(useCanvas.getState().nodes.find((n) => n.id === id)?.data.busy).toBe(true)
  settings.count = 1
  settings.ratio = '1:1'
  vi.runAllTimers()
  const result = useCanvas.getState().nodes.find((n) => n.id === id)!.data
  expect(result.busy).toBe(false)
  expect(result.imageResults).toHaveLength(count)
  expect(result.src).toBe(result.imageResults![0])
  expect(result.imageResults!.every((src) => src.endsWith('/1152/2048'))).toBe(true)
  store.undo()
  const restored = useCanvas.getState().nodes.find((n) => n.id === id)!.data
  expect(restored.src).toBe('original.jpg')
  expect(restored.imageResults).toBeUndefined()
})
