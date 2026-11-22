export const IMAGE_MODELS = [
  { id: 'doubao-seedream-5.0-lite', label: 'Doubao-seedream-5.0-lite' },
  { id: 'phan-image2', label: 'Phan image2' },
  { id: 'doubao-seedream-4.5', label: 'Doubao-seedream-4.5' },
  { id: 'seedream-4.0', label: 'Seedream 4.0' },
  { id: 'phan-nano', label: 'Phan nano Image 3 Pro' },
] as const
export const IMAGE_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4'] as const
export const IMAGE_RESOLUTIONS = ['1K', '2K', '4K'] as const
export const IMAGE_COUNTS = [1, 2, 4] as const
export interface ImageSettings {
  model: typeof IMAGE_MODELS[number]['id']
  ratio: typeof IMAGE_RATIOS[number]
  resolution: typeof IMAGE_RESOLUTIONS[number]
  count: typeof IMAGE_COUNTS[number]
}
export const DEFAULT_IMAGE_SETTINGS: ImageSettings = { model: 'phan-nano', ratio: '16:9', resolution: '1K', count: 1 }

/** 兼容旧草稿：已删除的型号回到默认型号，尚未设置数量时使用一张。 */
export function resolveImageSettings(saved?: Partial<Omit<ImageSettings, 'model'>> & { model?: string }): ImageSettings {
  return { ...DEFAULT_IMAGE_SETTINGS, ...saved,
    model: IMAGE_MODELS.find((m) => m.id === saved?.model)?.id ?? DEFAULT_IMAGE_SETTINGS.model,
    count: saved?.count && IMAGE_COUNTS.includes(saved.count) ? saved.count : 1 }
}

export function imageDimensions(settings: ImageSettings) {
  const [w, h] = settings.ratio.split(':').map(Number)
  const long = { '1K': 1024, '2K': 2048, '4K': 4096 }[settings.resolution]
  return { width: Math.round(long * w / Math.max(w, h)), height: Math.round(long * h / Math.max(w, h)) }
}
