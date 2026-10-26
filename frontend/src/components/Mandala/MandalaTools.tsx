import { Eraser, Paintbrush } from "lucide-react"
import { IslandButton } from "../IslandUI/IslandButton"
import styles from "./mandala.module.css"

export const PALETTE = [
  "#648b69",
  "#a9c697",
  "#397f85",
  "#a8cfd0",
  "#e4bd78",
  "#e9d9b7",
  "#cf8e75",
  "#ddb3ad",
  "#af99b9",
  "#697791",
  "#65523c",
  "#ffffff",
]
export function MandalaTools({
  color,
  onColor,
  mode,
  erase,
  onErase,
  width,
  onWidth,
  opacity,
  onOpacity,
}: {
  color: string
  onColor: (color: string) => void
  mode: "coloring" | "symmetry"
  erase: boolean
  onErase: (erase: boolean) => void
  width: number
  onWidth: (width: number) => void
  opacity: number
  onOpacity: (opacity: number) => void
}) {
  return (
    <>
      <h2 className={styles.toolHeading}>把喜欢的颜色留下</h2>
      <div className={styles.swatches} role="toolbar" aria-label="调色板">
        {PALETTE.map((value) => (
          <IslandButton
            key={value}
            className={styles.swatch}
            style={{ background: value }}
            aria-label={`颜色 ${value}`}
            aria-pressed={color === value && !erase}
            onClick={() => {
              onColor(value)
              onErase(false)
            }}
          />
        ))}
      </div>
      <div className={styles.colorRow}>
        <label className={styles.customColor}>
          自选颜色
          <input
            aria-label="自选颜色"
            type="color"
            value={color}
            onChange={(event) => {
              onColor(event.target.value)
              onErase(false)
            }}
          />
        </label>
        {mode === "coloring" && (
          <IslandButton
            aria-label={erase ? "切换填色工具" : "恢复区域默认颜色"}
            aria-pressed={erase}
            onClick={() => onErase(!erase)}
          >
            {erase ? <Paintbrush size={16} /> : <Eraser size={16} />}
            <span>{erase ? "填色" : "还原"}</span>
          </IslandButton>
        )}
      </div>
      {mode === "symmetry" && (
        <div className={styles.brushControls}>
          <label>
            画笔 <output>{width}</output>
            <input
              aria-label="画笔宽度"
              type="range"
              min="1"
              max="24"
              value={width}
              onChange={(event) => onWidth(+event.target.value)}
            />
          </label>
          <label>
            不透明度 <output>{opacity}%</output>
            <input
              aria-label="画笔不透明度"
              type="range"
              min="10"
              max="100"
              value={opacity}
              onChange={(event) => onOpacity(+event.target.value)}
            />
          </label>
        </div>
      )}
      <p className={styles.toolsHint}>
        {mode === "coloring"
          ? "轻点区域填色。细小的地方，放大后再慢慢来。"
          : "按住画布画一笔，看看它如何向四周展开。"}
      </p>
    </>
  )
}
