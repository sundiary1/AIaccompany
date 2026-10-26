import {
  type PointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react"
import styles from "./mandala.module.css"
import {
  type Axes,
  MAX_POINTS,
  MAX_STROKE_POINTS,
  MAX_STROKES,
  type Stroke,
} from "./mandala-data"
import { drawStrokes, normalizePoint } from "./symmetry-engine"

export function SymmetryCanvas({
  strokes,
  color,
  width,
  opacity,
  folds,
  mirror,
  onStroke,
  onLimit,
  blocked,
}: {
  strokes: Stroke[]
  color: string
  width: number
  opacity: number
  folds: Axes
  mirror: boolean
  onStroke: (stroke: Stroke) => void
  onLimit: () => void
  blocked: () => boolean
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const cache = useRef<HTMLCanvasElement | null>(null)
  const active = useRef<{ id: number; stroke: Stroke } | null>(null)
  const frame = useRef(0)
  const previous = useRef<Stroke[]>([])
  const pointCount = strokes.reduce(
    (count, stroke) => count + stroke.pts.length,
    0,
  )
  const render = useCallback(() => {
    const element = canvas.current
    const context = element?.getContext("2d")
    if (!element || !context) return
    context.clearRect(0, 0, element.width, element.height)
    context.fillStyle = "#ffffff"
    context.fillRect(0, 0, element.width, element.height)
    if (cache.current) context.drawImage(cache.current, 0, 0)
    if (active.current)
      drawStrokes(context, [active.current.stroke], element.width)
  }, [])
  const schedule = () => {
    if (frame.current) return
    frame.current = requestAnimationFrame(() => {
      frame.current = 0
      render()
    })
  }
  useLayoutEffect(() => {
    const element = canvas.current!
    const stored = document.createElement("canvas")
    cache.current = stored
    const observer = new ResizeObserver(([entry]) => {
      const size = Math.max(
        1,
        Math.min(
          1200,
          Math.round(
            entry.contentRect.width * Math.min(2, window.devicePixelRatio || 1),
          ),
        ),
      )
      element.width = element.height = stored.width = stored.height = size
      const context = stored.getContext("2d")
      if (context) drawStrokes(context, previous.current, size)
      render()
    })
    observer.observe(element)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame.current)
      frame.current = 0
      cache.current = null
    }
  }, [render])
  useEffect(() => {
    const stored = cache.current
    const context = stored?.getContext("2d")
    if (stored && context) {
      const append =
        strokes.length === previous.current.length + 1 &&
        previous.current.every((stroke, i) => stroke === strokes[i])
      if (!append) context.clearRect(0, 0, stored.width, stored.height)
      drawStrokes(context, append ? strokes.slice(-1) : strokes, stored.width)
    }
    previous.current = strokes
    active.current = null
    render()
  }, [strokes, render])
  const point = (event: { clientX: number; clientY: number }) => {
    const bounds = canvas.current!.getBoundingClientRect()
    return normalizePoint(
      event.clientX,
      event.clientY,
      bounds.left,
      bounds.top,
      bounds.width,
    )
  }
  const end = (event: PointerEvent<HTMLCanvasElement>, cancelled = false) => {
    if (active.current?.id !== event.pointerId) return
    const stroke = active.current.stroke
    active.current = null
    if (!cancelled && !blocked()) onStroke(stroke)
    schedule()
  }
  return (
    <canvas
      ref={canvas}
      className={styles.symmetryCanvas}
      data-testid="symmetry-canvas"
      aria-label="对称绘画画布，可用鼠标、触摸或触控笔绘制"
      onPointerDown={(event) => {
        if (event.button > 0 || blocked() || !event.isPrimary) {
          active.current = null
          schedule()
          return
        }
        if (strokes.length >= MAX_STROKES || pointCount >= MAX_POINTS) {
          onLimit()
          return
        }
        event.currentTarget.setPointerCapture(event.pointerId)
        active.current = {
          id: event.pointerId,
          stroke: {
            pts: [point(event)],
            w: +(width / 300).toFixed(4),
            a: opacity / 100,
            color,
            folds,
            mirror,
          },
        }
        schedule()
        event.preventDefault()
      }}
      onPointerMove={(event) => {
        if (
          !active.current ||
          active.current.id !== event.pointerId ||
          blocked()
        )
          return
        const stroke = active.current.stroke
        const samples = event.nativeEvent.getCoalescedEvents?.()
        for (const sample of samples?.length ? samples : [event]) {
          if (
            stroke.pts.length >= MAX_STROKE_POINTS ||
            pointCount + stroke.pts.length >= MAX_POINTS
          )
            break
          const next = point(sample),
            last = stroke.pts[stroke.pts.length - 1]
          if (Math.hypot(next[0] - last[0], next[1] - last[1]) > 0.004)
            stroke.pts.push(next)
        }
        schedule()
      }}
      onPointerUp={(event) => end(event)}
      onPointerCancel={(event) => end(event, true)}
      onLostPointerCapture={(event) => {
        if (active.current?.id === event.pointerId) {
          active.current = null
          schedule()
        }
      }}
    />
  )
}
