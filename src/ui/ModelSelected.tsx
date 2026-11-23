/** 模型列表的选中标记：轻底圆形承托，圆角勾保持视觉居中。 */
export default function ModelSelected() {
  return <svg className="mdl-tick" width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <circle cx="10" cy="10" r="9" fill="currentColor" fillOpacity=".1" />
    <path d="m6 10 2.6 2.6L14 7.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
}
