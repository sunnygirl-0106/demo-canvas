import { useGenerator } from '../store/generator'
import { useCanvas } from '../store/canvas'
import { FAKE_TEXT } from '../demo/assets'
import { fakeGen } from '../demo/fake'
import BottomBar from './BottomBar'
import PromptBox from './PromptBox'
import { docText } from './promptDoc'
import { IcChev } from '../ui/icons'

/** 文本节点面板：无模式 Tab、无素材区 */
export default function TextPanel({ nodeId }: { nodeId: string }) {
  const gen = useGenerator((s) => s.map[nodeId])
  const patch = useGenerator((s) => s.patch)
  const busy = useCanvas((s) => s.nodes.find((n) => n.id === nodeId)?.data.busy)

  return (
    <>
      <PromptBox
        /* 这一栏没有标签，整块就是一段文字 —— ver 固定，挂上之后交给用户自己编辑 */
        doc={[{ t: 'text', v: gen?.prompt ?? '' }]}
        ver={nodeId}
        onDoc={(doc) => patch(nodeId, { doc, prompt: docText(doc, {}) })}
        renderSeg={() => null}
        placeholder="帮我把这段重逢对白润色得更克制一些，少用形容词，留白多一点"
        mats={[]}
      />
      <BottomBar
        cost={50}
        busy={!!busy}
        onSend={() => fakeGen(nodeId, 1200, { text: FAKE_TEXT })}
        left={
          <div className="gp-model"><i className="model-dot" />灵犀3.1 pro<IcChev size={13} color="var(--ink-2)" sw={2} /></div>
        }
      />
    </>
  )
}
