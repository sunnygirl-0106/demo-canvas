import { IcModelCube } from './icons'

/** 图片与视频共用无底色、无外环的轻量立方体。 */
export default function ModelBadge({ size = 18 }: { size?: number }) {
  return <span className="model-glyph" aria-hidden="true" style={{ width: size, height: size }}>
    <IcModelCube size={size - 4} sw={1.75} />
  </span>
}
