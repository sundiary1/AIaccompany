import { Switch, Tabs, Tag } from "animal-island-ui"
import { IslandButton } from "../IslandUI/IslandButton"
import styles from "./mandala.module.css"
import { AXES, type Axes } from "./mandala-data"
import { type MandalaTemplate, TEMPLATES } from "./templates"

export function TemplatePreview({
  template,
  colored = false,
}: {
  template: MandalaTemplate
  colored?: boolean
}) {
  const colors = ["#dce9d0", "#b7d4d1", "#f1d8ac", "#e5b9ad"]
  return (
    <svg viewBox="0 0 600 600" aria-hidden="true" focusable="false">
      {template.regions.map((region, index) => (
        <path
          key={region.id}
          d={region.d}
          fill={colored ? colors[index % colors.length] : "white"}
          stroke="#8c9b81"
          strokeWidth="2"
        />
      ))}
    </svg>
  )
}

export function MandalaSettings({
  mode,
  templateId,
  onTemplate,
  folds,
  onFolds,
  mirror,
  onMirror,
}: {
  mode: "coloring" | "symmetry"
  templateId?: string
  onTemplate: (id: string) => void
  folds: Axes
  onFolds: (folds: Axes) => void
  mirror: boolean
  onMirror: (mirror: boolean) => void
}) {
  const patterns = (
    <div className={styles.templateGrid}>
      {TEMPLATES.map((template) => (
        <IslandButton
          key={template.id}
          className={styles.templateButton}
          aria-label={`选择图案 ${template.name}`}
          aria-pressed={templateId === template.id}
          onClick={() => onTemplate(template.id)}
        >
          <TemplatePreview template={template} />
          <span>{template.name}</span>
        </IslandButton>
      ))}
    </div>
  )
  const symmetry = (
    <div className={styles.symmetrySettings}>
      <p>对称轴数</p>
      <div className={styles.axes}>
        {AXES.map((axis) => (
          <IslandButton
            key={axis}
            aria-pressed={folds === axis}
            onClick={() => onFolds(axis)}
          >
            {axis}
          </IslandButton>
        ))}
      </div>
      <div className={styles.switchRow}>
        <span>镜像绘制</span>
        <Switch aria-label="镜像绘制" checked={mirror} onChange={onMirror} />
      </div>
      <Tag color="app-teal" variant="soft" size="small">
        每一笔，生长成一圈
      </Tag>
      <p className={styles.finePrint}>
        设置作用于下一笔，已有笔画保持原样。双指可缩放和移动画布。
      </p>
    </div>
  )
  return (
    <Tabs
      aria-label="创作设置"
      items={[
        {
          key: mode,
          label: mode === "coloring" ? "选择图案" : "对称设置",
          children: mode === "coloring" ? patterns : symmetry,
        },
      ]}
    />
  )
}
