import { beforeEach, expect, it } from 'vitest'
import { useGenerator } from '../store/generator'
import { DEFAULT_IMAGE_SETTINGS, imageDimensions, resolveImageSettings } from './imageOptions'

beforeEach(() => useGenerator.getState().reset())

it('图片设置按节点保留，修改提示词不会覆盖设置，也不改视频参数', () => {
  const store = useGenerator.getState()
  const videoParams = store.get1('image-a').params
  store.patch('image-a', { imageSettings: { ...DEFAULT_IMAGE_SETTINGS, ratio: '9:16', resolution: '2K', count: 4 } })
  store.patch('image-a', { prompt: '海报' })
  store.patch('image-b', { imageSettings: { ...DEFAULT_IMAGE_SETTINGS, model: 'phan-image2', ratio: '1:1' } })
  store.patch('image-a', { imageSettings: { ...store.get1('image-a').imageSettings!, model: 'doubao-seedream-5.0-lite' } })
  expect(store.get1('image-a').imageSettings).toEqual({ model: 'doubao-seedream-5.0-lite', ratio: '9:16', resolution: '2K', count: 4 })
  expect(store.get1('image-b').imageSettings?.model).toBe('phan-image2')
  expect(store.get1('image-b').imageSettings?.ratio).toBe('1:1')
  expect(store.get1('image-a').params).toEqual(videoParams)
})

it('输出尺寸遵循用户选择的长边分辨率和画幅', () => {
  expect(imageDimensions({ ...DEFAULT_IMAGE_SETTINGS, ratio: '9:16', resolution: '2K', count: 4 })).toEqual({ width: 1152, height: 2048 })
  expect(imageDimensions({ ...DEFAULT_IMAGE_SETTINGS, ratio: '1:1', resolution: '4K' })).toEqual({ width: 4096, height: 4096 })
})

it('旧型号退回默认型号，旧草稿默认一张', () => {
  expect(resolveImageSettings({ model: 'midjourney-t2i', ratio: '3:4' })).toEqual({ ...DEFAULT_IMAGE_SETTINGS, ratio: '3:4' })
})
