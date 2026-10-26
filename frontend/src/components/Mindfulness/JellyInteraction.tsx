import { useFrame, useThree } from "@react-three/fiber"
import { type ReactNode, useCallback, useEffect, useMemo, useRef } from "react"
import { type Group, MathUtils, type Object3D } from "three"
import {
  advanceSpring,
  JELLY_CONFIG,
  pressSpring,
  spring,
} from "./jelly-spring"

type Part = {
  object: Object3D
  x: number
  z: number
  weight: number
  motion: ReturnType<typeof spring>
}

const WEIGHTS: Record<string, number> = {
  foliage: 1,
  trunk: 0.12,
  terrain: 0.04,
  water: 0.035,
  rock: 0.025,
}

export function JellyInteraction({
  model,
  bottom,
  playing,
  reducedMotion,
  simplified,
  onDragChange,
  children,
}: {
  model: Group
  bottom: number
  playing: boolean
  reducedMotion: boolean
  simplified: boolean
  onDragChange: (dragging: boolean) => void
  children?: ReactNode
}) {
  const root = useRef<Group>(null)
  const { invalidate } = useThree()
  const state = useMemo(
    () => ({ press: spring(), tiltX: spring(), tiltZ: spring(), time: 0 }),
    [],
  )
  const drag = useRef<{
    id: number
    x: number
    y: number
    dx: number
    dy: number
    target: Pick<
      Element,
      "setPointerCapture" | "releasePointerCapture" | "hasPointerCapture"
    >
  } | null>(null)
  const hover = useRef<Part | undefined>(undefined)
  const parts = useMemo(() => {
    const result: Part[] = []
    model.traverse((object) => {
      const kind = object.userData.jelly_kind as string | undefined
      if (!kind || (simplified && kind !== "foliage")) return
      result.push({
        object,
        x: object.rotation.x,
        z: object.rotation.z,
        weight: WEIGHTS[kind] ?? 0,
        motion: spring(),
      })
    })
    return result
  }, [model, simplified])
  const findPart = (object: Object3D) => {
    let current: Object3D | null = object
    while (current) {
      const part = parts.find((item) => item.object === current)
      if (part) return part
      current = current.parent
    }
  }
  const release = useCallback(() => {
    const active = drag.current
    drag.current = null
    if (active?.target.hasPointerCapture(active.id))
      active.target.releasePointerCapture(active.id)
    onDragChange(false)
    invalidate()
  }, [invalidate, onDragChange])
  useEffect(() => {
    const finish = () => release()
    window.addEventListener("pointerup", finish)
    window.addEventListener("pointercancel", finish)
    window.addEventListener("blur", finish)
    return () => {
      window.removeEventListener("pointerup", finish)
      window.removeEventListener("pointercancel", finish)
      window.removeEventListener("blur", finish)
    }
  }, [release])
  useEffect(() => {
    if (!reducedMotion) return
    state.press.value = state.press.velocity = 0
    state.tiltX.value = state.tiltX.velocity = 0
    state.tiltZ.value = state.tiltZ.velocity = 0
    for (const part of parts) part.motion.value = part.motion.velocity = 0
    invalidate()
  }, [invalidate, parts, reducedMotion, state])
  useFrame((_, delta) => {
    const group = root.current
    if (!group) return
    const dt = Math.min(delta, 0.05)
    state.time += dt
    let active = false
    if (!reducedMotion) {
      active = advanceSpring(state.press, 0, dt)
      active = advanceSpring(state.tiltX, drag.current?.dy ?? 0, dt) || active
      active = advanceSpring(state.tiltZ, drag.current?.dx ?? 0, dt) || active
    }
    const breathing =
      playing && !reducedMotion ? Math.sin(state.time * 0.8) * 0.002 : 0
    group.scale.set(
      1 - state.press.value * 0.35,
      1 + state.press.value + breathing,
      1 - state.press.value * 0.35,
    )
    group.rotation.set(state.tiltX.value, 0, state.tiltZ.value)
    for (const part of parts) {
      if (!reducedMotion)
        active =
          advanceSpring(
            part.motion,
            hover.current === part
              ? JELLY_CONFIG.hoverResponse * part.weight
              : 0,
            dt,
          ) || active
      const sway =
        playing && !reducedMotion
          ? Math.sin(state.time * 0.7 + part.x) * 0.006 * part.weight
          : 0
      part.object.rotation.x =
        part.x + part.motion.value * part.weight * 0.55 + sway
      part.object.rotation.z = part.z + part.motion.value * part.weight * 0.8
    }
    if (active) invalidate()
    // Exposed on the canvas for scene diagnostics without per-frame React state.
    group.userData.displacement = state.press.value
  })
  return (
    <group
      ref={root}
      name="Rainforest_Jelly"
      position={[0, bottom, 0]}
      onPointerOver={(event) => {
        event.stopPropagation()
        hover.current = findPart(event.object)
        invalidate()
      }}
      onPointerOut={() => {
        hover.current = undefined
        invalidate()
      }}
      onPointerDown={(event) => {
        if (event.button !== 0 || drag.current) return
        // R3F supplies a capture facade; DOM EventTarget types omit its methods.
        const target = event.target as Element | null
        if (!target) return
        event.stopPropagation()
        onDragChange(true)
        drag.current = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          dx: 0,
          dy: 0,
          target,
        }
        target.setPointerCapture(event.pointerId)
        if (!reducedMotion) {
          pressSpring(state.press)
          const part = findPart(event.object)
          if (part) pressSpring(part.motion, Math.max(0.2, part.weight))
        }
        invalidate()
      }}
      onPointerMove={(event) => {
        const active = drag.current
        if (!active || event.pointerId !== active.id) return
        event.stopPropagation()
        if (reducedMotion) return
        active.dx = MathUtils.clamp(
          (active.x - event.clientX) * 0.0005,
          -JELLY_CONFIG.wobbleAmplitude,
          JELLY_CONFIG.wobbleAmplitude,
        )
        active.dy = MathUtils.clamp(
          (event.clientY - active.y) * 0.0005,
          -JELLY_CONFIG.wobbleAmplitude,
          JELLY_CONFIG.wobbleAmplitude,
        )
        invalidate()
      }}
      onPointerUp={(event) => {
        if (drag.current?.id === event.pointerId) {
          event.stopPropagation()
          release()
        }
      }}
      onLostPointerCapture={() => {
        if (drag.current) release()
      }}
    >
      <group position={[0, -bottom, 0]}>
        <primitive object={model} dispose={null} />
        {children}
      </group>
    </group>
  )
}
