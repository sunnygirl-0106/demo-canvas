import type { ToolKind } from '../store/canvas'

const paths = {
  box: 'M2 9a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z M8 7V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2 M2 13h20 M8 11.5v3 M16 11.5v3',
  mocap: 'M12 2a2 2 0 1 0 0 4a2 2 0 0 0 0-4 M4 8l8 2 8-2 M12 6v8 M6 22l6-8 6 8',
  upscale: 'M3 5h18v14H3z M6 9v6 M10 9v6 M6 12h4 M14 9v6h2a3 3 0 0 0 0-6z',
}
export default function ToolIcon({ kind }: { kind: ToolKind | 'box' }) {
  return <svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={paths[kind]} /></svg>
}
