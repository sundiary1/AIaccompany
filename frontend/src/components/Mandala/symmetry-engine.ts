/** Adapted from evoluteur/mandala-maker, MIT, Olivier Giulieri (2026).
 * Commit bbc8f445af13d68a21b81d49b469a71fb6055bdb, js/mandala.js:
 * traceSmooth, drawStrokeOnce, drawStrokes, toStrokeCoords and savePng.
 * License: /licenses/mandala-maker-MIT.txt. No upstream DOM/global persistence.
 * Each stroke now retains its own folds/mirror; solid brush only.
 */
import type { Point, Stroke } from "./mandala-data"

export function normalizePoint(
  x: number,
  y: number,
  left: number,
  top: number,
  width: number,
): Point {
  const radius = (width / 2) * 0.98
  return [
    +Math.max(-1.05, Math.min(1.05, (x - left - width / 2) / radius)).toFixed(
      4,
    ),
    +Math.max(-1.05, Math.min(1.05, (y - top - width / 2) / radius)).toFixed(4),
  ]
}

function traceSmooth(context: CanvasRenderingContext2D, points: Point[]) {
  context.beginPath()
  context.moveTo(points[0][0], points[0][1])
  if (points.length === 1) {
    context.lineTo(points[0][0] + 0.0001, points[0][1])
    return
  }
  for (let i = 1; i < points.length - 1; i++) {
    const mx = (points[i][0] + points[i + 1][0]) / 2
    const my = (points[i][1] + points[i + 1][1]) / 2
    context.quadraticCurveTo(points[i][0], points[i][1], mx, my)
  }
  const last = points[points.length - 1]
  context.lineTo(last[0], last[1])
}

export function drawStrokes(
  context: CanvasRenderingContext2D,
  list: readonly Stroke[],
  size: number,
) {
  const radius = (size / 2) * 0.98
  context.save()
  context.translate(size / 2, size / 2)
  context.scale(radius, radius)
  for (const stroke of list) {
    for (let k = 0; k < stroke.folds; k++) {
      for (let mirror = 0; mirror < (stroke.mirror ? 2 : 1); mirror++) {
        context.save()
        context.rotate((2 * Math.PI * k) / stroke.folds)
        if (mirror) context.scale(1, -1)
        context.lineWidth = stroke.w
        context.lineCap = "round"
        context.lineJoin = "round"
        context.globalAlpha = stroke.a
        context.strokeStyle = stroke.color
        traceSmooth(context, stroke.pts)
        context.stroke()
        context.restore()
      }
    }
  }
  context.restore()
}
