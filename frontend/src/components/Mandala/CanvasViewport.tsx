import { Minus, Plus, RotateCcw } from "lucide-react"
import { type ReactNode, useRef, useState } from "react"
import { IslandButton } from "../IslandUI/IslandButton"
import styles from "./mandala.module.css"

export function CanvasViewport({
  children,
}: {
  children: (blocked: () => boolean) => ReactNode
}) {
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const until = useRef(0)
  const gestured = useRef(false)
  const mousePan = useRef<{
    id: number
    x: number
    y: number
    pan: typeof pan
  } | null>(null)
  const pinch = useRef<{
    distance: number
    zoom: number
    x: number
    y: number
    pan: typeof pan
  } | null>(null)
  const blocked = () => gestured.current || performance.now() < until.current
  const pair = () => {
    const [a, b] = [...pointers.current.values()]
    return {
      distance: Math.hypot(a.x - b.x, a.y - b.y),
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
    }
  }
  const end = (id: number) => {
    if (gestured.current) until.current = performance.now() + 250
    if (mousePan.current?.id === id) mousePan.current = null
    pointers.current.delete(id)
    if (!pointers.current.size) gestured.current = false
    if (pointers.current.size < 2) pinch.current = null
  }
  return (
    <div className={styles.canvasArea}>
      <div
        className={styles.viewport}
        data-testid="mandala-viewport"
        onPointerDownCapture={(event) => {
          pointers.current.set(event.pointerId, {
            x: event.clientX,
            y: event.clientY,
          })
          if (event.button === 1) {
            gestured.current = true
            mousePan.current = {
              id: event.pointerId,
              x: event.clientX,
              y: event.clientY,
              pan,
            }
            event.currentTarget.setPointerCapture(event.pointerId)
            event.preventDefault()
          }
          if (pointers.current.size === 2) {
            gestured.current = true
            pinch.current = { ...pair(), zoom, pan }
            event.currentTarget.setPointerCapture(event.pointerId)
          }
        }}
        onPointerMoveCapture={(event) => {
          const drag = mousePan.current
          if (drag?.id === event.pointerId) {
            setPan({
              x: Math.max(
                -400,
                Math.min(400, drag.pan.x + event.clientX - drag.x),
              ),
              y: Math.max(
                -400,
                Math.min(400, drag.pan.y + event.clientY - drag.y),
              ),
            })
            return
          }
          if (!pointers.current.has(event.pointerId)) return
          pointers.current.set(event.pointerId, {
            x: event.clientX,
            y: event.clientY,
          })
          if (!pinch.current || pointers.current.size !== 2) return
          const next = pair()
          const start = pinch.current
          setZoom(
            Math.max(
              1,
              Math.min(
                3,
                (start.zoom * next.distance) / Math.max(1, start.distance),
              ),
            ),
          )
          setPan({
            x: Math.max(-400, Math.min(400, start.pan.x + next.x - start.x)),
            y: Math.max(-400, Math.min(400, start.pan.y + next.y - start.y)),
          })
        }}
        onPointerUpCapture={(event) => end(event.pointerId)}
        onPointerCancelCapture={(event) => end(event.pointerId)}
      >
        <div
          className={styles.paper}
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        >
          {children(blocked)}
        </div>
      </div>
      <div className={styles.zoomTools} role="toolbar" aria-label="画布缩放">
        <IslandButton
          aria-label="缩小画布"
          disabled={zoom <= 1}
          onClick={() => setZoom(Math.max(1, zoom - 0.25))}
        >
          <Minus size={15} />
        </IslandButton>
        <output aria-live="polite">{Math.round(zoom * 100)}%</output>
        <IslandButton
          aria-label="放大画布"
          disabled={zoom >= 3}
          onClick={() => setZoom(Math.min(3, zoom + 0.25))}
        >
          <Plus size={15} />
        </IslandButton>
        <IslandButton
          aria-label="复位画布"
          onClick={() => {
            setZoom(1)
            setPan({ x: 0, y: 0 })
          }}
        >
          <RotateCcw size={14} />
        </IslandButton>
      </div>
    </div>
  )
}
