import { IcCursor, IcFolder, IcGrid, IcHistory, IcKeyboard, IcPlus } from '../ui/icons'

export default function LeftDock({ onAdd }: { onAdd: (e: React.MouseEvent) => void }) {
  return (
    <div className="dock">
      <button className="dock-b prim" onClick={onAdd} title="添加节点"><IcPlus size={18} /></button>
      <div className="dock-sep" />
      <button className="dock-b"><IcFolder size={17} /></button>
      <button className="dock-b"><IcGrid size={17} /></button>
      <button className="dock-b"><IcHistory size={17} /></button>
      <button className="dock-b"><IcCursor size={17} /></button>
      <div className="dock-sep" />
      <button className="dock-b"><IcKeyboard size={17} /></button>
    </div>
  )
}
