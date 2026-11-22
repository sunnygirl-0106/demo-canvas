import { useGenerator } from '../store/generator'
import { useCanvas } from '../store/canvas'
import { fakeImageGen } from '../demo/fake'
import BottomBar from './BottomBar'
import PromptBox from './PromptBox'
import { docText } from './promptDoc'
import { IcCamera } from '../ui/icons'
import ImageSettings from './ImageSettings'
import { resolveImageSettings } from './imageOptions'

/** 图片节点面板：无模式 Tab、无素材区 */
export default function ImagePanel({ nodeId }: { nodeId: string }) {
  const gen = useGenerator((s) => s.map[nodeId])
  const patch = useGenerator((s) => s.patch)
  const busy = useCanvas((s) => s.nodes.find((n) => n.id === nodeId)?.data.busy)
  const settings = resolveImageSettings(gen?.imageSettings)

  return (
    <>
      <PromptBox
        /* 这一栏没有标签，整块就是一段文字 —— ver 固定，挂上之后交给用户自己编辑 */
        doc={[{ t: 'text', v: gen?.prompt ?? '' }]}
        ver={nodeId}
        onDoc={(doc) => patch(nodeId, { doc, prompt: docText(doc, {}) })}
        renderSeg={() => null}
        placeholder="描述你想要生成的图片，输入 @ 引用素材"
        mats={[]}
      />
      <BottomBar
        cost={94 * settings.count}
        busy={!!busy}
        onSend={() => fakeImageGen(nodeId, settings)}
        left={
          <>
            <ImageSettings nodeId={nodeId} />
            <div className="gp-chip"><IcCamera size={12} />摄像机</div>
          </>
        }
      />
    </>
  )
}
