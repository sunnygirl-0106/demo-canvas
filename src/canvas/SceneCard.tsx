import { IcClose } from '../ui/icons'
import type { SceneHint } from '../demo/scenes'

/**
 * 走查用的要点卡，钉在顶栏下方、画布左上角。
 *
 * 示例的要点不写进顶栏那张菜单：一条条列进去，菜单就长到要滚两屏，
 * 而要点是进了这个示例之后才要对照的东西 —— 该和画布摆在一起，不是和入口摆在一起。
 * 切示例就换一张，点「节点示例」就没有；关掉之后画布还是这个示例，只是不再提示。
 */
export default function SceneCard({ hint, onClose }: { hint: SceneHint; onClose: () => void }) {
  return <aside className="scene-card nodrag nowheel" aria-label={`示例要点：${hint.title}`}>
    <header>
      <h4>{hint.title}</h4>
      <button aria-label="关闭示例要点" onClick={onClose}><IcClose size={13} sw={1.6} /></button>
    </header>
    <p className="scene-card-lead">应看到</p>
    <ul>{hint.checks.map((c, i) => <li key={i}>{c}</li>)}</ul>
  </aside>
}
