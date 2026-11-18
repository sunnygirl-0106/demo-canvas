import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import MarkArt from './MarkArt'
import type { MarkRegion } from './marks'

describe('画笔坐标与视频画幅', () => {
  it.each([16 / 9, 9 / 16, 1])('画幅 %s 的顶部和底部笔迹与归一化指针位置重合', (aspect) => {
    const region: MarkRegion = { t: 0, tool: 'brush', rect: [0.25, 0, 0.5, 1],
      strokes: [[[0.25, 0], [0.75, 1]]] }
    const html = renderToStaticMarkup(<MarkArt regions={[region]} aspect={aspect} />)
    const viewBox = html.match(/viewBox="([^"]+)"/)![1].split(' ').map(Number)
    const points = html.match(/points="([^"]+)"/)![1].split(' ').map((p) => p.split(',').map(Number))
    // SVG 的比例必须与视频一致，否则浏览器会将笔迹居中压缩到另一块区域。
    expect(viewBox[2] / viewBox[3]).toBeCloseTo(aspect)
    expect(points[0][0] / viewBox[2]).toBeCloseTo(0.25)
    expect(points[0][1]).toBe(0)
    expect(points[1][0] / viewBox[2]).toBeCloseTo(0.75)
    expect(points[1][1] / viewBox[3]).toBeCloseTo(1)
  })
})
