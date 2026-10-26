import styles from "./mandala.module.css"
import type { ColoringWork } from "./mandala-data"
import { getTemplate } from "./templates"

export function ColoringCanvas({
  work,
  color,
  erase,
  onChange,
  blocked,
}: {
  work: ColoringWork
  color: string
  erase: boolean
  onChange: (work: ColoringWork) => void
  blocked: () => boolean
}) {
  const template = getTemplate(work.templateId)!
  const paint = (id: string) => {
    if (blocked()) return
    const fills = { ...work.fills }
    if (erase) delete fills[id]
    else fills[id] = color
    if (JSON.stringify(fills) !== JSON.stringify(work.fills))
      onChange({ ...work, fills })
  }
  return (
    <svg
      className={styles.coloringCanvas}
      viewBox="0 0 600 600"
      aria-label={`${template.name}，可逐区填色的曼陀罗`}
    >
      <title>{template.name}</title>
      {template.regions.map((region, index) => (
        // biome-ignore lint/a11y/useSemanticElements: SVG regions require paths; keyboard activation is provided.
        <path
          key={region.id}
          d={region.d}
          data-region={region.id}
          fill={work.fills[region.id] || "#ffffff"}
          stroke="#788572"
          strokeWidth="1.4"
          strokeLinejoin="round"
          role="button"
          tabIndex={0}
          aria-label={`填色区域 ${index + 1}`}
          onClick={() => paint(region.id)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault()
              paint(region.id)
            }
          }}
        />
      ))}
    </svg>
  )
}
