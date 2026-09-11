import { visibleTabs, type Mode, type Model } from './materialLayout'

interface Props {
  mode: Mode
  model: Model
  onPick: (m: Mode) => void
}

export default function ModeTabs({ mode, model, onPick }: Props) {
  return (
    <div className="gp-tabrow">
      <div className="gp-tabs">
        {visibleTabs(model).map((t) => (
          <button key={t.k} className={'gp-tab ' + (mode === t.k ? 'on' : '')}
                  onClick={() => onPick(t.k)}>{t.label}</button>
        ))}
      </div>

    </div>
  )
}
