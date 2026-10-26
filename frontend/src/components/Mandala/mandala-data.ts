import { getTemplate } from "./templates"

export const AXES = [6, 8, 12, 16] as const
export type Axes = (typeof AXES)[number]
export type Point = [number, number]
export type Stroke = {
  pts: Point[]
  w: number
  a: number
  color: string
  folds: Axes
  mirror: boolean
}
export type ColoringWork = {
  version: 1
  mode: "coloring"
  templateId: string
  fills: Record<string, string>
}
export type SymmetryWork = { version: 1; mode: "symmetry"; strokes: Stroke[] }
export type MandalaWork = ColoringWork | SymmetryWork
export const MAX_STROKES = 300
export const MAX_POINTS = 18000
export const MAX_STROKE_POINTS = 1800
export const isColor = (value: unknown): value is string =>
  typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
const finite = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= min &&
  value <= max

/** Versioned, bounded data only. This is also the future persistence boundary. */
export function validateWork(value: unknown): MandalaWork {
  if (!record(value) || value.version !== 1) throw new Error("不支持的作品版本")
  if (value.mode === "coloring") {
    const template =
      typeof value.templateId === "string" && getTemplate(value.templateId)
    if (!template || !record(value.fills)) throw new Error("无效的涂色作品")
    const ids = new Set(template.regions.map((region) => region.id))
    const fills: Record<string, string> = {}
    for (const [id, color] of Object.entries(value.fills)) {
      if (!ids.has(id) || !isColor(color))
        throw new Error("无效的填色区域或颜色")
      fills[id] = color
    }
    return { version: 1, mode: "coloring", templateId: template.id, fills }
  }
  if (
    value.mode !== "symmetry" ||
    !Array.isArray(value.strokes) ||
    value.strokes.length > MAX_STROKES
  )
    throw new Error("无效的对称作品")
  let total = 0
  const strokes: Stroke[] = value.strokes.map((stroke: unknown) => {
    if (
      !record(stroke) ||
      !Array.isArray(stroke.pts) ||
      !stroke.pts.length ||
      stroke.pts.length > MAX_STROKE_POINTS ||
      !isColor(stroke.color) ||
      !finite(stroke.w, 0.001, 0.1) ||
      !finite(stroke.a, 0.05, 1) ||
      !AXES.includes(stroke.folds as Axes) ||
      typeof stroke.mirror !== "boolean"
    )
      throw new Error("无效的笔画参数")
    total += stroke.pts.length
    if (total > MAX_POINTS) throw new Error("作品点数超出限制")
    const pts: Point[] = stroke.pts.map((point: unknown) => {
      if (
        !Array.isArray(point) ||
        point.length !== 2 ||
        !finite(point[0], -1.05, 1.05) ||
        !finite(point[1], -1.05, 1.05)
      )
        throw new Error("无效的笔画坐标")
      return [point[0], point[1]]
    })
    return {
      pts,
      color: stroke.color,
      w: stroke.w,
      a: stroke.a,
      folds: stroke.folds as Axes,
      mirror: stroke.mirror,
    }
  })
  return { version: 1, mode: "symmetry", strokes }
}

export function serializeWork(work: MandalaWork) {
  return JSON.stringify(validateWork(work))
}
